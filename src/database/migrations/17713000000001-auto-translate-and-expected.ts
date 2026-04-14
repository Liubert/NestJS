import { MigrationInterface, QueryRunner } from 'typeorm';

export class AutoTranslateAndExpected1771300000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add auto_translate_enabled to projects
    await queryRunner.query(`
      ALTER TABLE translation_projects
      ADD COLUMN IF NOT EXISTS auto_translate_enabled boolean NOT NULL DEFAULT false
    `);

    // sandbox_values quality_review_state already supports free text;
    // just ensure any 'expected' values are valid (no-op if column already accepts it)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE translation_projects
      DROP COLUMN IF EXISTS auto_translate_enabled
    `);
  }
}
