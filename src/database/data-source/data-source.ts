import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadBaseConfig } from '../../config/app.config';

const { db } = loadBaseConfig();

export const dataSource = new DataSource({
  ...db,
  entities: ['src/modules/**/*.entity.ts'],
  migrations: ['src/database/migrations/*{.ts,.js}'],
});
