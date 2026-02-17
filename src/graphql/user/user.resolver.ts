import { UseGuards } from '@nestjs/common';
import { Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';

import { UsersService } from '../../modules/users/users.service';
import { CurrentUser } from '../../modules/auth/current-user.decorator';
import { JwtAuthGuard } from '../../modules/auth/jwt-auth.guard';
import { GqlUser } from './user.model';
import { Order } from '../orders/order.model';
import { OrdersService } from '../../modules/orders/orders.service';
import { mapOrderEntityToGraphQL } from '../orders/order.mapper';

@Resolver(() => GqlUser)
export class UserResolver {
  constructor(
    private readonly usersService: UsersService,
    private ordersService: OrdersService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Query(() => GqlUser)
  async me(@CurrentUser() user: { userId: string }): Promise<GqlUser> {
    const entity = await this.usersService.findById(user.userId);
    // NOTE: if entity is null, you can throw Unauthorized or NotFound depending on your logic
    return entity as unknown as GqlUser;
  }
  //
  // @ResolveField(() => [Order])
  // async orders(@Parent() user: GqlUser): Promise<Order[]> {
  //   const entities = await this.ordersService.findByUserId(user.id);
  //
  //   console.log('entities');
  //   console.log(entities);
  //   return [];
  // }

  @ResolveField(() => [Order])
  async orders(@Parent() user: GqlUser): Promise<Order[]> {
    const orders = await this.ordersService.findByUserId(user.id);
    return orders.map(mapOrderEntityToGraphQL);
  }
}
