import { NestFactory } from '@nestjs/core';
import { ConfigType } from '@nestjs/config';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import appConfig from './config/app.config';
import { ResponseTimeInterceptor } from './common/interceptors/response-time.interceptor';

type AppConfig = ConfigType<typeof appConfig>;

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

  const config: AppConfig = appConfig();
  const { port, environment } = config;

  await app.listen(port);

  console.log(`Application environment is: ${environment}`);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
