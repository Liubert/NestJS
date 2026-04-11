import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInitTranslate17757000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE translation_locales ADD COLUMN init_translate boolean NOT NULL DEFAULT false`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE translation_locales DROP COLUMN init_translate`,
    );
  }
}
