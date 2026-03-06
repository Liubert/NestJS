import { Field, Float, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Product')
export class Product {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field(() => Float)
  price!: number;

  @Field()
  isActive!: boolean;

  @Field()
  createdAt!: Date;
}
