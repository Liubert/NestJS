import { NestFactory } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import appConfig, { AppConfig } from './config/app.config';
import { QualityWorkerModule } from './modules/quality/quality.module';

/**
 * Standalone module for the quality worker process.
 * No HTTP server, no controllers — only DB + AI dependencies.
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
          autoLoadEntities: true,
        };
      },
    }),
    QualityWorkerModule,
  ],
})
class QualityWorkerAppModule {}

async function bootstrap() {
  process.env.QUALITY_WORKER_STANDALONE = 'true';

  const app = await NestFactory.createApplicationContext(
    QualityWorkerAppModule,
  );

  app.enableShutdownHooks();

  console.log('Quality worker process started');

  // Keep process alive — shutdown hooks handle SIGINT/SIGTERM
  await new Promise(() => {});
}

void bootstrap().catch((err) => {
  console.error('Quality worker failed to start:', err);
  process.exit(1);
});
