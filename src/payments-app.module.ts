import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config';
import { PaymentsModule } from './modules/payments/payments.module';

@Module({
  imports: [
    // This module owns config bootstrap for the standalone payments process.
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    PaymentsModule,
  ],
})
export class PaymentsAppModule {}
