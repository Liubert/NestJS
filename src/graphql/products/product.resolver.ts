import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { ProductsService } from '../../modules/products/products.service';
import { Product } from './product.model';
import { ProductEntity } from '../../modules/products/entities/product.entity';
import { ProductsConnection } from './product-pagination.model';

@Resolver(() => Product)
export class ProductsResolver {
  constructor(private readonly productsService: ProductsService) {}

  toGraphQLProduct = (entity: ProductEntity): Product => {
    return {
      id: entity.id,
      name: entity.name,
      price: Number(entity.price),
      createdAt: entity.createdAt,
      isActive: entity.isActive,
    };
  };

  // Infinite list (keyset pagination)
  @Query(() => ProductsConnection)
  async productsInfinite(
    @Args('limit', { type: () => Int, nullable: true })
    limit?: number,

    @Args('search', { nullable: true })
    search?: string,

    @Args('minPrice', { nullable: true })
    minPrice?: number,

    @Args('maxPrice', { nullable: true })
    maxPrice?: number,

    @Args('createdAt', { nullable: true })
    createdAt?: string,

    @Args('id', { nullable: true })
    id?: string,
  ): Promise<ProductsConnection> {
    const result = await this.productsService.findAllInfinite({
      productId: id,
      limit,
      search,
      minPrice: minPrice !== undefined ? String(minPrice) : undefined,
      maxPrice: maxPrice !== undefined ? String(maxPrice) : undefined,
      createdAt,
    });
    return {
      items: result.items.map(this.toGraphQLProduct),
      nextCursor: result.nextCursor
        ? {
            id: result.nextCursor.productId,
            createdAt: new Date(result.nextCursor.createdAt),
          }
        : null,
    };
  }

  @Query(() => Product)
  async product(@Args('id') id: string): Promise<Product> {
    const entity = await this.productsService.findOne(id);
    return this.toGraphQLProduct(entity);
  }
}
