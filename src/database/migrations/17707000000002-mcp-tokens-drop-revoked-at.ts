import { MigrationInterface, QueryRunner } from 'typeorm';

export class McpTokensDropRevokedAt17707000000002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE mcp_tokens DROP COLUMN IF EXISTS revoked_at`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE mcp_tokens ADD COLUMN revoked_at TIMESTAMPTZ`,
    );
  }
}
