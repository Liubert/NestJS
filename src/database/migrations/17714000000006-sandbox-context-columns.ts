import { MigrationInterface, QueryRunner } from 'typeorm';

export class SandboxContextColumns17714000000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sandbox_values
        ADD COLUMN context VARCHAR(500) DEFAULT NULL,
        ADD COLUMN context_need VARCHAR(10) DEFAULT NULL,
        ADD COLUMN context_reason VARCHAR(300) DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sandbox_values
        DROP COLUMN IF EXISTS context,
        DROP COLUMN IF EXISTS context_need,
        DROP COLUMN IF EXISTS context_reason
    `);
  }
}
