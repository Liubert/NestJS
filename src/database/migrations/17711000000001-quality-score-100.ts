import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  DEFAULT_QUALITY_TRANSLATE_PROMPT,
  DEFAULT_QUALITY_LANGUAGE_PROMPT,
} from '../../modules/ai/ai-config.service.js';

/**
 * Migrates quality scoring from 0–10 to 0–100 scale.
 * - Existing stored scores are multiplied by 10.
 * - AI config thresholds are multiplied by 10.
 * - Quality prompts are updated to use the 1–100 scoring scale.
 */
export class QualityScore100_17711000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE translation_values
      SET quality_score = quality_score * 10
      WHERE quality_score IS NOT NULL
    `);

    await queryRunner.query(
      `UPDATE ai_config
       SET green_min_score            = green_min_score  * 10,
           yellow_min_score           = yellow_min_score * 10,
           quality_translate_prompt   = $1,
           quality_language_prompt    = $2`,
      [DEFAULT_QUALITY_TRANSLATE_PROMPT, DEFAULT_QUALITY_LANGUAGE_PROMPT],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE ai_config
      SET green_min_score  = green_min_score  / 10,
          yellow_min_score = yellow_min_score / 10
    `);

    await queryRunner.query(`
      UPDATE translation_values
      SET quality_score = quality_score / 10
      WHERE quality_score IS NOT NULL
    `);
  }
}
