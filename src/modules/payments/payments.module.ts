import { Module } from '@nestjs/common';
import { PaymentsGrpcController } from './payments.grpc.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsGrpcController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
