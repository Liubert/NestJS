import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Performance optimization: add GIN index for the locale aliases
 * array-overlap operator used in the hot
 * GET /translations/:projectSlug/:namespace/:locale path.
 *
 * Other candidate indexes (on slug columns, composite key_id+locale_id)
 * are already covered by existing UNIQUE constraints which create
 * implicit B-tree indexes in PostgreSQL.
 */
export class PerformanceIndexes17765000000001 implements MigrationInterface {
  name = 'PerformanceIndexes17765000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // GIN index on locale aliases for the && (array overlap) operator
    // used in resolveLocaleCandidates: l.aliases && ARRAY[...]::text[]
    // No existing index covers this — UNIQUE is on (project_id, code).
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_translation_locales_aliases_gin"
       ON "translation_locales" USING GIN ("aliases")
       WHERE "aliases" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_translation_locales_aliases_gin"`,
    );
  }
}
