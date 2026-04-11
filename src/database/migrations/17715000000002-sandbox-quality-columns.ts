import { MigrationInterface, QueryRunner } from 'typeorm';

export class SandboxQualityColumns17715000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add missing quality columns to sandbox_values.
    // These columns exist on translation_values (added by 17709000000001 and 17710000000001)
    // but were never added to sandbox_values, causing 500 errors on any sandbox
    // operation that reads or writes quality fields.
    await queryRunner.query(`
      ALTER TABLE sandbox_values
        ADD COLUMN IF NOT EXISTS quality_score    SMALLINT         DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS quality_level    VARCHAR(10)      DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS quality_comment  TEXT             DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS quality_checked_at TIMESTAMPTZ    DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS quality_review_state VARCHAR(20)  NOT NULL DEFAULT 'not_checked'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sandbox_values
        DROP COLUMN IF EXISTS quality_score,
        DROP COLUMN IF EXISTS quality_level,
        DROP COLUMN IF EXISTS quality_comment,
        DROP COLUMN IF EXISTS quality_checked_at,
        DROP COLUMN IF EXISTS quality_review_state
    `);
  }
}
