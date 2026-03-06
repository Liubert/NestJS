import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductEntity } from './entities/product.entity';
import { ListProductsDto } from './dto/list-product.dto';
import { DEFAULT_PAGE_SIZE } from '../../common/constant/pagination.const';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productsRepo: Repository<ProductEntity>,
  ) {}

  async findByIds(ids: string[]): Promise<ProductEntity[]> {
    if (!ids.length) return [];

    return this.productsRepo.find({
      where: { id: In(ids) },
    });
  }

  async findAll(): Promise<ProductEntity[]> {
    return this.productsRepo.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findAllInfinite(params: ListProductsDto): Promise<{
    items: ProductEntity[];
    nextCursor: { createdAt: string; productId: string } | null;
  }> {
    const limit = params.limit || DEFAULT_PAGE_SIZE;

    const hasCursor =
      params.createdAt !== undefined || params.productId !== undefined;

    if (hasCursor && (!params.createdAt || !params.productId)) {
      throw new BadRequestException(
        'Both createdAt and productId or none are required',
      );
    }

    if (params.minPrice !== undefined && params.maxPrice !== undefined) {
      const min = Number(params.minPrice);
      const max = Number(params.maxPrice);

      if (Number.isNaN(min) || Number.isNaN(max)) {
        throw new BadRequestException('Invalid price range');
      }

      if (min > max) {
        throw new BadRequestException('minPrice must be <= maxPrice');
      }
    }

    const qb = this.productsRepo
      .createQueryBuilder('p')
      // Always use entity property names in QueryBuilder
      .where('p.isActive = :active', { active: true });

    if (params.search) {
      qb.andWhere('p.name ILIKE :q', { q: `%${params.search}%` });
    }

    if (params.minPrice !== undefined) {
      qb.andWhere('p.price >= :minPrice', {
        minPrice: Number(params.minPrice),
      });
    }

    if (params.maxPrice !== undefined) {
      qb.andWhere('p.price <= :maxPrice', {
        maxPrice: Number(params.maxPrice),
      });
    }

    // Keep ordering consistent with the cursor tuple
    qb.orderBy('p.createdAt', 'DESC').addOrderBy('p.id', 'DESC').take(limit);

    if (params.createdAt && params.productId) {
      // Keyset pagination: (createdAt, id) < (cursorCreatedAt, cursorId)
      qb.andWhere(`(p.createdAt, p.id) < (:createdAt, :id)`, {
        createdAt: params.createdAt,
        id: params.productId,
      });
    }

    const items = await qb.getMany();

    const last = items.at(-1);
    const nextCursor =
      last && items.length === limit
        ? { createdAt: last.createdAt.toISOString(), productId: last.id }
        : null;

    return { items, nextCursor };
  }

  async findOne(id: string): Promise<ProductEntity> {
    const product = await this.productsRepo.findOne({ where: { id } });

    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    return product;
  }

  async create(dto: CreateProductDto): Promise<ProductEntity> {
    const product = this.productsRepo.create({
      ...dto,
      isActive: true,
    });

    return this.productsRepo.save(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductEntity> {
    const product = await this.findOne(id);

    const updated = this.productsRepo.merge(product, dto);
    return this.productsRepo.save(updated);
  }

  async remove(id: string): Promise<{ status: 'deleted'; id: string }> {
    const product = await this.findOne(id);

    // Soft-delete via flag (safer for orders history)
    product.isActive = false;
    await this.productsRepo.save(product);

    return { status: 'deleted', id };
  }
}
