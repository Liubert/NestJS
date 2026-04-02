import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import type { EntityManager } from 'typeorm';

import { AppDataSource } from '../data-source/data-source';
import { UserEntity } from '../../modules/users/user.entity';
import { UserRole } from '../../modules/users/types/user-role.enum';

async function runSeed(): Promise<void> {
  await AppDataSource.initialize();

  try {
    await AppDataSource.transaction(async (manager: EntityManager) => {
      await manager.query(`
        TRUNCATE TABLE "users" RESTART IDENTITY CASCADE;
      `);

      const userRepo = manager.getRepository(UserEntity);

      const userHash = await bcrypt.hash('User123!', 10);
      const adminHash = await bcrypt.hash('Admin123!', 10);

      await userRepo.insert([
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
        {
          email: 'andriy.papa@ecit.com',
          firstName: 'Andriy',
          lastName: 'Papa',
          phone: null,
          passwordHash: adminHash,
          role: UserRole.ADMIN,
        },
        {
          email: 'Lfedyshyn@ecit.com',
          firstName: 'Liubomyr',
          lastName: 'Fedyshyn',
          phone: null,
          passwordHash: adminHash,
          role: UserRole.ADMIN,
        },
      ]);

      console.log('Users seeded');
    });
  } finally {
    await AppDataSource.destroy();
  }
}

runSeed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
