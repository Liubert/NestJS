import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadBaseConfig } from '../../config/app.config';

const { db } = loadBaseConfig();

export const AppDataSource = new DataSource({
  ...db,
  entities: ['dist/modules/**/*.entity.js'],
  migrations: ['dist/database/migrations/*.js'],
});
