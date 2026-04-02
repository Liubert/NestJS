import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResetQueuedQualityStates17714000000007 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE translation_values
      SET quality_review_state = 'not_checked'
      WHERE quality_review_state IN ('queued', 'processing')
    `);
  }

  async down(): Promise<void> {
    // No rollback — states were stale
  }
}
