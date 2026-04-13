import { Injectable, Logger } from '@nestjs/common';
import type { AuditEvent } from './audit-event.type.js';

/**
 * Writes structured audit events to stdout via NestJS Logger.
 *
 * Uses a dedicated 'AUDIT' context so audit lines are easily greppable
 * in container logs: `docker logs api | grep AUDIT`
 *
 * For now this is synchronous stdout — sufficient for a single-node setup.
 * If we ever need a persistent audit trail, swap this for a DB/queue sink.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('AUDIT');

  log(event: AuditEvent): void {
    this.logger.log(JSON.stringify(event));
  }
}
