import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContextDetectionPrompt17714000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ai_config
      ADD COLUMN IF NOT EXISTS context_detection_prompt TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ai_config
      DROP COLUMN IF EXISTS context_detection_prompt
    `);
  }
}
