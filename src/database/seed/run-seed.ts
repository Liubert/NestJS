import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type { EntityManager } from 'typeorm';

import { AppDataSource } from '../data-source/data-source';
import { ProductEntity } from '../../modules/products/entities/product.entity';
import { UserEntity } from '../../modules/users/user.entity';
import { UserRole } from '../../modules/users/types/user-role.enum';
import { OrderEntity } from '../../modules/orders/entities/order.entity';
import { OrderStatus } from '../../graphql/orders/order-status.enum';

const PRODUCTS_COUNT = 150;
const ORDERS_PER_USER = 12;
const MIN_ITEMS = 2;
const MAX_ITEMS = 5;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toMoney(value: number): string {
  return value.toFixed(2);
}

async function runSeed(): Promise<void> {
  await AppDataSource.initialize();

  try {
    await AppDataSource.transaction(async (manager: EntityManager) => {
      // FK-safe reset
      await manager.query(`
        TRUNCATE TABLE
          "order_items",
          "orders",
          "products",
          "users"
        RESTART IDENTITY CASCADE;
      `);

      const userRepo = manager.getRepository(UserEntity);
      const productRepo = manager.getRepository(ProductEntity);
      const orderRepo = manager.getRepository(OrderEntity);

      // ---- USERS ----
      const userHash = await bcrypt.hash('User123!', 10);
      const adminHash = await bcrypt.hash('Admin123!', 10);

      const insertedUsers = await userRepo.insert([
        {
          email: 'buyer@test.com',
          firstName: 'Buyer',
          lastName: 'One',
          phone: null,
          passwordHash: userHash,
          role: UserRole.USER,
        },
        {
          email: 'admin@test.com',
          firstName: 'Admin',
          lastName: 'Boss',
          phone: null,
          passwordHash: adminHash,
          role: UserRole.ADMIN,
        },
      ]);

      const buyerId = insertedUsers.identifiers[0]?.id as string;
      const adminId = insertedUsers.identifiers[1]?.id as string;

      console.log('Users seeded');

      // ---- PRODUCTS ----
      const baseTime = new Date();
      const productsRows = Array.from({ length: PRODUCTS_COUNT }, (_, i) => ({
        name: `Product #${i + 1}`,
        price: toMoney(randomInt(10, 500) + 0.99),
        stock: randomInt(10, 100),
        isActive: true,
        createdAt: new Date(baseTime.getTime() - i * 1000),
      }));

      await productRepo.insert(productsRows);

      const products = await productRepo.find({
        select: ['id', 'name', 'price'],
      });

      console.log(`Products seeded: ${products.length}`);

      // ---- ORDERS + ITEMS ----
      const userIds = [buyerId, adminId];

      for (const userId of userIds) {
        for (let i = 0; i < ORDERS_PER_USER; i++) {
          const idempotencyKey = randomUUID();

          const orderInsert = await orderRepo.insert({
            userId,
            idempotencyKey,
            status: OrderStatus.CREATED,
            totalAmount: '0.00',
          });

          const orderId = orderInsert.identifiers[0]?.id as string;

          const itemsCount = randomInt(MIN_ITEMS, MAX_ITEMS);
          let total = 0;

          const valuesSql: string[] = [];
          const params: unknown[] = [];

          for (let j = 0; j < itemsCount; j++) {
            const product = products[randomInt(0, products.length - 1)];
            const quantity = randomInt(1, 3);
            const unitPrice = Number(product.price);

            total += unitPrice * quantity;

            const base = j * 5;
            valuesSql.push(
              `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`,
            );

            params.push(
              orderId,
              product.id,
              quantity,
              toMoney(unitPrice),
              product.name ?? null,
            );
          }

          await manager.query(
            `
              INSERT INTO "order_items"
                ("order_id", "product_id", "quantity", "unit_price", "product_name")
              VALUES ${valuesSql.join(', ')}
            `,
            params,
          );

          await orderRepo.update(orderId, {
            totalAmount: toMoney(total),
          });
        }
      }

      console.log(`Orders seeded: ${userIds.length * ORDERS_PER_USER}`);
    });
  } finally {
    await AppDataSource.destroy();
  }
}

runSeed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
