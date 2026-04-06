import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillAiTokenDailyLimit17759000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE translation_projects
       SET ai_token_daily_limit = 2000000
       WHERE ai_token_daily_limit IS NULL OR ai_token_daily_limit < 2000000`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // intentionally a no-op — cannot distinguish backfilled from user-set
  }
}
