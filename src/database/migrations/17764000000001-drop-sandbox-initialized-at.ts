import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropSandboxInitializedAt17764000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE translation_projects DROP COLUMN IF EXISTS sandbox_initialized_at`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE translation_projects ADD COLUMN sandbox_initialized_at TIMESTAMPTZ NULL`,
    );
  }
}
