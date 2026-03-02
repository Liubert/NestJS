// src/modules/orders/orders.worker.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import {
  type OrderProcessMessage,
  RabbitMQService,
} from '../../rabbitmq/rabbitmq.service';

@Injectable()
export class OrdersWorkerService implements OnModuleInit {
  private readonly logger = new Logger(OrdersWorkerService.name);

  constructor(private readonly rabbit: RabbitMQService) {}

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
        `Process failed, scheduling retry: orderId=${message.orderId} attempt=${attempt} -> ${next.attempt} max=${maxAttempts} reason=${reason}`,
      );

      // Put into retry queue (TTL will send it back to process queue)
      await this.rabbit.publishRetry(next);

      // IMPORTANT:
      // we do NOT throw => ACK original message
      return;
    }

    this.logger.error(
      `Process failed, sending to DLQ: orderId=${message.orderId} attempt=${attempt} max=${maxAttempts} reason=${reason}`,
    );

    await this.rabbit.publishDlq(message, reason);

    // IMPORTANT: no throw => ACK original message
  }

  private async handleProcess(message: OrderProcessMessage): Promise<void> {
    this.logger.log(
      `Processing order: orderId=${message.orderId} attempt=${message.attempt} messageId=${message.messageId}`,
    );

    // --- Homework/test hook ---
    // If you want to simulate failures for retry/DLQ checks:
    if (message.orderId.startsWith('fail')) {
      throw new Error('Simulated failure for retry/DLQ flow');
    }

    // Simulate normal work
    await new Promise((resolve) => setTimeout(resolve, 50));

    this.logger.log(`Processed OK: orderId=${message.orderId}`);
  }
}
