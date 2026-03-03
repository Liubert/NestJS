import { registerEnumType } from '@nestjs/graphql';

export enum OrderStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  CREATED = 'created',
  PAID = 'paid',
  DELIVERED = 'delivered',
  CANCELED = 'canceled',
}

registerEnumType(OrderStatus, { name: 'OrderStatus' });
