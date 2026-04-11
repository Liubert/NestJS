import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiTokenDailyLimit17758000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE translation_projects
       ADD COLUMN IF NOT EXISTS ai_token_daily_limit INT NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE translation_projects
       DROP COLUMN IF EXISTS ai_token_daily_limit`,
    );
  }
}
