import { MigrationInterface, QueryRunner } from 'typeorm';

export class QualityColumns17709000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE translation_values
        ADD COLUMN quality_score    INTEGER,
        ADD COLUMN quality_level    VARCHAR(10),
        ADD COLUMN quality_comment  TEXT,
        ADD COLUMN quality_checked_at TIMESTAMPTZ
    `);
    await queryRunner.query(
      `CREATE INDEX idx_tv_quality_level ON translation_values(quality_level)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_tv_quality_level`);
    await queryRunner.query(`
      ALTER TABLE translation_values
        DROP COLUMN quality_score,
        DROP COLUMN quality_level,
        DROP COLUMN quality_comment,
        DROP COLUMN quality_checked_at
    `);
  }
}
