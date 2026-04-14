import { MigrationInterface, QueryRunner } from 'typeorm';

export class SandboxEnvironment17706000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── sandbox_values ──────────────────────────────────────────────────────
    // Working copy of production values per project.
    // Rows only exist after sandbox is initialized (explicit or on first edit).
    // is_deleted = true represents "deleted in sandbox, exists in production".
    await queryRunner.query(`
      CREATE TABLE sandbox_values (
        id           UUID        NOT NULL DEFAULT gen_random_uuid(),
        project_id   UUID        NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
        key_id       UUID        NOT NULL REFERENCES translation_keys(id)     ON DELETE CASCADE,
        locale_id    UUID        NOT NULL REFERENCES translation_locales(id)  ON DELETE CASCADE,
        value        TEXT,
        is_deleted   BOOLEAN     NOT NULL DEFAULT false,
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pk_sandbox_values PRIMARY KEY (id),
        CONSTRAINT uq_sandbox_values UNIQUE (project_id, key_id, locale_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_sandbox_values_project ON sandbox_values (project_id)
    `);

    // ── production_snapshots ─────────────────────────────────────────────────
    // Taken automatically before every promote, used for revert.
    // data = JSON array of { namespace, key, locale, value }.
    // Max 5 snapshots per project (enforced in application layer).
    await queryRunner.query(`
      CREATE TABLE production_snapshots (
        id          UUID        NOT NULL DEFAULT gen_random_uuid(),
        project_id  UUID        NOT NULL REFERENCES translation_projects(id) ON DELETE CASCADE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        label       TEXT,
        data        JSONB       NOT NULL,
        CONSTRAINT pk_production_snapshots PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_production_snapshots_project ON production_snapshots (project_id, created_at DESC)
    `);

    // ── translation_projects — sandbox state columns ──────────────────────────
    await queryRunner.query(`
      ALTER TABLE translation_projects
        ADD COLUMN sandbox_initialized_at TIMESTAMPTZ NULL,
        ADD COLUMN sandbox_has_changes    BOOLEAN     NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE translation_projects DROP COLUMN IF EXISTS sandbox_has_changes`,
    );
    await queryRunner.query(
      `ALTER TABLE translation_projects DROP COLUMN IF EXISTS sandbox_initialized_at`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS production_snapshots`);
    await queryRunner.query(`DROP TABLE IF EXISTS sandbox_values`);
  }
}
