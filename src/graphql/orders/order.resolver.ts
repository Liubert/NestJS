import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';

import { OrdersService } from '../../modules/orders/orders.service';
import { CreateOrderDto } from '../../modules/orders/dto/create-order.dto';
import { OrderEntity } from '../../modules/orders/entities/order.entity';

import { CreateOrderInput } from './create-order.input';
import { CreateOrderPayload, Order } from './order.model';
import { OrdersFilterInput } from './order-filters.input';
import { PaginationInput } from '../common/pagination.input';
import { CurrentUser } from '../../modules/auth/current-user.decorator';

type GqlContext = {
  req?: { headers?: Record<string, string | string[] | undefined> };
};

function getHeader(ctx: GqlContext, name: string): string | undefined {
  const headers = ctx?.req?.headers ?? {};
  const raw = headers[name.toLowerCase()] ?? headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

@Resolver(() => Order)
export class OrdersResolver {
  constructor(private readonly ordersService: OrdersService) {}

  private toGraphQLOrder(order: OrderEntity): Order {
    return {
      id: order.id,
      userId: order.userId,
      status: order.status,
      totalAmount: Number(order.totalAmount),
      createdAt: order.createdAt,
      items: (order.items ?? []).map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        unitPrice: Number(it.unitPrice),
      })),
    };
  }

  @Query(() => Order)
  async order(@Args('id') id: string): Promise<Order> {
    const order = await this.ordersService.findOne(id);

    if (!order) {
      // technically findOne already throws, but keep consistent
      throw new NotFoundException(`Order ${id} not found`);
    }

    return this.toGraphQLOrder(order);
  }

  @Query(() => [Order], { name: 'orders' })
  async orders(
    @Args('filter', { nullable: true }) filter?: OrdersFilterInput,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<Order[]> {
    const orders = await this.ordersService.findOrders({
      filter,
      pagination,
    });

    return orders.map((o) => this.toGraphQLOrder(o));
  }

  @Mutation(() => CreateOrderPayload)
  async createOrder(
    @Args('input') input: CreateOrderInput,
    @CurrentUser() user: { userId: string },
    @Context() ctx: GqlContext,
  ): Promise<CreateOrderPayload> {
    const idempotencyKey = getHeader(ctx, 'Idempotency-Key');

    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const dto: CreateOrderDto = {
      userId: user.userId,
      items: input.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
      })),
    };

    const { order, isCreated } = await this.ordersService.create(
      dto,
      idempotencyKey,
      user.userId,
    );

    return {
      isCreated,
      order: this.toGraphQLOrder(order),
    };
  }
}
