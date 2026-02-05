import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import appConfig, { AppConfig } from './config/app.config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [
    // Initialize configuration module
    ConfigModule.forRoot({
      isGlobal: true, // Recommended: makes config available everywhere
      load: [appConfig],
      envFilePath: `.env`, // Points to the environment file
    }),

    // NEW: DB connection (does not affect existing routes/middleware)
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // Read typed config object from your existing app config
        const { database } = configService.getOrThrow<AppConfig>('app');

        return {
          type: 'postgres',
          host: database.host,
          port: database.port,
          username: database.user,
          password: database.password,
          database: database.name,

          // DB changes only by migrations
          synchronize: false,

          // TypeORM will auto-load entities registered via TypeOrmModule.forFeature(...)
          autoLoadEntities: true,

          // see SQL queries and errors in console
          logging: true,
        };
      },
    }),

    UsersModule,
    ProductsModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  // Implementation of NestModule interface to apply middleware
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
