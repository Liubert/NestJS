import { ConfigType, registerAs } from '@nestjs/config';

// Centralized application config with default values.
// Single entry point for environment-based settings.
// Allows running the app locally without .env.

export enum Envs {
  LOCAL = 'local',
  DEV = 'dev',
  STAGING = 'stage',
  PROD = 'prod',
}

const appConfig = registerAs('app', () => ({
  port: parseInt(process.env.APP_PORT || '3000', 10),
  environment: (process.env.NODE_ENV as Envs) || Envs.LOCAL,
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  },
}));

export type AppConfig = ConfigType<typeof appConfig>;
export default appConfig;
