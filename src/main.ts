import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const port = configService.get<number>('app.port');
  const environment = configService.get<string>('app.environment');

  await app.listen(port!);


  console.log(`Application environment is: ${environment}`);
  console.log(`Application is running on: ${await app.getUrl()}`);

}
bootstrap();