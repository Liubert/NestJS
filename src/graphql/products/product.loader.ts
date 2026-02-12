import DataLoader from 'dataloader';
import { Injectable, Scope } from '@nestjs/common';
import { ProductsService } from '../../modules/products/products.service';
import { ProductEntity } from '../../modules/products/entities/product.entity';

@Injectable({ scope: Scope.REQUEST })
export class ProductLoader {
  constructor(private readonly productsService: ProductsService) {}

  public readonly byId = new DataLoader<string, ProductEntity>(async (ids) => {
    const products = await this.productsService.findByIds(ids as string[]);
    const map = new Map(products.map((p) => [p.id, p]));

    return ids.map((id) => map.get(id) ?? new Error(`Product ${id} not found`));
  });
}
