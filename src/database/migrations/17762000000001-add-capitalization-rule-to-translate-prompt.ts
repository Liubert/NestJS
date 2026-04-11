import { MigrationInterface, QueryRunner } from 'typeorm';

const OLD_RULE = `- Preserve any placeholders, variables, or formatting tokens exactly (e.g. {{name}}, %s, {count})`;
const NEW_RULE = `- Preserve any placeholders, variables, or formatting tokens exactly (e.g. {{name}}, %s, {count})
- Preserve the capitalization of the source text exactly: lowercase source → translation must start lowercase (e.g. "book" → "réserver", never "Réserver"); ALL CAPS → ALL CAPS`;

export class AddCapitalizationRuleToTranslatePrompt17762000000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE ai_config
       SET translate_prompt = REPLACE(translate_prompt, $1, $2)
       WHERE translate_prompt LIKE '%Preserve any placeholders%'
         AND translate_prompt NOT LIKE '%capitalization%'`,
      [OLD_RULE, NEW_RULE],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE ai_config
       SET translate_prompt = REPLACE(translate_prompt, $1, $2)
       WHERE translate_prompt LIKE '%capitalization of the source text%'`,
      [NEW_RULE, OLD_RULE],
    );
  }
}
