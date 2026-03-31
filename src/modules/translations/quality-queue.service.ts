import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  Channel,
  ChannelModel,
  ConfirmChannel,
  ConsumeMessage,
} from 'amqplib';
import * as amqp from 'amqplib';
import { randomUUID } from 'crypto';
import { AppConfig } from '../../config/app.config.js';

const EXCHANGE = 'translations.quality';
const PROCESS_QUEUE = 'translations.quality.process';
const RETRY_QUEUE = 'translations.quality.retry';
const DLQ_QUEUE = 'translations.quality.dlq';
const PROCESS_KEY = 'process';
const RETRY_KEY = 'retry';
const DLQ_KEY = 'dlq';
const RETRY_DELAY_MS = 60_000;
const MAX_ATTEMPTS = 3;
const PREFETCH = 2;

export type QualityBatchMessage = {
  messageId: string;
  projectId: string;
  keyIds: string[];
  attempt: number;
  createdAt: string;
};

@Injectable()
export class QualityQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QualityQueueService.name);

  private conn: ChannelModel | null = null;
  private pubCh: ConfirmChannel | null = null;
  private consCh: Channel | null = null;
  private consumerTag: string | null = null;
  private url!: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const { rabbitmq } = this.configService.getOrThrow<AppConfig>('app');
    this.url = rabbitmq.url;

    const conn = await amqp.connect(this.url);
    this.conn = conn;

    conn.on('error', (err: unknown) => {
      this.logger.error(
        `Quality queue connection error: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    conn.on('close', () => {
      this.logger.warn('Quality queue connection closed');
    });

    this.pubCh = await conn.createConfirmChannel();
    this.consCh = await conn.createChannel();
    await this.consCh.prefetch(PREFETCH);

    await this.assertTopology();
    this.logger.log('Quality queue ready');
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  async publishBatch(projectId: string, keyIds: string[]): Promise<void> {
    const ch = this.pubCh;
    if (!ch) return; // best-effort: silently skip if not ready

    const message: QualityBatchMessage = {
      messageId: randomUUID(),
      projectId,
      keyIds,
      attempt: 0,
      createdAt: new Date().toISOString(),
    };

    const payload = Buffer.from(JSON.stringify(message), 'utf-8');
    ch.publish(EXCHANGE, PROCESS_KEY, payload, {
      contentType: 'application/json',
      deliveryMode: 2,
      messageId: message.messageId,
    });
    await ch.waitForConfirms();
  }

  async consumeBatches(
    handler: (msg: QualityBatchMessage) => Promise<void>,
  ): Promise<void> {
    const ch = this.requireConsumerChannel();

    if (this.consumerTag) {
      await ch.cancel(this.consumerTag);
      this.consumerTag = null;
    }

    const res = await ch.consume(
      PROCESS_QUEUE,
      (raw: ConsumeMessage | null) => {
        if (!raw) return;
        void this.handleMessage(raw, ch, handler);
      },
      { noAck: false },
    );

    this.consumerTag = res.consumerTag;
    this.logger.log(`Consumer attached: queue=${PROCESS_QUEUE}`);
  }

  private async handleMessage(
    raw: ConsumeMessage,
    ch: Channel,
    handler: (msg: QualityBatchMessage) => Promise<void>,
  ): Promise<void> {
    let parsed: QualityBatchMessage;
    try {
      const data: unknown = JSON.parse(raw.content.toString('utf-8'));
      if (!this.isQualityBatchMessage(data))
        throw new Error('Invalid message shape');
      parsed = data;
    } catch (e: unknown) {
      this.logger.warn(
        `Dropping invalid quality message: ${e instanceof Error ? e.message : String(e)}`,
      );
      ch.ack(raw);
      return;
    }

    try {
      await handler(parsed);
      ch.ack(raw);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const nextAttempt = parsed.attempt + 1;

      if (nextAttempt >= MAX_ATTEMPTS) {
        await this.publishDlq({ ...parsed, attempt: nextAttempt }, errMsg);
        ch.ack(raw);
        this.logger.warn(
          `Quality batch moved to DLQ: messageId=${parsed.messageId} reason=${errMsg}`,
        );
        return;
      }

      await this.publishRetry({ ...parsed, attempt: nextAttempt });
      ch.ack(raw);
      this.logger.warn(
        `Quality batch retry: messageId=${parsed.messageId} attempt=${nextAttempt} reason=${errMsg}`,
      );
    }
  }

  private async assertTopology(): Promise<void> {
    const pub = this.requirePubChannel();

    await pub.assertExchange(EXCHANGE, 'direct', { durable: true });
    await pub.assertQueue(PROCESS_QUEUE, { durable: true });
    await pub.assertQueue(RETRY_QUEUE, {
      durable: true,
      arguments: {
        'x-message-ttl': RETRY_DELAY_MS,
        'x-dead-letter-exchange': EXCHANGE,
        'x-dead-letter-routing-key': PROCESS_KEY,
      },
    });
    await pub.assertQueue(DLQ_QUEUE, { durable: true });

    await pub.bindQueue(PROCESS_QUEUE, EXCHANGE, PROCESS_KEY);
    await pub.bindQueue(RETRY_QUEUE, EXCHANGE, RETRY_KEY);
    await pub.bindQueue(DLQ_QUEUE, EXCHANGE, DLQ_KEY);

    this.logger.log(`Quality topology ready: exchange=${EXCHANGE}`);
  }

  private async publishRetry(message: QualityBatchMessage): Promise<void> {
    const ch = this.pubCh;
    if (!ch) return;
    const payload = Buffer.from(JSON.stringify(message), 'utf-8');
    ch.publish(EXCHANGE, RETRY_KEY, payload, {
      contentType: 'application/json',
      deliveryMode: 2,
      messageId: message.messageId,
    });
    await ch.waitForConfirms();
  }

  private async publishDlq(
    message: QualityBatchMessage,
    reason: string,
  ): Promise<void> {
    const ch = this.pubCh;
    if (!ch) return;
    const payload = Buffer.from(
      JSON.stringify({ ...message, reason }),
      'utf-8',
    );
    ch.publish(EXCHANGE, DLQ_KEY, payload, {
      contentType: 'application/json',
      deliveryMode: 2,
      messageId: message.messageId,
    });
    await ch.waitForConfirms();
  }

  private isQualityBatchMessage(v: unknown): v is QualityBatchMessage {
    if (!v || typeof v !== 'object') return false;
    const obj = v as Record<string, unknown>;
    return (
      typeof obj.messageId === 'string' &&
      typeof obj.projectId === 'string' &&
      Array.isArray(obj.keyIds) &&
      typeof obj.attempt === 'number' &&
      typeof obj.createdAt === 'string'
    );
  }

  private requirePubChannel(): ConfirmChannel {
    if (!this.pubCh)
      throw new Error('Quality queue publish channel not initialized');
    return this.pubCh;
  }

  private requireConsumerChannel(): Channel {
    if (!this.consCh)
      throw new Error('Quality queue consumer channel not initialized');
    return this.consCh;
  }

  private async close(): Promise<void> {
    try {
      if (this.consCh && this.consumerTag)
        await this.consCh.cancel(this.consumerTag);
    } catch {
      // ignore
    } finally {
      this.consumerTag = null;
    }

    try {
      if (this.consCh) await this.consCh.close();
    } catch {
      // ignore
    } finally {
      this.consCh = null;
    }

    try {
      if (this.pubCh) await this.pubCh.close();
    } catch {
      // ignore
    } finally {
      this.pubCh = null;
    }

    try {
      if (this.conn) await this.conn.close();
    } catch {
      // ignore
    } finally {
      this.conn = null;
    }
  }
}
