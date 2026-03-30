import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiConfig17709000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "ai_config" (
        "id"                       uuid NOT NULL DEFAULT uuid_generate_v4(),
        "model"                    text NOT NULL DEFAULT 'gemini-2.0-flash',
        "translate_prompt"         text NOT NULL,
        "quality_translate_prompt" text NOT NULL,
        "quality_language_prompt"  text NOT NULL,
        "green_min_score"          integer NOT NULL DEFAULT 9,
        "yellow_min_score"         integer NOT NULL DEFAULT 8,
        "updated_at"               timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_config" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_config"`);
  }
}
