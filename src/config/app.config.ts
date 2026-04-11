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

export function loadBaseConfig(): BaseAppConfig {
  return {
    port: Number(process.env.APP_PORT ?? 3000),
    env: (process.env.NODE_ENV as Envs) ?? Envs.local,

    auth: {
      JWT_SECRET: process.env.JWT_SECRET!,
    },

    db: {
      type: 'postgres',
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT!),
      username: process.env.DB_USER!,
      password: process.env.DB_PASS!,
      database: process.env.DB_NAME!,
      namingStrategy: new SnakeNamingStrategy(),
      // Use synchronize in test env so Testcontainers schema is auto-created from entities
      synchronize: process.env.NODE_ENV === 'test',
      logging: true,
    },

    s3: {
      region: process.env.AWS_REGION!,
      bucket: process.env.AWS_S3_BUCKET!,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  };
}

const appConfig = registerAs('app', () => loadBaseConfig());
export type AppConfig = ConfigType<typeof appConfig>;
export default appConfig;
