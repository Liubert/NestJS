import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AppConfig, Envs } from './config/app.config';
import { ResponseTimeInterceptor } from './common/interceptors/response-time.interceptor';
import { setupSwagger } from './config/swagger/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { AllExceptionsFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  // CORS: restrict origins via env var.
  // In prod: CORS_ORIGINS must be set, otherwise no origin is allowed.
  // In dev: empty CORS_ORIGINS falls back to allow-all for convenience.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const isProd = process.env.NODE_ENV === 'prod';

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: corsOrigins.length
      ? { origin: corsOrigins, credentials: true }
      : isProd
        ? { origin: false } // Prod: deny all if CORS_ORIGINS not configured
        : { origin: true, credentials: true }, // Dev: allow all
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseTimeInterceptor());

  // Global exception filter: catches all unhandled exceptions, sanitizes logs
  app.useGlobalFilters(new AllExceptionsFilter());

  const configService = app.get(ConfigService);

  const { port, env } = configService.getOrThrow<AppConfig>('app');

  // Trust proxy only in stage/prod where nginx sits in front.
  // In local/dev there's no proxy, so trusting X-Forwarded-For
  // would let clients spoof their IP and bypass rate limits.
  if (env === Envs.staging || env === Envs.prod) {
    app.set('trust proxy', 1);
  }

  // Gzip/deflate compression: translation JSON compresses ~80-90%.
  // Reduces bandwidth and transfer time for large namespace responses.
  app.use(compression());

  // Helmet: security headers. CSP disabled in non-prod so Swagger UI works.
  if (env !== Envs.prod) {
    app.use(helmet({ contentSecurityPolicy: false }));
    setupSwagger(app);
  } else {
    app.use(helmet());
  }

  await app.listen(port);

  console.log(`Application environment is: ${env}`);
  console.log(`Application is running on: ${await app.getUrl()}`);
}

void bootstrap().catch((err) => {
  // Ensure startup failures are visible and fail the process.

  console.error('Bootstrap failed:', err);
  process.exit(1);
});
