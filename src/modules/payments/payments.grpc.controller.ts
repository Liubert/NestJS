import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { PaymentsService } from './payments.service';
import type {
  AuthorizeRequest,
  AuthorizeResponse,
  GetPaymentStatusRequest,
  GetPaymentStatusResponse,
} from './types/payments.grpc.types';

@Controller()
export class PaymentsGrpcController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @GrpcMethod('Payments', 'Authorize')
  async authorize(request: AuthorizeRequest): Promise<AuthorizeResponse> {
    return this.paymentsService.authorize(request);
  }

  @GrpcMethod('Payments', 'GetPaymentStatus')
  getPaymentStatus(request: GetPaymentStatusRequest): GetPaymentStatusResponse {
    return this.paymentsService.getPaymentStatus(request);
  }
}
