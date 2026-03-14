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

type PaymentsGrpcConfig = {
  // Client target that Orders-service will use for outgoing gRPC calls.
  url: string;
  // Bind address where Payments gRPC server will listen.
  bindUrl: string;
  // Shared proto path used by both services.
  protoPath: string;
  // Proto package name from payments.proto.
  packageName: string;
  // Timeout for Orders -> Payments call (ms), controlled by env.
  timeoutMs: number;
};

type PaymentsServiceConfig = {
  // Dedicated port for standalone payments process bootstrap.
  port: number;
  // Optional artificial authorize delay for local resilience checks.
  authorizeDelayMs: number;
  grpc: PaymentsGrpcConfig;
};

export type BaseAppConfig = {
  port: number;
  env: Envs;
  db: PostgresConnectionOptions;
  auth: AuthConfig;
  s3: S3Config;
  rabbitmq: RabbitMqConfig;
  payments: PaymentsServiceConfig;
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

    payments: {
      port: Number(process.env.PAYMENTS_APP_PORT ?? 3001),
      authorizeDelayMs: Number(process.env.PAYMENTS_AUTHORIZE_DELAY_MS ?? 0),
      grpc: {
        url: process.env.PAYMENTS_GRPC_URL ?? 'localhost:50051',
        bindUrl: process.env.PAYMENTS_GRPC_BIND_URL ?? '0.0.0.0:50051',
        protoPath:
          process.env.PAYMENTS_GRPC_PROTO_PATH ?? 'proto/payments.proto',
        packageName: process.env.PAYMENTS_GRPC_PACKAGE ?? 'payments',
        timeoutMs: Number(process.env.PAYMENTS_GRPC_TIMEOUT_MS ?? 1500),
      },
    },
  };
}

const appConfig = registerAs('app', () => loadBaseConfig());
export type AppConfig = ConfigType<typeof appConfig>;
export default appConfig;
