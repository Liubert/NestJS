import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSkippedQualityState1771400000005 implements MigrationInterface {
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // 'skipped' state added to quality_review_state — VARCHAR(20) column accepts any string.
    // No DDL change needed; this migration documents the addition of the 'skipped' value.
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No DDL to revert.
  }
}
