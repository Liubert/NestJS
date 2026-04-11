import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAiConfigLocaleCodes17760000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE ai_config
       SET translate_prompt = REPLACE(REPLACE(translate_prompt, 'nb-NO', 'nb'), 'da-DK', 'da')
       WHERE translate_prompt LIKE '%nb-NO%' OR translate_prompt LIKE '%da-DK%'`,
    );

    await queryRunner.query(
      `UPDATE ai_config
       SET quality_translate_prompt = REPLACE(REPLACE(quality_translate_prompt, 'nb-NO', 'nb'), 'da-DK', 'da')
       WHERE quality_translate_prompt LIKE '%nb-NO%' OR quality_translate_prompt LIKE '%da-DK%'`,
    );

    await queryRunner.query(
      `UPDATE ai_config
       SET quality_language_prompt = REPLACE(REPLACE(quality_language_prompt, 'nb-NO', 'nb'), 'da-DK', 'da')
       WHERE quality_language_prompt LIKE '%nb-NO%' OR quality_language_prompt LIKE '%da-DK%'`,
    );

    await queryRunner.query(
      `UPDATE ai_config
       SET context_detection_prompt = REPLACE(REPLACE(context_detection_prompt, 'nb-NO', 'nb'), 'da-DK', 'da')
       WHERE context_detection_prompt LIKE '%nb-NO%' OR context_detection_prompt LIKE '%da-DK%'`,
    );
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // intentionally a no-op — nb-NO and da-DK were incorrect codes; restoring them would reintroduce the bug
  }
}
