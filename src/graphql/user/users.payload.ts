import { Field, Int, ObjectType } from '@nestjs/graphql';
import { GqlUser } from './user.model';

@ObjectType()
export class UsersPayload {
  @Field(() => [GqlUser])
  items!: GqlUser[];

  @Field(() => Int)
  total!: number;
}
