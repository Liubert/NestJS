import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { OrderStatus } from './order-status.enum';
import { OrderItem } from '../orderItems/order-item.model';

@ObjectType()
export class Order {
  @Field(() => ID)
  id!: string;

  @Field(() => ID)
  userId!: string;

  @Field(() => OrderStatus)
  status!: OrderStatus;

  @Field(() => Float)
  totalAmount!: number;

  @Field()
  createdAt!: Date;

  @Field(() => [OrderItem])
  items!: OrderItem[];
}

@ObjectType()
export class CreateOrderPayload {
  @Field()
  isCreated!: boolean;

  @Field(() => Order)
  order!: Order;
}
