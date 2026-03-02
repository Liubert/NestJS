// src/rabbitmq/rabbitmq.service.ts
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  Connection,
  Consumer,
  ConsumerStatus,
  Publisher,
} from 'rabbitmq-client';
import { AppConfig } from '../config/app.config';

const ROUTING_KEYS = {
  process: 'process',
  retry: 'retry',
  dlq: 'dlq',
} as const;

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

  private rabbitmqConfig!: AppConfig['rabbitmq'];

  private conn: Connection | null = null;
  private pub: Publisher | null = null;
  private consumer: Consumer | null = null;

  constructor(private readonly configService: ConfigService) {}

  getMaxAttempts(): number {
    return this.rabbitmqConfig.maxAttempts;
  }

  async onModuleInit(): Promise<void> {
    const { rabbitmq } = this.configService.getOrThrow<AppConfig>('app');
    this.rabbitmqConfig = rabbitmq;

    this.conn = new Connection(this.rabbitmqConfig.url);
    this.conn.on('error', (err: unknown) => {
      this.logger.error(
        `RabbitMQ connection error: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    this.conn.on('connection', () => {
      this.logger.log('RabbitMQ connection established/re-established');
    });

    // confirm=true => broker confirms publish (confirm channel analogue)
    this.pub = this.conn.createPublisher({
      confirm: true,
      // Keep it simple: no internal retry here, we implement retries ourselves (assignment)
      maxAttempts: 1,
      exchanges: [
        {
          exchange: this.rabbitmqConfig.exchange,
          type: 'direct',
          durable: true,
        },
      ],
    });

    await this.assertTopology();
  }

  async onModuleDestroy(): Promise<void> {
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
    const pub = this.requirePublisher();

    await pub.send(
      {
        exchange: this.rabbitmqConfig.exchange,
        routingKey: ROUTING_KEYS.process,
        contentType: 'application/json',
        durable: true, // persistent message
        messageId: message.messageId,
        correlationId: message.correlationId,
        // rabbitmq-client expects timestamp in seconds
        timestamp: Math.floor(Date.now() / 1000),
        type: message.eventName,
        appId: message.producer,
      },
      message,
    );
  }

  async publishRetry(message: OrderProcessMessage): Promise<void> {
    const pub = this.requirePublisher();

    await pub.send(
      {
        exchange: this.rabbitmqConfig.exchange,
        routingKey: ROUTING_KEYS.retry,
        contentType: 'application/json',
        durable: true,
        messageId: message.messageId,
        correlationId: message.correlationId,
        timestamp: Math.floor(Date.now() / 1000),
        type: message.eventName,
        appId: message.producer,
      },
      message,
    );
  }

  async publishDlq(
    message: OrderProcessMessage,
    reason?: string,
  ): Promise<void> {
    const pub = this.requirePublisher();

    await pub.send(
      {
        exchange: this.rabbitmqConfig.exchange,
        routingKey: ROUTING_KEYS.dlq,
        contentType: 'application/json',
        durable: true,
        messageId: message.messageId,
        correlationId: message.correlationId,
        timestamp: Math.floor(Date.now() / 1000),
        type: message.eventName,
        appId: message.producer,
        headers: reason ? { reason } : undefined,
      },
      { ...message, reason },
    );
  }

  // ------------------------ consume (Step 1) ------------------------
  /**
   * Consumer for main process queue.
   *
   * rabbitmq-client semantics:
   * - if handler resolves => ACK
   * - if handler throws => NACK (controlled by "requeue" option)
   *
   * For step 1 we set requeue=false to avoid infinite loops.
   * Step 2 will replace "throw => nack" with explicit publishRetry/publishDlq.
   */
  async consumeProcess(
    handler: (message: OrderProcessMessage) => Promise<void>,
  ): Promise<void> {
    const conn = this.requireConnection();

    // Avoid duplicate consumers on hot reload / re-init
    if (this.consumer) {
      await this.consumer.close();
      this.consumer = null;
    }

    const queue = this.rabbitmqConfig.processQueue;

    const consumer = conn.createConsumer(
      {
        queue,
        queueOptions: { durable: true },
        qos: { prefetchCount: this.rabbitmqConfig.prefetch },
        requeue: false,
      },
      async (raw) => {
        let parsed: OrderProcessMessage;
        try {
          parsed = this.parseOrderProcessMessage(raw);
        } catch (err: unknown) {
          this.logger.warn(
            `Dropping invalid message from queue=${queue}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return ConsumerStatus.DROP;
        }

        this.logger.log(
          `Consume: queue=${queue} orderId=${parsed.orderId} attempt=${parsed.attempt} messageId=${parsed.messageId}`,
        );

        // If this throws => NACK (requeue=false)
        await handler(parsed);
      },
    );
    consumer.on('error', (err: unknown) => {
      this.logger.error(
        `RabbitMQ consumer error: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
    this.consumer = consumer;

    this.logger.log(
      `Consumer attached: queue=${queue}, prefetch=${this.rabbitmqConfig.prefetch}`,
    );
  }

  // ------------------------ internals ------------------------

  private async assertTopology(): Promise<void> {
    const conn = this.requireConnection();

    await conn.exchangeDeclare({
      exchange: this.rabbitmqConfig.exchange,
      type: 'direct',
      durable: true,
    });

    await conn.queueDeclare({
      queue: this.rabbitmqConfig.processQueue,
      durable: true,
    });

    await conn.queueDeclare({
      queue: this.rabbitmqConfig.retryQueue,
      durable: true,
      arguments: {
        'x-message-ttl': this.rabbitmqConfig.retryDelayMs,
        'x-dead-letter-exchange': this.rabbitmqConfig.exchange,
        'x-dead-letter-routing-key': ROUTING_KEYS.process,
      },
    });

    await conn.queueDeclare({
      queue: this.rabbitmqConfig.dlqQueue,
      durable: true,
    });

    await conn.queueBind({
      queue: this.rabbitmqConfig.processQueue,
      exchange: this.rabbitmqConfig.exchange,
      routingKey: ROUTING_KEYS.process,
    });

    await conn.queueBind({
      queue: this.rabbitmqConfig.retryQueue,
      exchange: this.rabbitmqConfig.exchange,
      routingKey: ROUTING_KEYS.retry,
    });

    await conn.queueBind({
      queue: this.rabbitmqConfig.dlqQueue,
      exchange: this.rabbitmqConfig.exchange,
      routingKey: ROUTING_KEYS.dlq,
    });

    this.logger.log(
      `Rabbit topology ready: exchange=${this.rabbitmqConfig.exchange}, queues=[${this.rabbitmqConfig.processQueue}, ${this.rabbitmqConfig.retryQueue}, ${this.rabbitmqConfig.dlqQueue}]`,
    );
  }

  private parseOrderProcessMessage(raw: unknown): OrderProcessMessage {
    /**
     * rabbitmq-client passes an AsyncMessage-like object.
     * It contains: body (can be object/string/buffer), properties, etc.
     * We'll only rely on body + contentType.
     */
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid raw message');
    }

    const msg = raw as {
      body?: unknown;
      properties?: { contentType?: string };
    };

    const contentType = msg.properties?.contentType;
    // contentType is optional in AMQP headers; reject only explicit non-JSON values.
    if (contentType && !contentType.startsWith('application/json')) {
      throw new Error(`Invalid contentType: ${contentType}`);
    }

    const body = msg.body;

    let data: unknown = body;

    if (Buffer.isBuffer(body)) {
      data = JSON.parse(body.toString('utf-8')) as unknown;
    } else if (typeof body === 'string') {
      data = JSON.parse(body) as unknown;
    }

    if (!this.isOrderProcessMessage(data)) {
      throw new Error('Invalid message shape');
    }

    return data;
  }

  private isOrderProcessMessage(value: unknown): value is OrderProcessMessage {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;

    return (
      typeof v.messageId === 'string' &&
      typeof v.orderId === 'string' &&
      typeof v.createdAt === 'string' &&
      typeof v.attempt === 'number'
    );
  }

  private requireConnection(): Connection {
    if (!this.conn) throw new Error('RabbitMQ connection is not initialized');
    return this.conn;
  }

  private requirePublisher(): Publisher {
    if (!this.pub) throw new Error('RabbitMQ publisher is not initialized');
    return this.pub;
  }

  private async close(): Promise<void> {
    try {
      if (this.consumer) await this.consumer.close();
    } catch (e: unknown) {
      this.logger.warn(
        `RabbitMQ consumer close failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.consumer = null;
    }

    try {
      if (this.pub) await this.pub.close();
    } catch (e: unknown) {
      this.logger.warn(
        `RabbitMQ publisher close failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.pub = null;
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
