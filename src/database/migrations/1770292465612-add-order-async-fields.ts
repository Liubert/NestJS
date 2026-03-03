import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderAsyncFields1770292465612 implements MigrationInterface {
  name = 'AddOrderAsyncFields1770292465612';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "processed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "requested_items" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `UPDATE "orders" SET "status" = 'pending' WHERE "status" = 'created'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "orders" SET "status" = 'created' WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'created'`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP COLUMN "requested_items"`,
    );
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "processed_at"`);
  }
}
