import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAvatarFileId17700000000004 implements MigrationInterface {
  name = 'AddUserAvatarFileId17700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "avatar_file_id" uuid NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_users_avatar_file_id" ON "users" ("avatar_file_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_avatar_file_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar_file_id"`);
  }
}
