import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TerminusModule } from '@nestjs/terminus';

import { AppController } from './app.controller';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import appConfig, { AppConfig } from './config/app.config';

import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { TranslationsModule } from './modules/translations/translations.module';
import { McpPromptsModule } from './modules/mcp-prompts/mcp-prompts.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { QualityWorkerModule } from './modules/translations/quality-worker.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { AiModule } from './modules/ai/ai.module';

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
    TerminusModule,
    AuthModule,
    UsersModule,
    WebhooksModule,
    FeedbackModule,
    ProjectsModule,
    AiModule,
    TranslationsModule,
    McpPromptsModule,
    QualityWorkerModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
