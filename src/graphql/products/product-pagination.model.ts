import { Field, ObjectType } from '@nestjs/graphql';
import { Product } from './product.model';
import { CursorPagination } from '../common/cursor-pagination';

@ObjectType()
export class ProductsConnection {
  @Field(() => [Product])
  items!: Product[];

  @Field(() => CursorPagination, { nullable: true })
  nextCursor?: CursorPagination | null;
}
