import { MigrationInterface, QueryRunner } from 'typeorm';

export class SandboxQualityContentHash17715000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sandbox_values
        ADD COLUMN IF NOT EXISTS quality_content_hash VARCHAR(64) DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sandbox_values
        DROP COLUMN IF EXISTS quality_content_hash
    `);
  }
}
