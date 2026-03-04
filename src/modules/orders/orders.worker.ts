// src/modules/orders/orders.worker.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import {
  type OrderProcessMessage,
  RabbitMQService,
} from '../../rabbitmq/rabbitmq.service';
import { OrdersService } from './orders.service';

@Injectable()
export class OrdersWorkerService implements OnModuleInit {
  private readonly logger = new Logger(OrdersWorkerService.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly ordersService: OrdersService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consumeProcess(async (message) => {
      await this.safeHandle(message);
      // IMPORTANT:
      // We always resolve (no throw), because:
      // - resolve => ACK
      // - throw   => NACK (rabbitmq-client), which breaks our retry logic.
    });

    this.logger.log('Orders worker started');
  }

  private async safeHandle(message: OrderProcessMessage): Promise<void> {
    try {
      await this.handleProcess(message);
    } catch (err: unknown) {
      await this.handleFailure(message, err);
    }
  }

  private async handleFailure(
    message: OrderProcessMessage,
    err: unknown,
  ): Promise<void> {
    const attempt = Number.isFinite(message.attempt) ? message.attempt : 0;
    const maxAttempts = this.rabbit.getMaxAttempts();

    const reason =
      err instanceof Error ? err.message : `Unknown error: ${String(err)}`;

    if (attempt + 1 < maxAttempts) {
      const next: OrderProcessMessage = {
        ...message,
        attempt: attempt + 1,
      };

      this.logger.warn(
        `result=retry correlationId=${message.correlationId ?? 'n/a'} messageId=${message.messageId} orderId=${message.orderId} attempt=${attempt} nextAttempt=${next.attempt} maxAttempts=${maxAttempts} reason=${reason}`,
      );

      // Put into retry queue (TTL will send it back to process queue)
      await this.rabbit.publishRetry(next);

      // IMPORTANT:
      // we do NOT throw => ACK original message
      return;
    }

    this.logger.error(
      `result=dlq correlationId=${message.correlationId ?? 'n/a'} messageId=${message.messageId} orderId=${message.orderId} attempt=${attempt} maxAttempts=${maxAttempts} reason=${reason}`,
    );

    await this.rabbit.publishDlq(message, reason);

    // IMPORTANT: no throw => ACK original message
  }

  private async handleProcess(message: OrderProcessMessage): Promise<void> {
    // Test hook: allows deterministic retry/DLQ checks.
    if (message.orderId.startsWith('fail')) {
      throw new Error('Simulated failure for retry/DLQ flow');
    }

    // Heavy business logic is delegated to service and runs in DB transaction.
    // `consumeProcess` ACKs only after this method resolves, so commit happens
    // before ACK.
    const result = await this.ordersService.processPendingOrder(
      message.orderId,
      message.messageId,
    );

    this.logger.log(
      `result=success correlationId=${message.correlationId ?? 'n/a'} messageId=${message.messageId} orderId=${message.orderId} attempt=${message.attempt} mode=${result}`,
    );
  }
}
