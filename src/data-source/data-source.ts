import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { UserEntity } from '../modules/users/user.entity';
import { ProductEntity } from '../modules/products/entities/product.entity';
import { OrderEntity } from '../modules/orders/entities/order.entity';
import { OrderItemEntity } from '../modules/orders/entities/order-item.entity';
import { loadBaseConfig } from '../config/app.config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

// Extract the database object from the centralized configuration
const { database: dbConfig } = loadBaseConfig();

export const dataSource = new DataSource({
  type: 'postgres',
  // Destructure config and map 'user' to 'username' and 'name' to 'database'
  host: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.name,

  // Use snake_case naming strategy for DB columns
  namingStrategy: new SnakeNamingStrategy(),

  // Register entities for TypeORM management
  entities: [UserEntity, ProductEntity, OrderEntity, OrderItemEntity],

  // Path to migration files
  migrations: ['src/migrations/*.ts'],

  // Data integrity settings
  synchronize: false,
  logging: false,
});
