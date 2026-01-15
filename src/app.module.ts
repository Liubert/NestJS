import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/app.config';

@Module({
  imports: [// Initialize configuration module
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true, // Makes ConfigModule available everywhere without re-importing
      envFilePath: `.env`, // Points to the environment file
    }),UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
