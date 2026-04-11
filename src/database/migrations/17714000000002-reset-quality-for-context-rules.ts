import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResetQualityForContextRules17714000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Reset all quality scores so the worker re-evaluates under new context-aware rules.
    // Skips 'expected' entries (manually accepted by users).
    await queryRunner.query(`
      UPDATE translation_values
      SET quality_review_state = 'not_checked',
          quality_score = NULL,
          quality_level = NULL,
          quality_comment = NULL,
          quality_checked_at = NULL
      WHERE quality_review_state != 'expected'
    `);
  }

  public async down(): Promise<void> {
    // Cannot restore previous scores — no-op
  }
}
