import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { AppConfig, Envs } from './config/app.config';
import { ResponseTimeInterceptor } from './common/interceptors/response-time.interceptor';
import { setupSwagger } from './swagger/swagger';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ResponseTimeInterceptor());

  const configService = app.get(ConfigService);

  const { port, environment } = configService.getOrThrow<AppConfig>('app');

  if (environment !== Envs.PROD) {
    setupSwagger(app);
  }

  await app.listen(port);

  console.log(`Application environment is: ${environment}`);
  console.log(`Application is running on: ${await app.getUrl()}`);
}

bootstrap();
