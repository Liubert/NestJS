import { MigrationInterface, QueryRunner } from 'typeorm';

export class LocaleAliases17715000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE translation_locales
      ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE translation_locales
      DROP COLUMN IF EXISTS aliases
    `);
  }
}
