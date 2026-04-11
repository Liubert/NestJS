import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFeedbackStatusAndSoftDelete17755000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "agent_feedback"
        ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'new'
    `);

    await queryRunner.query(`
      UPDATE "agent_feedback"
        SET "status" = 'done'
        WHERE "reviewed" = true AND "status" = 'new'
    `);

    await queryRunner.query(`
      ALTER TABLE "agent_feedback"
        ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_feedback_status
        ON agent_feedback (status)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_agent_feedback_deleted_at
        ON agent_feedback (deleted_at)
        WHERE deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_agent_feedback_deleted_at`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_agent_feedback_status`);
    await queryRunner.query(
      `ALTER TABLE "agent_feedback" DROP COLUMN IF EXISTS "deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "agent_feedback" DROP COLUMN IF EXISTS "status"`,
    );
  }
}
