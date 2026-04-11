import { MigrationInterface, QueryRunner } from 'typeorm';

export class SandboxQualityColumns17714000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sandbox_values
        ADD COLUMN IF NOT EXISTS quality_score        SMALLINT        NULL,
        ADD COLUMN IF NOT EXISTS quality_level         VARCHAR(10)     NULL,
        ADD COLUMN IF NOT EXISTS quality_comment       TEXT            NULL,
        ADD COLUMN IF NOT EXISTS quality_checked_at    TIMESTAMPTZ     NULL,
        ADD COLUMN IF NOT EXISTS quality_review_state  VARCHAR(20)     NOT NULL DEFAULT 'not_checked'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sandbox_values
        DROP COLUMN IF EXISTS quality_review_state,
        DROP COLUMN IF EXISTS quality_checked_at,
        DROP COLUMN IF EXISTS quality_comment,
        DROP COLUMN IF EXISTS quality_level,
        DROP COLUMN IF EXISTS quality_score
    `);
  }
}
