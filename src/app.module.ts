import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ConfigModule } from '@nestjs/config';
import { LoggerMiddleware } from './common/middleware/logger.middleware'; // Import your middleware
import appConfig from './config/app.config';

@Module({
  imports: [
    // Initialize configuration module
    ConfigModule.forRoot({
      isGlobal: true, // Recommended: makes config available everywhere
      load: [appConfig],
      envFilePath: `.env`, // Points to the environment file
    }),
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  // Implementation of NestModule interface to apply middleware
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      // Apply to all routes in the application
      .forRoutes('*');
  }
}
