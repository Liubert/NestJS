import { MigrationInterface, QueryRunner } from 'typeorm';

export class QualityReviewState17710000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE translation_values
        ADD COLUMN IF NOT EXISTS quality_review_state VARCHAR(20) NOT NULL DEFAULT 'not_checked',
        ADD COLUMN IF NOT EXISTS quality_content_hash VARCHAR(64) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_tv_quality_review_state
        ON translation_values (quality_review_state)
        WHERE quality_review_state IN ('not_checked', 'failed')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_tv_quality_review_state`);
    await queryRunner.query(`
      ALTER TABLE translation_values
        DROP COLUMN IF EXISTS quality_review_state,
        DROP COLUMN IF EXISTS quality_content_hash
    `);
  }
}
