import { registerEnumType } from '@nestjs/graphql';

export enum OrderStatus {
  CREATED = 'created',
  PAID = 'paid',
  DELIVERED = 'delivered',
  CANCELED = 'canceled',
}

registerEnumType(OrderStatus, { name: 'OrderStatus' });
