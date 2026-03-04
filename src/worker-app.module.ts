import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appConfig, { AppConfig } from './config/app.config';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { OrdersWorkerModule } from './modules/orders/orders.worker.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const { db } = configService.getOrThrow<AppConfig>('app');
        return {
          ...db,
          autoLoadEntities: true,
        };
      },
    }),
    RabbitMQModule,
    OrdersWorkerModule,
  ],
})
export class WorkerAppModule {}
