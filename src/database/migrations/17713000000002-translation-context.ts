import { MigrationInterface, QueryRunner } from 'typeorm';

export class TranslationContext17713000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE translation_keys
      ADD COLUMN context VARCHAR(200) DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE translation_keys
      DROP COLUMN IF EXISTS context
    `);
  }
}
