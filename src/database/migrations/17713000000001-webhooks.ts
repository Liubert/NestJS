import { MigrationInterface, QueryRunner } from 'typeorm';

export class Webhooks17713000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE webhooks (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        project_id uuid NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
        url text NOT NULL,
        description text,
        enabled boolean NOT NULL DEFAULT true,
        events jsonb NOT NULL DEFAULT '[]'::jsonb,
        secret text,
        consecutive_failures integer NOT NULL DEFAULT 0,
        last_failure_at timestamptz,
        last_success_at timestamptz,
        auto_disabled boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_webhooks_project_id ON webhooks (project_id)
    `);

    await queryRunner.query(`
      CREATE INDEX idx_webhooks_enabled ON webhooks (project_id) WHERE enabled = true AND auto_disabled = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS webhooks`);
  }
}
