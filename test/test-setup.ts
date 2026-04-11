import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcryptjs';

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let dataSource: DataSource;

export async function setupTestApp(): Promise<INestApplication> {
  // Start PostgreSQL Testcontainer
  container = await new PostgreSqlContainer('postgres:15')
    .withDatabase('test_db')
    .withUsername('test')
    .withPassword('test')
    .start();

  // Set env vars BEFORE importing AppModule (it reads process.env on module init)
  process.env.DB_HOST = container.getHost();
  process.env.DB_PORT = container.getPort().toString();
  process.env.DB_USER = container.getUsername();
  process.env.DB_PASS = container.getPassword();
  process.env.DB_NAME = container.getDatabase();
  process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';
  process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_S3_BUCKET = 'test-bucket';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
  process.env.GEMINI_API_KEY = '';
  process.env.NODE_ENV = 'test';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();

  // Replicate the same global pipes as main.ts
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();

  // In test mode, synchronize: true is set in the TypeORM config (see app.config.ts).
  // The DataSource schema is auto-created from entities when the app initializes.
  dataSource = moduleFixture.get(DataSource);

  return app;
}

export async function teardownTestApp(): Promise<void> {
  if (app) await app.close();
  if (container) await container.stop();
}

export function getApp(): INestApplication {
  return app;
}

export async function getAuthToken(
  email: string,
  password: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password });

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `Login failed with status ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }

  // Auth service returns { accessToken, user } (camelCase)
  const token = res.body.accessToken ?? res.body.access_token;
  if (!token) {
    throw new Error(
      `Login succeeded but no token in response: ${JSON.stringify(res.body)}`,
    );
  }

  return token;
}

export async function createTestAdminUser(): Promise<void> {
  // Insert admin user directly via DataSource (bypasses API, avoids circular dependency)
  const hash = await bcrypt.hash('TestAdmin123!', 10);
  await dataSource.query(
    `INSERT INTO users (email, password_hash, role, first_name, must_change_password)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO NOTHING`,
    ['testadmin@test.com', hash, 'admin', 'Test Admin', false],
  );
}
