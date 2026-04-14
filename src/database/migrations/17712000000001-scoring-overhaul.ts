import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScoringOverhaul17712000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Remove editable score threshold columns — scoring is now system-controlled
    await queryRunner.query(`
      ALTER TABLE ai_config
      DROP COLUMN IF EXISTS green_min_score,
      DROP COLUMN IF EXISTS yellow_min_score
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ai_config
      ADD COLUMN IF NOT EXISTS green_min_score integer DEFAULT 90,
      ADD COLUMN IF NOT EXISTS yellow_min_score integer DEFAULT 80
    `);
  }
}
