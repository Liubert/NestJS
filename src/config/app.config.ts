import { ConfigType, registerAs } from '@nestjs/config';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';

export enum Envs {
  local = 'local',
  dev = 'dev',
  staging = 'stage',
  prod = 'prod',
}

type AuthConfig = {
  JWT_SECRET: string;
};

type S3Config = {
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type BaseAppConfig = {
  port: number;
  env: Envs;
  db: PostgresConnectionOptions;
  auth: AuthConfig;
  s3: S3Config;
};

const must = (v: string | undefined, name: string): string => {
  // Fail fast instead of silently falling back to localhost in Docker
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
};

export function loadBaseConfig(): BaseAppConfig {
  return {
    port: Number(process.env.APP_PORT ?? 3000),
    env: (process.env.NODE_ENV as Envs) ?? Envs.local,

    auth: {
      JWT_SECRET: must(process.env.JWT_SECRET, 'JWT_SECRET'),
    },

    db: {
      type: 'postgres',
      host: must(process.env.DB_HOST, 'DB_HOST'),
      port: Number(must(process.env.DB_PORT, 'DB_PORT')),
      username: must(process.env.DB_USER, 'DB_USER'),
      password: must(process.env.DB_PASS, 'DB_PASS'),
      database: must(process.env.DB_NAME, 'DB_NAME'),
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      logging: true,
    },

    s3: {
      region: must(process.env.AWS_REGION, 'AWS_REGION'),
      bucket: must(process.env.AWS_S3_BUCKET, 'AWS_S3_BUCKET'),
      accessKeyId: must(process.env.AWS_ACCESS_KEY_ID, 'AWS_ACCESS_KEY_ID'),
      secretAccessKey: must(
        process.env.AWS_SECRET_ACCESS_KEY,
        'AWS_SECRET_ACCESS_KEY',
      ),
    },
  };
}

const appConfig = registerAs('app', () => loadBaseConfig());
export type AppConfig = ConfigType<typeof appConfig>;
export default appConfig;
