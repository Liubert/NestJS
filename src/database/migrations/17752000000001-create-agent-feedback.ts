import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgentFeedback17752000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS agent_feedback (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id    uuid REFERENCES translation_projects(id) ON DELETE SET NULL,
        is_mcp_token  boolean NOT NULL DEFAULT false,
        category      varchar(30) NOT NULL,
        tool_or_endpoint varchar(200),
        action_attempted varchar(500),
        result_status varchar(20),
        severity      varchar(10) NOT NULL DEFAULT 'medium',
        message       text NOT NULL,
        suggestion    text,
        agent_name    varchar(50),
        agent_version varchar(50),
        session_id    varchar(100),
        created_at    timestamptz NOT NULL DEFAULT now(),
        reviewed      boolean NOT NULL DEFAULT false,
        reviewer_note text
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_agent_feedback_user_id ON agent_feedback (user_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_agent_feedback_project_id ON agent_feedback (project_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_agent_feedback_category ON agent_feedback (category)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_agent_feedback_created_at ON agent_feedback (created_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE agent_feedback`);
  }
}
