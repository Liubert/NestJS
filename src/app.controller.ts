import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppService } from './app.service';
import { DataSource } from 'typeorm';
import { RabbitMQService } from './rabbitmq/rabbitmq.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dataSource: DataSource,
    private readonly rabbit: RabbitMQService,
  ) {}

  @Get()
  getAboutPage(): string {
    return this.appService.getAboutPageHtml();
  }

  @Get('health')
  getLivenessStatus() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'nest_js_api',
    };
  }

  @Get('ready')
  async getReadinessStatus() {
    try {
      await this.dataSource.query('SELECT 1');

      if (!this.rabbit.isReady()) {
        throw new ServiceUnavailableException('RabbitMQ is not ready');
      }

      return {
        status: 'ready',
        checks: {
          db: 'up',
          rabbitmq: 'up',
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: {
          db: this.dataSource.isInitialized ? 'up' : 'down',
          rabbitmq: this.rabbit.isReady() ? 'up' : 'down',
        },
      });
    }
  }
}
