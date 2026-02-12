import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CursorPagination {
  @Field()
  createdAt!: Date;

  @Field()
  id!: string;
}
