import { Field, ID, ObjectType } from '@nestjs/graphql';
import { UserRole } from '../../modules/users/types/user-role.enum';
import { Order } from '../orders/order.model';

@ObjectType()
export class GqlUser {
  @Field(() => ID)
  id!: string;

  @Field(() => String)
  email!: string;

  @Field(() => String)
  firstName!: string;

  @Field(() => String, { nullable: true })
  lastName!: string | null;

  @Field(() => String, { nullable: true })
  phone!: string | null;

  @Field(() => String)
  role!: UserRole;

  @Field(() => [Order])
  orders!: Order[];

  @Field(() => ID, { nullable: true })
  avatarFileId!: string | null;

  @Field(() => String, { nullable: true })
  avatarUrl!: string | null;
}
