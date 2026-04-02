import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { AppService } from './app.service';
import { RabbitMQHealthIndicator } from './common/health/rabbitmq.health';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly rmq: RabbitMQHealthIndicator,
  ) {}

  @Get()
  getAboutPage(): string {
    return this.appService.getAboutPageHtml();
  }

  @Get('health')
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database', { timeout: 3000 }),
      () => this.rmq.isHealthy('rabbitmq'),
    ]);
  }
}
