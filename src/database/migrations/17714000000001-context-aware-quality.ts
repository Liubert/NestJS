import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContextAwareQuality17714000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Widen context column from VARCHAR(200) to VARCHAR(500)
    await queryRunner.query(`
      ALTER TABLE translation_keys
      ALTER COLUMN context TYPE VARCHAR(500)
    `);

    // Add context_required flag — set by AI during quality evaluation
    await queryRunner.query(`
      ALTER TABLE translation_keys
      ADD COLUMN IF NOT EXISTS context_required BOOLEAN DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE translation_keys
      DROP COLUMN IF EXISTS context_required
    `);

    await queryRunner.query(`
      ALTER TABLE translation_keys
      ALTER COLUMN context TYPE VARCHAR(200)
    `);
  }
}
