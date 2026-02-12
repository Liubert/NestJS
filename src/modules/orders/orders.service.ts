import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, QueryRunner, Repository } from 'typeorm';

import { OrderEntity } from './entities/order.entity';
import { CreateOrderDto, CreateOrderItemDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ProductEntity } from '../products/entities/product.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { OrderStatus } from '../../graphql/orders/order-status.enum';

const MAX_LIMIT = 50;

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;

  const driverError = error.driverError as { code?: string };
  return driverError.code === '23505';
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly ordersRepo: Repository<OrderEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(): Promise<OrderEntity[]> {
    return this.ordersRepo.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<OrderEntity> {
    const order = await this.ordersRepo.findOne({
      where: { id },
      relations: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order with id ${id} not found`);
    }

    return order;
  }

  async findOrders({
    filter,
    pagination,
  }: {
    filter?: { status?: OrderStatus; dateFrom?: Date; dateTo?: Date };
    pagination?: { limit?: number; offset?: number };
  }) {
    const limit = Math.min(pagination?.limit ?? 20, MAX_LIMIT);
    const offset = Math.max(pagination?.offset ?? 0, 0);

    const qb = this.ordersRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.items', 'i')
      .orderBy('o.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (filter?.status) {
      qb.andWhere('o.status = :status', { status: filter.status });
    }

    if (filter?.dateFrom) {
      qb.andWhere('o.createdAt >= :dateFrom', { dateFrom: filter.dateFrom });
    }

    if (filter?.dateTo) {
      qb.andWhere('o.createdAt <= :dateTo', { dateTo: filter.dateTo });
    }

    return qb.getMany();
  }

  // NOTE: Concurrency strategy
  //
  // This implementation uses **pessimistic row-level locking** for stock updates.
  // It works well for products with **small stock** and **low contention**, where
  // the same product is not purchased concurrently by many users.
  //
  // Drawback:
  // - concurrent purchases of the same product are serialized (queued),
  //   which increases latency and does not scale well for "hot" products.
  //
  // If a product has **high traffic and large stock**, an alternative approach
  // based on **atomic / optimistic updates** can be used instead. That approach
  // avoids waiting on row locks and scales better under heavy concurrency.
  //
  // Compared to the locking approach, the optimistic variant:
  // - has more edge cases (conflict handling, retries or fast-fail logic),
  // - can produce more failed requests (e.g. 409) when stock is low,
  // - is harder to reason about and test.

  private async lockAndLoadProducts(
    queryRunner: QueryRunner,
    items: CreateOrderItemDto[],
  ): Promise<Map<string, ProductEntity>> {
    const productIds = [...new Set(items.map((i) => i.productId))];

    const products: ProductEntity[] = await queryRunner.manager
      .createQueryBuilder(ProductEntity, 'p')
      .where('p.id IN (:...ids)', { ids: productIds })
      .setLock('pessimistic_partial_write')
      .getMany();

    if (products.length !== productIds.length) {
      const found = new Set(products.map((p) => p.id));
      const missing = productIds.filter((id) => !found.has(id));

      throw new BadRequestException(
        `Some products not found: ${missing.join(', ')}`,
      );
    }

    return new Map<string, ProductEntity>(products.map((p) => [p.id, p]));
  }

  private aggregateQuantities(
    items: CreateOrderItemDto[],
  ): Map<string, number> {
    const qtyByProductId = new Map<string, number>();

    for (const item of items) {
      qtyByProductId.set(
        item.productId,
        (qtyByProductId.get(item.productId) ?? 0) + item.quantity,
      );
    }

    return qtyByProductId;
  }

  private assertSufficientStock(
    productMap: Map<string, ProductEntity>,
    qtyByProductId: Map<string, number>,
  ): void {
    for (const [productId, qty] of qtyByProductId) {
      const product = productMap.get(productId);
      if (!product) {
        throw new BadRequestException(`Product not found: ${productId}`);
      }

      // Insufficient stock returns **409 Conflict** because the request is valid,
      // but it cannot be completed due to the current state of the product inventory (resource state conflict).
      // This is a business rule violation rather than a malformed request (400).

      if (product.stock < qty) {
        throw new ConflictException(
          `Insufficient stock for product ${productId}`,
        );
      }
    }
  }

  private async saveOrder(
    orderRepoTx: Repository<OrderEntity>,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<OrderEntity> {
    return await orderRepoTx.save(
      orderRepoTx.create({
        userId: dto.userId,
        idempotencyKey,
        status: OrderStatus.CREATED,
        totalAmount: '0.00',
      }),
    );
  }

  private async saveOrderItems(
    itemsRepoTx: Repository<OrderItemEntity>,
    orderId: string,
    items: CreateOrderItemDto[],
    productMap: Map<string, ProductEntity>,
  ): Promise<OrderItemEntity[]> {
    const entities = items.map((item) => {
      const product = productMap.get(item.productId)!;

      return itemsRepoTx.create({
        order: { id: orderId },
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: product.price,
        productName: product.name ?? null,
      });
    });

    return itemsRepoTx.save(entities);
  }

  private getOrderTotalFromItems(items: OrderItemEntity[]): string {
    const total = items.reduce(
      (sum, it) => sum + Number(it.unitPrice) * it.quantity,
      0,
    );
    return total.toFixed(2);
  }

  private decrementStock(
    productMap: Map<string, ProductEntity>,
    qtyByProductId: Map<string, number>,
  ): void {
    for (const [productId, qty] of qtyByProductId) {
      const product = productMap.get(productId)!;
      product.stock -= qty;
    }
  }

  async create(
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<{ order: OrderEntity; isCreated: boolean }> {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      const orderRepoTx = queryRunner.manager.getRepository(OrderEntity);
      const itemsRepoTx = queryRunner.manager.getRepository(OrderItemEntity);

      // 1) Idempotency fast path (inside TX to avoid weird races)
      const existing = await orderRepoTx.findOne({
        where: { userId: dto.userId, idempotencyKey },
        relations: { items: true },
      });
      if (existing) {
        await queryRunner.commitTransaction();
        return { order: existing, isCreated: false };
      }

      // 2) Lock products rows (oversell protection)
      const productMap = await this.lockAndLoadProducts(queryRunner, dto.items);
      const qtyByProductId = this.aggregateQuantities(dto.items);

      this.assertSufficientStock(productMap, qtyByProductId);

      // 3) Create order (UNIQUE(userId, idempotencyKey) protects double-submit)
      const savedOrder = await this.saveOrder(orderRepoTx, dto, idempotencyKey);

      // 4) Create items
      const orderItems = await this.saveOrderItems(
        itemsRepoTx,
        savedOrder.id,
        dto.items,
        productMap,
      );

      // 5) Update total
      savedOrder.totalAmount = this.getOrderTotalFromItems(orderItems);
      await orderRepoTx.save(savedOrder);

      // 6) Decrement stock + persist
      this.decrementStock(productMap, qtyByProductId);
      await queryRunner.manager.save(ProductEntity, [...productMap.values()]);

      await queryRunner.commitTransaction();

      // Reload to return with relations
      const finalOrder = await this.ordersRepo.findOne({
        where: { id: savedOrder.id },
        relations: { items: true },
      });

      if (!finalOrder) {
        throw new InternalServerErrorException(
          'Order not found after successful transaction',
        );
      }

      return { order: finalOrder, isCreated: true };
    } catch (err: unknown) {
      // Rollback only if TX is active
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      // Idempotency race: return existing order for the same (userId, key)
      if (isUniqueViolation(err)) {
        const existingAfterRace = await this.ordersRepo.findOne({
          where: { userId: dto.userId, idempotencyKey },
          relations: { items: true },
        });
        if (existingAfterRace)
          return { order: existingAfterRace, isCreated: false };

        throw new InternalServerErrorException(
          'Unique violation, but order not found afterwards',
        );
      }

      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderEntity> {
    const order = await this.findOne(id);

    const updated = this.ordersRepo.merge(order, dto);
    return this.ordersRepo.save(updated);
  }

  async remove(id: string): Promise<{ status: 'deleted'; id: string }> {
    // Hard delete is fine for now (draft mode). Later we can switch to soft delete if needed.
    await this.findOne(id);
    await this.ordersRepo.delete(id);

    return { status: 'deleted', id };
  }
}
