import { ConfigType, registerAs } from '@nestjs/config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { UserEntity } from '../modules/users/user.entity';
import { ProductEntity } from '../modules/products/entities/product.entity';
import { OrderEntity } from '../modules/orders/entities/order.entity';
import { OrderItemEntity } from '../modules/orders/entities/order-item.entity';

import { EntitySchema, MixedList } from 'typeorm';

// Centralized application config with default values.
// Single entry point for environment-based settings.
// Allows running the app locally without .env.

export enum Envs {
  LOCAL = 'local',
  DEV = 'dev',
  STAGING = 'stage',
  PROD = 'prod',
}

export type BaseAppConfig = {
  port: number;
  environment: Envs;
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    namingStrategy: object;
    entities: MixedList<string | Function | EntitySchema>; // Correct TypeORM entity list type
    migrations: string[];
    synchronize: boolean;
    logging: boolean;
  };
};

export function loadBaseConfig(): BaseAppConfig {
  return {
    port: parseInt(process.env.APP_PORT || '3000', 10),
    environment: (process.env.NODE_ENV as Envs) || Envs.LOCAL,

    database: {
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      user: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      name: process.env.DATABASE_NAME || 'ecom',

      namingStrategy: new SnakeNamingStrategy(),

      entities: [UserEntity, ProductEntity, OrderEntity, OrderItemEntity],

      migrations: ['src/migrations/*.ts'],

      synchronize: false,
      logging: false,
    },
  };
}

const appConfig = registerAs('app', () => loadBaseConfig());

export type AppConfig = ConfigType<typeof appConfig>;
export default appConfig;
