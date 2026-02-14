import { Field, InputType } from '@nestjs/graphql';
import { OrderStatus } from './order-status.enum';
import { IsDate, IsEnum, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

@InputType()
export class OrdersFilterInput {
  @Field(() => OrderStatus, { nullable: true })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;
}
