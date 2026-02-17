import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAuthFields17700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "user_role_enum" AS ENUM ('user','admin')`,
    );

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "role" "user_role_enum" NOT NULL DEFAULT 'user',
        ADD COLUMN "password_hash" text NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password_hash"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
    await queryRunner.query(`DROP TYPE "user_role_enum"`);
  }
}
