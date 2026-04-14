import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiUsageTracking17713000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ai_usage_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
        operation VARCHAR(50) NOT NULL,
        input_tokens INT NOT NULL,
        output_tokens INT NOT NULL,
        total_tokens INT NOT NULL,
        model VARCHAR(100) NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_usage_logs_project_created"
      ON ai_usage_logs (project_id, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ai_usage_logs`);
  }
}
