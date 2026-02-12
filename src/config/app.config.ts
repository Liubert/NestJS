import { ConfigType, registerAs } from '@nestjs/config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export enum Envs {
  local = 'local',
  dev = 'dev',
  staging = 'stage',
  prod = 'prod',
}

export type BaseAppConfig = {
  port: number;
  env: Envs;
  db: PostgresConnectionOptions;
};

export function loadBaseConfig(): BaseAppConfig {
  return {
    port: Number(process.env.APP_PORT ?? 3000),
    env: (process.env.NODE_ENV as Envs) ?? Envs.local,

    db: {
      type: 'postgres',
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: Number(process.env.DATABASE_PORT ?? 5432),
      username: process.env.DATABASE_USER ?? 'postgres',
      password: process.env.DATABASE_PASSWORD ?? 'postgres',
      database: process.env.DATABASE_NAME ?? 'ecom',

      namingStrategy: new SnakeNamingStrategy(),

      synchronize: false,
      logging: true,
    },
  };
}

const appConfig = registerAs('app', () => loadBaseConfig());
export type AppConfig = ConfigType<typeof appConfig>;
export default appConfig;
