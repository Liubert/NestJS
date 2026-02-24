import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import appConfig, { AppConfig } from './config/app.config';

import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { AppResolver } from './graphql/app.resolver';
import { apolloFormatError } from './graphql/errors/apollo-format-error';
import { AuthModule } from './modules/auth/auth.module';
import { FilesModule } from './modules/files/files.module';
import { ReqWithUser } from './modules/auth/types/auth.types';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      // envFilePath: `.env`,
    }),

    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      csrfPrevention: false,
      plugins: [ApolloServerPluginLandingPageLocalDefault({ embed: true })],
      playground: false,
      introspection: true,
      //autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      autoSchemaFile:
        process.env.NODE_ENV === 'development' ? 'schema.gql' : true,
      sortSchema: true,
      path: '/graphql',
      debug: false,
      context: ({ req }: { req: ReqWithUser }) => ({ req }),
      formatError: apolloFormatError,
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
    AuthModule,
    UsersModule,
    ProductsModule,
    OrdersModule,
    FilesModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppResolver],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
