import { MigrationInterface, QueryRunner } from 'typeorm';
import { LOCALE_GUIDELINES } from '../../modules/translations/locale-guidelines';

/**
 * Backfill existing locales with enriched translation guidance.
 * Only updates locales whose current guidance is shorter than the new one
 * (i.e. still has the old short version). Locales with custom user-written
 * guidance that is already longer are left untouched.
 */
export class BackfillEnrichedGuidance17753000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [code, guidance] of Object.entries(LOCALE_GUIDELINES)) {
      await queryRunner.query(
        `UPDATE translation_locales
         SET guidance = $1
         WHERE code = $2
           AND (guidance IS NULL OR LENGTH(guidance) < LENGTH($1))`,
        [guidance, code],
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No rollback — old short guidance is not preserved
  }
}
