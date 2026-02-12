import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CursorPaginationInput {
  @Field()
  createdAt!: Date;

  @Field()
  id!: string;
}
