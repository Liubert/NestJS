import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import * as amqp from 'amqplib';
import { AppConfig } from '../../config/app.config.js';

@Injectable()
export class RabbitMQHealthIndicator extends HealthIndicator {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    let connection: amqp.ChannelModel | null = null;
    try {
      const { rabbitmq } = this.configService.getOrThrow<AppConfig>('app');
      connection = await amqp.connect(rabbitmq.url);
      await connection.close();
      connection = null;
      return this.getStatus(key, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new HealthCheckError(
        'RabbitMQ health check failed',
        this.getStatus(key, false, { message }),
      );
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch {
          // ignore close error
        }
      }
    }
  }
}
