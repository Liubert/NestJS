import { MigrationInterface, QueryRunner } from 'typeorm';

export class LocaleGuidance17751000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE translation_locales ADD COLUMN IF NOT EXISTS guidance text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE translation_locales DROP COLUMN guidance`,
    );
  }
}
