import { MigrationInterface, QueryRunner } from 'typeorm';

export class McpPrompts17708000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE mcp_prompts (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        prompt_key  VARCHAR(100) NOT NULL,
        content     TEXT NOT NULL,
        version     INTEGER NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by  UUID REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_mcp_prompts_key ON mcp_prompts(prompt_key)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE mcp_prompts`);
  }
}
