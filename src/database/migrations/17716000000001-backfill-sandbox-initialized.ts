import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillSandboxInitialized17716000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // All projects should have sandbox initialized by default.
    // Backfill projects that were created before auto-initialization was added.
    await queryRunner.query(`
      UPDATE translation_projects
      SET sandbox_initialized_at = COALESCE(created_at, now())
      WHERE sandbox_initialized_at IS NULL
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No rollback — cannot distinguish which projects were backfilled vs genuinely initialized
  }
}
