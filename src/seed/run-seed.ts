// comments in English
import { dataSource } from '../data-source/data-source';
import { ProductEntity } from '../modules/products/entities/product.entity';
import { UserEntity } from '../modules/users/user.entity';

// ---- PRODUCTS ----
const PRODUCTS_COUNT = 10000;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function runSeed() {
  await dataSource.initialize();

  const userRepo = dataSource.getRepository(UserEntity);
  const productRepo = dataSource.getRepository(ProductEntity);

  await productRepo.clear();
  await userRepo.clear();

  // ---- USERS ----
  const users = userRepo.create([
    {
      email: 'buyer1@test.com',
      firstName: 'John',
      lastName: 'Doe',
    },
    {
      email: 'buyer2@test.com',
      firstName: 'Jane',
      lastName: 'Smith',
    },
  ]);

  await userRepo.save(users);
  console.log(`Seeded ${users.length} users`);

  const now = new Date();
  const products: ProductEntity[] = [];

  for (let i = 0; i < PRODUCTS_COUNT; i++) {
    // each product is older than the previous one
    const createdAt = new Date(now.getTime() - i * 60 * 1000); // -1 min per product

    products.push(
      productRepo.create({
        name: `Product #${i + 1}`,
        price: (randomInt(10, 1000) + 0.99).toFixed(2),
        stock: randomInt(0, 50),
        isActive: true,
        createdAt,
      }),
    );
  }

  await productRepo.save(products);
  console.log(`Seeded ${products.length} products`);

  await dataSource.destroy();
}

runSeed()
  .then(() => {
    console.log('Seed completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed failed', err);
    process.exit(1);
  });
