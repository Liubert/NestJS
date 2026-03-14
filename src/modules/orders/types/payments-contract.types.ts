import type { Observable } from 'rxjs';

export type PaymentsAuthorizeRequest = {
  orderId: string;
  amount: string;
  currency: string;
  idempotencyKey?: string;
};

export type PaymentsAuthorizeResponse = {
  paymentId: string;
  status: string;
};

export type PaymentsGetPaymentStatusRequest = {
  paymentId: string;
};

export type PaymentsGetPaymentStatusResponse = {
  paymentId: string;
  status: string;
};

export type PaymentsGrpcApi = {
  // Proto RPC: Authorize
  authorize(
    request: PaymentsAuthorizeRequest,
  ): Observable<PaymentsAuthorizeResponse>;
  // Proto RPC: GetPaymentStatus
  getPaymentStatus(
    request: PaymentsGetPaymentStatusRequest,
  ): Observable<PaymentsGetPaymentStatusResponse>;
};
