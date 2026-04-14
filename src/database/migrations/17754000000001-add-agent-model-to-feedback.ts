import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentModelToFeedback17754000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_feedback" ADD COLUMN "agent_model" varchar(100)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agent_feedback" DROP COLUMN "agent_model"`,
    );
  }
}
