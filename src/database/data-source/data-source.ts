import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadBaseConfig } from '../../config/app.config';

const { db } = loadBaseConfig();

export const AppDataSource = new DataSource({
  ...db,
  // Keep both globs so the same DataSource works in ts-mode (ts-node)
  // and dist-mode (compiled JS).
  entities: ['src/modules/**/*.entity.ts', 'dist/modules/**/*.entity.js'],
  migrations: [
    'src/database/migrations/*.ts',
    'dist/database/migrations/*.js',
  ],
});
