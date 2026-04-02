import { MigrationInterface, QueryRunner } from 'typeorm';

export class ContextNeedReason1771400000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE translation_keys
        ADD COLUMN context_need VARCHAR(10) DEFAULT NULL,
        ADD COLUMN context_reason VARCHAR(300) DEFAULT NULL;
    `);

    // Backfill from old boolean column
    await queryRunner.query(`
      UPDATE translation_keys SET context_need = CASE
        WHEN context_required = true THEN 'required'
        WHEN context_required = false THEN 'none'
        ELSE NULL
      END;
    `);

    await queryRunner.query(`
      ALTER TABLE translation_keys DROP COLUMN context_required;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE translation_keys
        ADD COLUMN context_required BOOLEAN DEFAULT NULL;
    `);

    await queryRunner.query(`
      UPDATE translation_keys SET context_required = CASE
        WHEN context_need = 'required' THEN true
        WHEN context_need = 'none' THEN false
        ELSE NULL
      END;
    `);

    await queryRunner.query(`
      ALTER TABLE translation_keys
        DROP COLUMN context_need,
        DROP COLUMN context_reason;
    `);
  }
}
