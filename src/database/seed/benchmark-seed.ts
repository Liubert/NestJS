/**
 * Benchmark seed: creates a project with 2000 keys × 5 locales = 10 000 translation values.
 * Used to establish a realistic baseline for the public GET /translations/:slug/:ns/:locale endpoint.
 *
 * Usage:
 *   npx ts-node src/database/seed/benchmark-seed.ts
 *   # or inside Docker:
 *   docker exec nest_js-api-1 npx ts-node src/database/seed/benchmark-seed.ts
 */
import 'reflect-metadata';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source/data-source';

const PROJECT_SLUG = 'perf-bench';
const PROJECT_NAME = 'Performance Benchmark';
const NAMESPACE_SLUG = 'common';
const KEY_COUNT = 2000;
const LOCALES = ['en', 'uk', 'de', 'fr', 'es'];

interface IdRow {
  id: string;
}

interface KeyRow {
  id: string;
  key: string;
}

async function benchmarkSeed(): Promise<void> {
  await AppDataSource.initialize();

  try {
    await AppDataSource.transaction(async (em: EntityManager) => {
      // Clean up previous benchmark data
      const existing: IdRow[] = await em.query(
        `SELECT id FROM translation_projects WHERE slug = $1`,
        [PROJECT_SLUG],
      );
      if (existing.length > 0) {
        await em.query(`DELETE FROM translation_projects WHERE slug = $1`, [
          PROJECT_SLUG,
        ]);
        console.log('Cleaned up previous benchmark project');
      }

      // Create project
      const [project]: IdRow[] = await em.query(
        `INSERT INTO translation_projects (slug, name) VALUES ($1, $2) RETURNING id`,
        [PROJECT_SLUG, PROJECT_NAME],
      );
      const projectId = project.id;
      console.log(`Created project: ${PROJECT_SLUG} (${projectId})`);

      // Create locales
      const localeIds: Record<string, string> = {};
      for (const code of LOCALES) {
        const [locale]: IdRow[] = await em.query(
          `INSERT INTO translation_locales (project_id, code, is_default)
           VALUES ($1, $2, $3) RETURNING id`,
          [projectId, code, code === 'en'],
        );
        localeIds[code] = locale.id;
      }
      console.log(`Created ${LOCALES.length} locales: ${LOCALES.join(', ')}`);

      // Create namespace
      const [ns]: IdRow[] = await em.query(
        `INSERT INTO translation_namespaces (project_id, slug) VALUES ($1, $2) RETURNING id`,
        [projectId, NAMESPACE_SLUG],
      );
      const nsId = ns.id;
      console.log(`Created namespace: ${NAMESPACE_SLUG}`);

      // Batch-create keys
      const keyValues: string[] = [];
      const keyParams: unknown[] = [];
      let paramIdx = 1;

      for (let i = 0; i < KEY_COUNT; i++) {
        keyValues.push(`($${paramIdx++}, $${paramIdx++})`);
        keyParams.push(nsId, `app.module${Math.floor(i / 50)}.key${i}`);
      }

      const keyRows: KeyRow[] = await em.query(
        `INSERT INTO translation_keys (namespace_id, key) VALUES ${keyValues.join(', ')} RETURNING id, key`,
        keyParams,
      );
      console.log(`Created ${keyRows.length} keys`);

      // Batch-insert translation values per locale
      let totalValues = 0;
      const CHUNK = 500;
      for (const code of LOCALES) {
        const localeId = localeIds[code];

        for (let c = 0; c < keyRows.length; c += CHUNK) {
          const chunk = keyRows.slice(c, c + CHUNK);
          const valValues: string[] = [];
          const valParams: unknown[] = [];
          let vIdx = 1;

          for (const row of chunk) {
            valValues.push(`($${vIdx++}, $${vIdx++}, $${vIdx++})`);
            valParams.push(
              row.id,
              localeId,
              `[${code}] ${row.key} — sample translation text for benchmarking`,
            );
          }

          await em.query(
            `INSERT INTO translation_values (key_id, locale_id, value) VALUES ${valValues.join(', ')}`,
            valParams,
          );
        }
        totalValues += keyRows.length;
      }
      console.log(`Created ${totalValues} translation values`);
    });

    console.log('\n✓ Benchmark seed complete');
    console.log(
      `  Test URL: GET /translations/${PROJECT_SLUG}/${NAMESPACE_SLUG}/en`,
    );
    console.log(`  Keys: ${KEY_COUNT}, Locales: ${LOCALES.length}`);
    console.log(`  Total values: ${KEY_COUNT * LOCALES.length}`);
  } finally {
    await AppDataSource.destroy();
  }
}

benchmarkSeed().catch((err: unknown) => {
  console.error('Benchmark seed failed:', err);
  process.exit(1);
});
