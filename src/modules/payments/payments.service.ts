import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  AuthorizeRequest,
  AuthorizeResponse,
  GetPaymentStatusRequest,
  GetPaymentStatusResponse,
  PaymentState,
} from './types/payments.grpc.types';
import { AppConfig } from '../../config/app.config';

@Injectable()
export class PaymentsService {
  // In-memory storage is enough for local development and happy-path validation.
  private readonly paymentsById = new Map<string, PaymentState>();
  private readonly authorizeDelayMs: number;

  constructor(private readonly configService: ConfigService) {
    const { payments } = this.configService.getOrThrow<AppConfig>('app');
    this.authorizeDelayMs = payments.authorizeDelayMs;
  }

  async authorize(request: AuthorizeRequest): Promise<AuthorizeResponse> {
    // Delay is optional and controlled via env to test timeout behavior from Orders client.
    if (this.authorizeDelayMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.authorizeDelayMs),
      );
    }

    const paymentId = randomUUID();
    const status = 'AUTHORIZED' as const;

    const paymentState: PaymentState = {
      paymentId,
      orderId: request.orderId,
      // gRPC int64 can arrive as number or string depending on loader settings.
      amountMinor: String(request.amount),
      currency: request.currency,
      status,
    };

    this.paymentsById.set(paymentId, paymentState);

    return {
      paymentId,
      status,
    };
  }

  getPaymentStatus(request: GetPaymentStatusRequest): GetPaymentStatusResponse {
    const payment = this.paymentsById.get(request.paymentId);

    if (!payment) {
      return {
        paymentId: request.paymentId,
        status: 'NOT_FOUND',
      };
    }

    return {
      paymentId: payment.paymentId,
      status: payment.status,
    };
  }
}
