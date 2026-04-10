import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingAutoTranslate17763000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE sandbox_values ADD COLUMN pending_auto_translate boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE translation_locales DROP COLUMN IF EXISTS init_translate`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE translation_locales ADD COLUMN init_translate boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE sandbox_values DROP COLUMN pending_auto_translate`,
    );
  }
}
