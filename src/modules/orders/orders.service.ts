import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';

import { OrderEntity } from './entities/order.entity';
import { CreateOrderDto, CreateOrderItemDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { ProductEntity } from '../products/entities/product.entity';
import { OrderItemEntity } from './entities/order-item.entity';
import { ProcessedMessageEntity } from './entities/processed-message.entity';
import { OrderStatus } from '../../graphql/orders/order-status.enum';
import { RabbitMQService } from '../../rabbitmq/rabbitmq.service';

const MAX_LIMIT = 50;
const WORKER_HANDLER_NAME = 'orders.process';

export type ProcessPendingOrderResult = 'processed' | 'duplicate';

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
    private readonly rabbit: RabbitMQService,
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

  private findExistingOrderByIdempotency(
    userId: string,
    idempotencyKey: string,
  ): Promise<OrderEntity | null> {
    return this.ordersRepo.findOne({
      where: { userId, idempotencyKey },
      relations: { items: true },
    });
  }

  private async reserveProcessedMessage(
    manager: EntityManager,
    messageId: string,
    orderId: string,
  ): Promise<boolean> {
    const insertResult = await manager
      .createQueryBuilder()
      .insert()
      .into(ProcessedMessageEntity)
      .values({
        messageId,
        orderId,
        handler: WORKER_HANDLER_NAME,
      })
      .onConflict(`("message_id") DO NOTHING`)
      .returning('message_id')
      .execute();

    return Array.isArray(insertResult.raw) && insertResult.raw.length > 0;
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
    manager: EntityManager,
    items: CreateOrderItemDto[],
  ): Promise<Map<string, ProductEntity>> {
    const productIds = [...new Set(items.map((i) => i.productId))];

    const products: ProductEntity[] = await manager
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

  private async savePendingOrder(
    orderRepo: Repository<OrderEntity>,
    userId: string,
    idempotencyKey: string,
    items: CreateOrderItemDto[],
  ): Promise<OrderEntity> {
    // Step 1 (Producer): store order as PENDING.
    // We intentionally do not create order_items and do not touch stock here.
    // Those are "heavy" operations and must run in worker (async pipeline).
    return await orderRepo.save(
      orderRepo.create({
        userId,
        idempotencyKey,
        // API path must be fast: persist intent and exit quickly.
        status: OrderStatus.PENDING,
        processedAt: null,
        totalAmount: '0.00',
        // Keep original client payload to process later in worker transaction.
        requestedItems: items,
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
    userId: string,
    correlationId?: string,
  ): Promise<{ order: OrderEntity; isCreated: boolean }> {
    try {
      // Step 0 (Idempotency): if this request already processed/accepted
      // for the same (userId, idempotencyKey), return existing order.
      // This protects API producer from duplicate client retries.
      const existing = await this.findExistingOrderByIdempotency(
        userId,
        idempotencyKey,
      );
      if (existing) {
        return { order: existing, isCreated: false };
      }

      // Step 1 (DB): create lightweight PENDING order.
      const savedOrder = await this.savePendingOrder(
        this.ordersRepo,
        userId,
        idempotencyKey,
        dto.items,
      );

      // Step 2 (Broker): publish message to processing queue.
      // Message contains unique messageId (generated in createBaseMessage),
      // orderId, createdAt and attempt=0.
      //
      // Important order of operations:
      // - first save order in DB,
      // - only then publish message.
      //
      // If publish fails, we return 500 and order stays PENDING.
      // For production-grade guarantees, outbox pattern is the next step.
      const msg = this.rabbit.createBaseMessage(savedOrder.id, correlationId);
      await this.rabbit.publishProcess(msg);

      // Step 3 (HTTP response): return immediately with persisted PENDING order.
      // We intentionally avoid extra "read-after-publish" query to keep latency low
      // and avoid race where worker already flips status before producer responds.
      return { order: savedOrder, isCreated: true };
    } catch (err: unknown) {
      // Idempotency race: return existing order for the same (userId, key)
      if (isUniqueViolation(err)) {
        const existingAfterRace = await this.findExistingOrderByIdempotency(
          userId,
          idempotencyKey,
        );
        if (existingAfterRace)
          return { order: existingAfterRace, isCreated: false };

        throw new InternalServerErrorException(
          'Unique violation, but order not found afterwards',
        );
      }

      throw err;
    }
  }

  /**
   * Heavy order processing path for worker:
   * - run in DB transaction
   * - lock order + products
   * - compute order items/total and decrement stock
   * - mark order as PROCESSED
   *
   * The worker ACKs the message only after this method resolves,
   * so ACK happens strictly after transaction commit.
   */
  async processPendingOrder(
    orderId: string,
    messageId: string,
  ): Promise<ProcessPendingOrderResult> {
    return this.dataSource.transaction(async (manager) => {
      // Worker-level idempotency by messageId.
      // If this message was already committed before, skip business logic.
      const isNewMessage = await this.reserveProcessedMessage(
        manager,
        messageId,
        orderId,
      );

      if (!isNewMessage) {
        return 'duplicate';
      }

      const orderRepoTx = manager.getRepository(OrderEntity);
      const itemsRepoTx = manager.getRepository(OrderItemEntity);

      const order = await orderRepoTx
        .createQueryBuilder('o')
        .setLock('pessimistic_write')
        .where('o.id = :id', { id: orderId })
        .getOne();

      if (!order) {
        throw new NotFoundException(`Order with id ${orderId} not found`);
      }

      // Idempotent guard at business level for retries:
      // if the order is already processed, do nothing and commit.
      if (order.status === OrderStatus.PROCESSED) {
        return 'processed';
      }

      const requestedItems = order.requestedItems;
      if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
        throw new BadRequestException(
          `Order ${order.id} has empty requested items payload`,
        );
      }

      const productMap = await this.lockAndLoadProducts(
        manager,
        requestedItems,
      );
      const qtyByProductId = this.aggregateQuantities(requestedItems);

      this.assertSufficientStock(productMap, qtyByProductId);

      const orderItems = await this.saveOrderItems(
        itemsRepoTx,
        order.id,
        requestedItems,
        productMap,
      );

      this.decrementStock(productMap, qtyByProductId);
      await manager.save(ProductEntity, [...productMap.values()]);

      order.totalAmount = this.getOrderTotalFromItems(orderItems);
      order.status = OrderStatus.PROCESSED;
      order.processedAt = new Date();
      // Once processed, source payload is no longer needed for worker.
      order.requestedItems = [];

      await orderRepoTx.save(order);
      return 'processed';
    });
  }

  async findByUserId(userId: string) {
    return this.ordersRepo.find({
      where: { userId },
      relations: { items: true },
      order: { createdAt: 'DESC' },
    });
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderEntity> {
    const order = await this.findOne(id);

    const updated = this.ordersRepo.merge(order, dto);
    return this.ordersRepo.save(updated);
  }

  async remove(id: string): Promise<{ status: 'deleted'; id: string }> {
    // Hard delete is fine for now. Later we can switch to soft delete if needed.
    await this.findOne(id);
    await this.ordersRepo.delete(id);

    return { status: 'deleted', id };
  }

  // Add into OrdersService class
  async testPublishRabbit(
    orderId: string,
    correlationId?: string,
  ): Promise<void> {
    const msg = this.rabbit.createBaseMessage(orderId, correlationId);
    await this.rabbit.publishProcess(msg);
  }
}
