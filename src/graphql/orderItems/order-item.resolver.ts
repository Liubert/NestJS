import { Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Product } from '../products/product.model';
import { ProductLoader } from '../products/product.loader';
import { OrderItem } from './order-item.model';
import { GraphQLError } from 'graphql';

@Resolver(() => OrderItem)
export class OrderItemResolver {
  constructor(private readonly productLoader: ProductLoader) {}

  @ResolveField(() => Product)
  async product(@Parent() item: OrderItem): Promise<Product> {
    const entity = await this.productLoader.byId.load(item.productId);

    if (!entity) {
      // Because Product (non-null)
      throw new GraphQLError('Product not found', {
        extensions: { code: 'NOT_FOUND', productId: item.productId },
      });
    }

    return {
      id: entity.id,
      name: entity.name,
      price: Number(entity.price),
      createdAt: entity.createdAt,
      isActive: entity.isActive,
    };
  }
}
