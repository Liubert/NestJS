import { Field, InputType } from '@nestjs/graphql';
import { ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderItemInput } from '../orderItems/create-order-item.input';

@InputType()
export class CreateOrderInput {
  @Field(() => [CreateOrderItemInput])
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemInput)
  items!: CreateOrderItemInput[];
}
