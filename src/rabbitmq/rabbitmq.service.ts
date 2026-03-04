// src/rabbitmq/rabbitmq.service.ts
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
import { AppConfig } from '../config/app.config';

type RabbitRoutingConfig = {
  routingKeyProcess: string;
  routingKeyRetry: string;
  routingKeyDlq: string;
};

type RabbitTopologyConfig = AppConfig['rabbitmq'] & RabbitRoutingConfig;

export type OrderProcessMessage = {
  messageId: string; // UUID
  orderId: string;
  createdAt: string; // ISO
  attempt: number;
  correlationId?: string;
  producer?: string;
  eventName?: string;
};

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);

  private config!: RabbitTopologyConfig;

  private conn: ChannelModel | null = null;
  private pubCh: ConfirmChannel | null = null;
  private consCh: Channel | null = null;

  private consumerTag: string | null = null;
  private ready = false;

  constructor(private readonly configService: ConfigService) {}

  getMaxAttempts(): number {
    return this.config.maxAttempts;
  }

  isReady(): boolean {
    return this.ready;
  }

  async onModuleInit(): Promise<void> {
    this.config = this.readConfig();

    const conn = await amqp.connect(this.config.url);
    this.conn = conn;

    conn.on('error', (err: unknown) => {
      this.ready = false;
      this.logger.error(
        `RabbitMQ connection error: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    conn.on('close', () => {
      this.ready = false;
      // Current behavior is fail-fast; reconnect with backoff can be added later.
      this.logger.warn('RabbitMQ connection closed');
    });

    this.pubCh = await conn.createConfirmChannel();
    this.consCh = await conn.createChannel();
    await this.consCh.prefetch(this.config.prefetch);

    await this.assertTopology();
    this.ready = true;

    this.logger.log('RabbitMQ ready');
  }

  async onModuleDestroy(): Promise<void> {
    this.ready = false;
    await this.close();
  }

  // ------------------------ helpers ------------------------

  createBaseMessage(
    orderId: string,
    correlationId?: string,
  ): OrderProcessMessage {
    return {
      messageId: randomUUID(),
      orderId,
      createdAt: new Date().toISOString(),
      attempt: 0,
      correlationId,
      producer: 'orders-api',
      eventName: 'orders.process',
    };
  }

  // ------------------------ publish ------------------------

  async publishProcess(message: OrderProcessMessage): Promise<void> {
    const ch = this.requirePubChannel();
    this.publishToExchange(ch, this.config.routingKeyProcess, message);
    await ch.waitForConfirms();
  }

  async publishRetry(message: OrderProcessMessage): Promise<void> {
    const ch = this.requirePubChannel();
    this.publishToExchange(ch, this.config.routingKeyRetry, message);
    await ch.waitForConfirms();
  }

  async publishDlq(
    message: OrderProcessMessage,
    reason?: string,
  ): Promise<void> {
    const ch = this.requirePubChannel();

    const payload = Buffer.from(
      JSON.stringify({ ...message, reason }),
      'utf-8',
    );

    ch.publish(this.config.exchange, this.config.routingKeyDlq, payload, {
      contentType: 'application/json',
      deliveryMode: 2, // persistent
      messageId: message.messageId,
      correlationId: message.correlationId,
      timestamp: Math.floor(Date.now() / 1000),
      type: message.eventName,
      appId: message.producer,
      headers: reason ? { reason } : undefined,
    });

    await ch.waitForConfirms();
  }

  // ------------------------ consume (manual ack) ------------------------

  /**
   * Manual ACK only after handler resolves (=> after TX commit).
   * On error: republish to retry/dlq and ACK original message (no requeue loops).
   */
  async consumeProcess(
    handler: (msg: OrderProcessMessage) => Promise<void>,
  ): Promise<void> {
    const ch = this.requireConsumerChannel();

    // Hot reload safety: cancel previous consumer
    if (this.consumerTag) {
      await ch.cancel(this.consumerTag);
      this.consumerTag = null;
    }

    const res = await ch.consume(
      this.config.processQueue,
      (raw: ConsumeMessage | null) => {
        if (!raw) return;
        void this.handleProcessMessage(raw, ch, handler);
      },
      { noAck: false },
    );

    this.consumerTag = res.consumerTag;

    this.logger.log(
      `Consumer attached: queue=${this.config.processQueue}, prefetch=${this.config.prefetch}, maxAttempts=${this.config.maxAttempts}`,
    );
  }

  // ------------------------ internals ------------------------

  private readConfig(): RabbitTopologyConfig {
    const { rabbitmq } = this.configService.getOrThrow<AppConfig>('app');

    // Keep routing keys explicit in code to avoid config drift.
    return {
      ...rabbitmq,
      routingKeyProcess: 'process',
      routingKeyRetry: 'retry',
      routingKeyDlq: 'dlq',
    };
  }

  private publishToExchange(
    ch: ConfirmChannel,
    routingKey: string,
    message: OrderProcessMessage,
  ): void {
    const payload = Buffer.from(JSON.stringify(message), 'utf-8');

    ch.publish(this.config.exchange, routingKey, payload, {
      contentType: 'application/json',
      deliveryMode: 2, // persistent
      messageId: message.messageId,
      correlationId: message.correlationId,
      timestamp: Math.floor(Date.now() / 1000),
      type: message.eventName,
      appId: message.producer,
    });
  }

  /**
   * Idempotent topology setup (safe on restart).
   * NOTE: durable must match existing objects, otherwise you get PRECONDITION_FAILED.
   */
  private async assertTopology(): Promise<void> {
    const pub = this.requirePubChannel();

    await pub.assertExchange(this.config.exchange, 'direct', { durable: true });

    await pub.assertQueue(this.config.processQueue, { durable: true });

    await pub.assertQueue(this.config.retryQueue, {
      durable: true,
      arguments: {
        'x-message-ttl': this.config.retryDelayMs,
        'x-dead-letter-exchange': this.config.exchange,
        'x-dead-letter-routing-key': this.config.routingKeyProcess,
      },
    });

    await pub.assertQueue(this.config.dlqQueue, { durable: true });

    await pub.bindQueue(
      this.config.processQueue,
      this.config.exchange,
      this.config.routingKeyProcess,
    );
    await pub.bindQueue(
      this.config.retryQueue,
      this.config.exchange,
      this.config.routingKeyRetry,
    );
    await pub.bindQueue(
      this.config.dlqQueue,
      this.config.exchange,
      this.config.routingKeyDlq,
    );

    this.logger.log(
      `Rabbit topology ready: exchange=${this.config.exchange}, queues=[${this.config.processQueue}, ${this.config.retryQueue}, ${this.config.dlqQueue}]`,
    );
  }

  private parseMessage(raw: ConsumeMessage): OrderProcessMessage {
    const contentType =
      typeof raw.properties.contentType === 'string'
        ? raw.properties.contentType
        : undefined;

    // Accept missing contentType and still parse JSON payload.
    if (contentType && contentType !== 'application/json') {
      throw new Error(`Invalid contentType: ${contentType}`);
    }

    const text = raw.content.toString('utf-8');
    const data: unknown = JSON.parse(text);

    if (!this.isOrderProcessMessage(data)) {
      throw new Error('Invalid message shape');
    }

    return data;
  }

  private async handleProcessMessage(
    raw: ConsumeMessage,
    ch: Channel,
    handler: (msg: OrderProcessMessage) => Promise<void>,
  ): Promise<void> {
    try {
      let parsed: OrderProcessMessage;
      try {
        parsed = this.parseMessage(raw);
        if (
          !parsed.correlationId &&
          typeof raw.properties.correlationId === 'string'
        ) {
          parsed = { ...parsed, correlationId: raw.properties.correlationId };
        }
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        const corr =
          typeof raw.properties.correlationId === 'string'
            ? raw.properties.correlationId
            : 'n/a';
        this.logger.warn(
          `Dropping invalid message: queue=${this.config.processQueue} correlationId=${corr} reason=${errMsg}`,
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

        if (nextAttempt >= this.config.maxAttempts) {
          await this.publishDlq({ ...parsed, attempt: nextAttempt }, errMsg);
          ch.ack(raw);
          this.logger.warn(
            `Message moved to DLQ: correlationId=${parsed.correlationId ?? 'n/a'} orderId=${parsed.orderId} messageId=${parsed.messageId} reason=${errMsg}`,
          );
          return;
        }

        await this.publishRetry({ ...parsed, attempt: nextAttempt });
        ch.ack(raw);
        this.logger.warn(
          `Retry scheduled: correlationId=${parsed.correlationId ?? 'n/a'} orderId=${parsed.orderId} messageId=${parsed.messageId} attempt=${nextAttempt} reason=${errMsg}`,
        );
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `Unexpected consumer handler error: queue=${this.config.processQueue} reason=${errMsg}`,
      );
      ch.ack(raw);
    }
  }

  private isOrderProcessMessage(v: unknown): v is OrderProcessMessage {
    if (!v || typeof v !== 'object') return false;
    const obj = v as Record<string, unknown>;

    return (
      typeof obj.messageId === 'string' &&
      typeof obj.orderId === 'string' &&
      typeof obj.createdAt === 'string' &&
      typeof obj.attempt === 'number'
    );
  }

  private requirePubChannel(): ConfirmChannel {
    if (!this.pubCh)
      throw new Error('RabbitMQ publish channel is not initialized');
    return this.pubCh;
  }

  private requireConsumerChannel(): Channel {
    if (!this.consCh)
      throw new Error('RabbitMQ consumer channel is not initialized');
    return this.consCh;
  }

  private async close(): Promise<void> {
    try {
      if (this.consCh && this.consumerTag) {
        await this.consCh.cancel(this.consumerTag);
      }
    } catch (e: unknown) {
      this.logger.warn(
        `RabbitMQ cancel consumer failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.consumerTag = null;
    }

    try {
      if (this.consCh) await this.consCh.close();
    } catch (e: unknown) {
      this.logger.warn(
        `RabbitMQ consumer channel close failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.consCh = null;
    }

    try {
      if (this.pubCh) await this.pubCh.close();
    } catch (e: unknown) {
      this.logger.warn(
        `RabbitMQ publish channel close failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.pubCh = null;
    }

    try {
      if (this.conn) await this.conn.close();
    } catch (e: unknown) {
      this.logger.warn(
        `RabbitMQ connection close failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.conn = null;
    }
  }
}
