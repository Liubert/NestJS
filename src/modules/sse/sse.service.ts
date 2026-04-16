import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';

const SSE_CHANNEL = 'sse_events';
const HEARTBEAT_MS = 25_000;

export interface SseEvent {
  type: 'sandbox.changed' | 'quality.changed';
  projectId: string;
}

interface PgNotification {
  channel: string;
  payload: string;
}

interface PgPoolClient {
  on(event: 'notification', listener: (msg: PgNotification) => void): void;
  query(sql: string): Promise<unknown>;
  release(): void;
}

interface PgPool {
  connect(): Promise<PgPoolClient>;
}

@Injectable()
export class SseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SseService.name);
  private readonly bus = new Subject<SseEvent>();
  private pgClient: PgPoolClient | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    try {
      // Get a raw pg connection for LISTEN (must stay open)
      const driver = this.dataSource.driver as {
        master?: PgPool;
        pool?: PgPool;
      };
      const pool = driver.master ?? driver.pool;
      if (!pool) {
        this.logger.warn('No pg pool available for SSE LISTEN');
        return;
      }
      this.pgClient = await pool.connect();
      this.pgClient.on('notification', (msg: PgNotification) => {
        try {
          const payload = JSON.parse(msg.payload) as SseEvent;
          this.bus.next(payload);
        } catch {
          this.logger.warn(`Invalid SSE notification payload: ${msg.payload}`);
        }
      });
      await this.pgClient.query(`LISTEN ${SSE_CHANNEL}`);
      this.logger.log(`Listening on PostgreSQL channel "${SSE_CHANNEL}"`);
    } catch (e) {
      this.logger.error(
        `Failed to start pg LISTEN: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // Heartbeat keeps connections alive through proxies
    this.heartbeatTimer = setInterval(() => {
      this.bus.next({ type: 'sandbox.changed', projectId: '__heartbeat__' });
    }, HEARTBEAT_MS);
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pgClient) {
      this.pgClient.release();
      this.pgClient = null;
    }
    this.bus.complete();
  }

  /**
   * Subscribe to SSE events for a specific project.
   * Returns an Observable of MessageEvent suitable for @Sse() controllers.
   */
  subscribe(projectId: string): Observable<MessageEvent> {
    return this.bus.pipe(
      filter(
        (e) => e.projectId === projectId || e.projectId === '__heartbeat__',
      ),
      map(
        (e): MessageEvent => ({
          data:
            e.projectId === '__heartbeat__'
              ? { type: 'heartbeat' }
              : { type: e.type, projectId: e.projectId },
        }),
      ),
    );
  }

  /**
   * Fires pg_notify so all processes (API + quality worker) can emit SSE events.
   */
  async notify(type: SseEvent['type'], projectId: string): Promise<void> {
    const payload = JSON.stringify({ type, projectId });
    try {
      await this.dataSource.query(`SELECT pg_notify('${SSE_CHANNEL}', $1)`, [
        payload,
      ]);
    } catch (e) {
      this.logger.warn(
        `pg_notify failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
