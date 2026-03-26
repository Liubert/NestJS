import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadBaseConfig } from '../../config/app.config';

const { db } = loadBaseConfig();

export const AppDataSource = new DataSource({
  ...db,
  entities:
    process.env.NODE_ENV === 'production'
      ? ['dist/modules/**/*.entity.js']
      : ['src/modules/**/*.entity.ts'],
  migrations:
    process.env.NODE_ENV === 'production'
      ? ['dist/database/migrations/*.js']
      : ['src/database/migrations/*.ts'],
});
