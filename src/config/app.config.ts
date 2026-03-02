import { ConfigType, registerAs } from '@nestjs/config';
import { ConnectionOptions } from 'rabbitmq-client';
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

type RabbitMqConfig = {
  user: string;
  pass: string;
  host: string;
  port: number;
  url: string;
  exchange: string;
  processQueue: string;
  retryQueue: string;
  dlqQueue: string;
  retryDelayMs: number;
  maxAttempts: number;
  prefetch: number;
  connection: ConnectionOptions;
};

export type BaseAppConfig = {
  port: number;
  env: Envs;
  db: PostgresConnectionOptions;
  auth: AuthConfig;
  s3: S3Config;
  rabbitmq: RabbitMqConfig;
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
      synchronize: false,
      logging: true,
    },

    s3: {
      region: process.env.AWS_REGION!,
      bucket: process.env.AWS_S3_BUCKET!,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },

    rabbitmq: {
      user: process.env.RABBITMQ_USER!,
      pass: process.env.RABBITMQ_PASS!,
      host: process.env.RABBITMQ_HOST!,
      port: Number(process.env.RABBITMQ_PORT!),
      url: process.env.RABBITMQ_URL!,
      exchange: process.env.RABBITMQ_EXCHANGE!,
      processQueue: process.env.RABBITMQ_PROCESS_QUEUE!,
      retryQueue: process.env.RABBITMQ_RETRY_QUEUE!,
      dlqQueue: process.env.RABBITMQ_DLQ_QUEUE!,
      retryDelayMs: Number(process.env.RABBITMQ_RETRY_DELAY_MS!),
      maxAttempts: Number(process.env.RABBITMQ_MAX_ATTEMPTS!),
      prefetch: Number(process.env.RABBITMQ_PREFETCH!),
      connection: {
        hostname: process.env.RABBITMQ_HOST!,
        port: Number(process.env.RABBITMQ_PORT!),
        username: process.env.RABBITMQ_USER!,
        password: process.env.RABBITMQ_PASS!,
      },
    },
  };
}

const appConfig = registerAs('app', () => loadBaseConfig());
export type AppConfig = ConfigType<typeof appConfig>;
export default appConfig;
