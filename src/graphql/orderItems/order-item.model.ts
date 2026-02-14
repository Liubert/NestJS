import { Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { Product } from '../products/product.model';

@ObjectType()
export class OrderItem {
  @Field(() => ID)
  productId!: string;

  @Field(() => Int)
  quantity!: number;

  @Field(() => Float)
  unitPrice!: number;

  @Field(() => Product, { nullable: false })
  product?: Product;
}
