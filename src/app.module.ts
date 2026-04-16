import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { AuditLogModule } from './common/audit/audit-log.module';
import appConfig, { AppConfig } from './config/app.config';

import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { TranslationsModule } from './modules/translations/translations.module';
import { McpPromptsModule } from './modules/mcp-prompts/mcp-prompts.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { QualityModule } from './modules/quality/quality.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { AiModule } from './modules/ai/ai.module';
import { ProductionModule } from './modules/production/production.module';
import { TranslationCacheModule } from './modules/translations/translation-cache.service';
import { SseModule } from './modules/sse/sse.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),

    // Global rate limit: 300 requests per 60 seconds per IP.
    // Stricter limits applied per-route via @Throttle() on sensitive endpoints.
    ThrottlerModule.forRoot([
      { name: 'default', ttl: seconds(60), limit: 300 },
    ]),

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
    TerminusModule,
    TranslationCacheModule,
    AuditLogModule,
    AuthModule,
    UsersModule,
    WebhooksModule,
    FeedbackModule,
    ProjectsModule,
    AiModule,
    ProductionModule,
    TranslationsModule,
    McpPromptsModule,
    QualityModule,
    SseModule,
  ],
  controllers: [AppController],
  providers: [
    // Apply ThrottlerGuard globally — every route is rate-limited by default
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
