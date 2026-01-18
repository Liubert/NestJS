import { registerAs } from '@nestjs/config';

// Centralized application config with default values.
// Single entry point for environment-based settings.
// Allows running the app locally without .env.

export default registerAs('app', () => ({
  port: parseInt(process.env.APP_PORT || '3000', 10),
  environment: process.env.NODE_ENV || 'local',
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  },
}));
