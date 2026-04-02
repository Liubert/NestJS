import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import { DataSource } from 'typeorm';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly dataSource: DataSource,
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

      return {
        status: 'ready',
        checks: {
          db: 'up',
        },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        checks: {
          db: this.dataSource.isInitialized ? 'up' : 'down',
        },
      });
    }
  }
}
