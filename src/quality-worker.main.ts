import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import appConfig, { AppConfig } from './config/app.config';
import { AiModule } from './modules/ai/ai.module';
import { QualityWorkerQueries } from './modules/quality/quality-worker.queries';
import { QualityWorkerService } from './modules/quality/quality-worker.service';

/**
 * Standalone worker process — no HTTP server, no controllers.
 * Only DB + AI + QualityWorkerService polling.
 *
 * Uses glob entity loading instead of autoLoadEntities to avoid
 * manually tracking the full chain of TypeORM entity relations.
 */
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
          entities: [join(__dirname, '**', '*.entity.{ts,js}')],
        };
      },
    }),
    AiModule,
  ],
  providers: [QualityWorkerQueries, QualityWorkerService],
})
class QualityWorkerAppModule {}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(
    QualityWorkerAppModule,
  );

  app.enableShutdownHooks();

  console.log('Quality worker process started');

  await new Promise(() => {});
}

void bootstrap().catch((err) => {
  console.error('Quality worker failed to start:', err);
  process.exit(1);
});
