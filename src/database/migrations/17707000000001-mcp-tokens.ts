import { MigrationInterface, QueryRunner } from 'typeorm';

export class McpTokens17707000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE mcp_tokens (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        VARCHAR(100) NOT NULL,
        token_hash  VARCHAR(64) NOT NULL UNIQUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_used_at TIMESTAMPTZ,
        revoked_at  TIMESTAMPTZ
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_mcp_tokens_user_id ON mcp_tokens(user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_mcp_tokens_token_hash ON mcp_tokens(token_hash)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE mcp_tokens`);
  }
}
