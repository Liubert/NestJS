export type PaymentStatus = 'AUTHORIZED' | 'NOT_FOUND';

export type AuthorizeRequest = {
  orderId: string;
  amount: string | number;
  currency: string;
  idempotencyKey?: string;
};

export type AuthorizeResponse = {
  paymentId: string;
  status: PaymentStatus;
};

export type GetPaymentStatusRequest = {
  paymentId: string;
};

export type GetPaymentStatusResponse = {
  paymentId: string;
  status: PaymentStatus;
};

export type PaymentState = {
  paymentId: string;
  orderId: string;
  amountMinor: string;
  currency: string;
  status: PaymentStatus;
};
