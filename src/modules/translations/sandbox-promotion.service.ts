import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProjectAccessHelper } from './helpers/project-access.helper.js';
import { ProjectEntity } from './entities/project.entity.js';
import { SandboxValueEntity } from './entities/sandbox-value.entity.js';
import {
  ProductionSnapshotEntity,
  SnapshotEntry,
} from './entities/production-snapshot.entity.js';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { NamespaceEntity } from './entities/namespace.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { UserRole } from '../users/types/user-role.enum.js';

const MAX_SNAPSHOTS = 5;

export type DiffStatus = 'added' | 'changed' | 'deleted' | 'unchanged';

export interface DiffQuality {
  score: number | null;
  level: 'green' | 'yellow' | 'red' | null;
  comment: string | null;
}

export interface DiffEntry {
  namespace: string;
  key: string;
  locale: string;
  status: DiffStatus;
  productionValue: string | null;
  sandboxValue: string | null;
  quality: DiffQuality | null;
}

@Injectable()
export class SandboxPromotionService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SandboxValueEntity)
    private readonly sandboxRepo: Repository<SandboxValueEntity>,
    @InjectRepository(ProductionSnapshotEntity)
    private readonly snapshotRepo: Repository<ProductionSnapshotEntity>,
    @InjectRepository(TranslationValueEntity)
    private readonly valueRepo: Repository<TranslationValueEntity>,
    @InjectRepository(TranslationKeyEntity)
    private readonly keyRepo: Repository<TranslationKeyEntity>,
    @InjectRepository(NamespaceEntity)
    private readonly namespaceRepo: Repository<NamespaceEntity>,
    @InjectRepository(LocaleEntity)
    private readonly localeRepo: Repository<LocaleEntity>,
    private readonly dataSource: DataSource,
    private readonly access: ProjectAccessHelper,
  ) {}

  // ─── Diff ─────────────────────────────────────────────────────────────────

  async getDiff(
    projectSlug: string,
    _userId: string,
    _role: UserRole,
  ): Promise<{
    total: number;
    added: number;
    changed: number;
    deleted: number;
    entries: DiffEntry[];
  }> {
    const project = await this.access.requireProject(projectSlug);

    this.access.assertSandboxInitialized(project);

    // Raw SQL: FULL OUTER JOIN production vs sandbox for this project
    const rows = await this.dataSource.query<
      {
        ns_slug: string;
        key: string;
        locale: string;
        production_value: string | null;
        sandbox_value: string | null;
        is_deleted: boolean | null;
        quality_score: number | null;
        quality_level: string | null;
        quality_comment: string | null;
      }[]
    >(
      `
      WITH production AS (
        SELECT
          ns.slug        AS ns_slug,
          tk.key         AS key,
          l.code         AS locale,
          tv.value       AS value
        FROM translation_values tv
        JOIN translation_keys tk ON tk.id = tv.key_id
        JOIN translation_namespaces ns ON ns.id = tk.namespace_id
        JOIN translation_locales l ON l.id = tv.locale_id
        WHERE ns.project_id = $1
      ),
      sandbox AS (
        SELECT
          ns.slug               AS ns_slug,
          tk.key                AS key,
          l.code                AS locale,
          sv.value              AS value,
          sv.is_deleted         AS is_deleted,
          sv.quality_score      AS quality_score,
          sv.quality_level      AS quality_level,
          sv.quality_comment    AS quality_comment
        FROM sandbox_values sv
        JOIN translation_keys tk ON tk.id = sv.key_id
        JOIN translation_namespaces ns ON ns.id = tk.namespace_id
        JOIN translation_locales l ON l.id = sv.locale_id
        WHERE sv.project_id = $1
      )
      SELECT
        COALESCE(p.ns_slug, s.ns_slug)  AS ns_slug,
        COALESCE(p.key,     s.key)      AS key,
        COALESCE(p.locale,  s.locale)   AS locale,
        p.value                         AS production_value,
        s.value                         AS sandbox_value,
        s.is_deleted                    AS is_deleted,
        s.quality_score                 AS quality_score,
        s.quality_level                 AS quality_level,
        s.quality_comment               AS quality_comment
      FROM production p
      FULL OUTER JOIN sandbox s
        ON p.ns_slug = s.ns_slug
       AND p.key = s.key
       AND p.locale = s.locale
      WHERE
        -- Only rows that differ between production and sandbox
        p.key IS NULL                                          -- added in sandbox
        OR s.is_deleted = true                                 -- deleted in sandbox
        OR (p.value IS DISTINCT FROM s.value AND s.is_deleted IS NOT TRUE)  -- changed
      ORDER BY ns_slug, key, locale
    `,
      [project.id],
    );

    const entries: DiffEntry[] = rows.map((r) => ({
      namespace: r.ns_slug,
      key: r.key,
      locale: r.locale,
      status: r.is_deleted
        ? 'deleted'
        : r.production_value === null
          ? 'added'
          : 'changed',
      productionValue: r.production_value,
      sandboxValue: r.is_deleted ? null : r.sandbox_value,
      quality:
        r.quality_score != null
          ? {
              score: r.quality_score,
              level: r.quality_level as DiffQuality['level'],
              comment: r.quality_comment,
            }
          : null,
    }));

    return {
      total: entries.length,
      added: entries.filter((e) => e.status === 'added').length,
      changed: entries.filter((e) => e.status === 'changed').length,
      deleted: entries.filter((e) => e.status === 'deleted').length,
      entries,
    };
  }

  // ─── Promote ──────────────────────────────────────────────────────────────

  /**
   * Promotes sandbox to production atomically:
   * 1. Snapshot production state for revert
   * 2. Replace production values with sandbox values
   * 3. Clean up sandbox-only deleted keys
   * 4. Re-init sandbox from new production state
   */
  async promote(
    projectSlug: string,
    userId: string,
    role: UserRole,
  ): Promise<{ snapshotId: string; promoted: number }> {
    const project = await this.access.requireProject(projectSlug);

    this.access.assertSandboxInitialized(project);

    this.access.assertOwnerOrAdmin(
      project,
      userId,
      role,
      'promote sandbox to production',
    );

    return this.dataSource.transaction(async (manager) => {
      // 1. Snapshot current production state
      const snapshotRows = await manager.query<SnapshotEntry[]>(
        `
        SELECT
          ns.slug   AS namespace,
          tk.key    AS key,
          l.code    AS locale,
          tv.value  AS value
        FROM translation_values tv
        JOIN translation_keys tk ON tk.id = tv.key_id
        JOIN translation_namespaces ns ON ns.id = tk.namespace_id
        JOIN translation_locales l ON l.id = tv.locale_id
        WHERE ns.project_id = $1
      `,
        [project.id],
      );

      const snapshot = manager.getRepository(ProductionSnapshotEntity).create({
        projectId: project.id,
        label: `before-promote-${new Date().toISOString().slice(0, 10)}`,
        data: snapshotRows,
      });
      const savedSnapshot = await manager.save(
        ProductionSnapshotEntity,
        snapshot,
      );

      // Prune old snapshots — keep only MAX_SNAPSHOTS most recent
      await manager.query(
        `
        DELETE FROM production_snapshots
        WHERE project_id = $1
          AND id NOT IN (
            SELECT id FROM production_snapshots
            WHERE project_id = $1
            ORDER BY created_at DESC
            LIMIT $2
          )
      `,
        [project.id, MAX_SNAPSHOTS],
      );

      // 2. Delete current production values for this project
      await manager.query(
        `
        DELETE FROM translation_values
        WHERE key_id IN (
          SELECT tk.id FROM translation_keys tk
          JOIN translation_namespaces ns ON ns.id = tk.namespace_id
          WHERE ns.project_id = $1
        )
      `,
        [project.id],
      );

      // 3. Insert sandbox values (non-deleted) as new production values
      const insertResult = await manager.query<{ id: string }[]>(
        `
        INSERT INTO translation_values (id, key_id, locale_id, value, updated_at)
        SELECT gen_random_uuid(), sv.key_id, sv.locale_id, sv.value, now()
        FROM sandbox_values sv
        WHERE sv.project_id = $1 AND sv.is_deleted = false
        RETURNING id
      `,
        [project.id],
      );

      const promotedCount = insertResult.length;

      // 4. Delete sandbox-only keys that were deleted in sandbox
      // (keys with no production values after the insert and no non-deleted sandbox values)
      await manager.query(
        `
        DELETE FROM translation_keys
        WHERE id IN (
          SELECT DISTINCT sv.key_id
          FROM sandbox_values sv
          WHERE sv.project_id = $1
            AND sv.is_deleted = true
            AND NOT EXISTS (
              SELECT 1 FROM translation_values tv2 WHERE tv2.key_id = sv.key_id
            )
        )
      `,
        [project.id],
      );

      // 5. Reset sandbox: delete all sandbox rows, re-copy from new production
      await manager.query(`DELETE FROM sandbox_values WHERE project_id = $1`, [
        project.id,
      ]);

      await manager.query(
        `
        INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at)
        SELECT ns.project_id, tv.key_id, tv.locale_id, tv.value, false, now()
        FROM translation_values tv
        JOIN translation_keys tk ON tk.id = tv.key_id
        JOIN translation_namespaces ns ON ns.id = tk.namespace_id
        WHERE ns.project_id = $1
      `,
        [project.id],
      );

      await manager.update(ProjectEntity, project.id, {
        sandboxInitializedAt: new Date(),
        sandboxHasChanges: false,
      });

      return { snapshotId: savedSnapshot.id, promoted: promotedCount };
    });
  }

  async promoteSelective(
    projectSlug: string,
    keys: { namespace: string; key: string }[],
    userId: string,
    role: UserRole,
  ): Promise<{ snapshotId: string; promoted: number }> {
    const project = await this.access.requireProject(projectSlug);

    this.access.assertSandboxInitialized(project);

    this.access.assertOwnerOrAdmin(
      project,
      userId,
      role,
      'promote sandbox to production',
    );

    return this.dataSource.transaction(async (manager) => {
      // 1. Snapshot current production state
      const snapshotRows = await manager.query<SnapshotEntry[]>(
        `SELECT ns.slug AS namespace, tk.key AS key, l.code AS locale, tv.value AS value
         FROM translation_values tv
         JOIN translation_keys tk ON tk.id = tv.key_id
         JOIN translation_namespaces ns ON ns.id = tk.namespace_id
         JOIN translation_locales l ON l.id = tv.locale_id
         WHERE ns.project_id = $1`,
        [project.id],
      );

      const snapshot = manager.getRepository(ProductionSnapshotEntity).create({
        projectId: project.id,
        label: `before-selective-promote-${new Date().toISOString().slice(0, 10)}`,
        data: snapshotRows,
      });
      const savedSnapshot = await manager.save(
        ProductionSnapshotEntity,
        snapshot,
      );

      let promoted = 0;

      for (const { namespace, key } of keys) {
        // Find the key
        const keyRows = await manager.query<{ key_id: string }[]>(
          `SELECT tk.id AS key_id
           FROM translation_keys tk
           JOIN translation_namespaces ns ON ns.id = tk.namespace_id
           WHERE ns.project_id = $1 AND ns.slug = $2 AND tk.key = $3`,
          [project.id, namespace, key],
        );
        if (!keyRows.length) continue;
        const keyId = keyRows[0].key_id;

        // Get sandbox values for this key
        const svRows = await manager.query<
          { locale_id: string; value: string | null; is_deleted: boolean }[]
        >(
          `SELECT locale_id, value, is_deleted FROM sandbox_values
           WHERE project_id = $1 AND key_id = $2`,
          [project.id, keyId],
        );

        for (const sv of svRows) {
          if (sv.is_deleted) {
            // Delete from production
            await manager.query(
              `DELETE FROM translation_values WHERE key_id = $1 AND locale_id = $2`,
              [keyId, sv.locale_id],
            );
          } else {
            // Upsert into production
            await manager.query(
              `INSERT INTO translation_values (id, key_id, locale_id, value, updated_at)
               VALUES (gen_random_uuid(), $1, $2, $3, now())
               ON CONFLICT (key_id, locale_id) DO UPDATE SET value = $3, updated_at = now()`,
              [keyId, sv.locale_id, sv.value],
            );
            promoted++;
          }
        }

        // Re-sync sandbox for this key from production
        await manager.query(
          `DELETE FROM sandbox_values WHERE project_id = $1 AND key_id = $2`,
          [project.id, keyId],
        );
        await manager.query(
          `INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at)
           SELECT $1, tv.key_id, tv.locale_id, tv.value, false, now()
           FROM translation_values tv
           WHERE tv.key_id = $2`,
          [project.id, keyId],
        );
      }

      // Check if sandbox still has remaining changes
      const remaining = await manager.query<{ cnt: string }[]>(
        `SELECT COUNT(*) AS cnt FROM (
           SELECT sv.key_id, sv.locale_id
           FROM sandbox_values sv
           WHERE sv.project_id = $1
           EXCEPT
           SELECT tv.key_id, tv.locale_id
           FROM translation_values tv
           JOIN translation_keys tk ON tk.id = tv.key_id
           JOIN translation_namespaces ns ON ns.id = tk.namespace_id
           WHERE ns.project_id = $1
         ) diff`,
        [project.id],
      );
      const hasChanges = Number(remaining[0]?.cnt ?? 0) > 0;
      await manager.update(ProjectEntity, project.id, {
        sandboxHasChanges: hasChanges,
      });

      return { snapshotId: savedSnapshot.id, promoted };
    });
  }

  // ─── Revert ───────────────────────────────────────────────────────────────

  /**
   * Reverts production to a previous snapshot.
   * Sandbox is NOT affected — it retains its current state.
   */
  async revert(
    projectSlug: string,
    snapshotId: string,
    userId: string,
    role: UserRole,
  ): Promise<{ restored: number }> {
    const project = await this.access.requireProject(projectSlug);

    this.access.assertOwnerOrAdmin(project, userId, role, 'revert production');

    const snapshot = await this.snapshotRepo.findOne({
      where: { id: snapshotId, projectId: project.id },
    });
    if (!snapshot) {
      throw new NotFoundException('Snapshot not found');
    }

    return this.dataSource.transaction(async (manager) => {
      // Delete current production values for this project
      await manager.query(
        `
        DELETE FROM translation_values
        WHERE key_id IN (
          SELECT tk.id FROM translation_keys tk
          JOIN translation_namespaces ns ON ns.id = tk.namespace_id
          WHERE ns.project_id = $1
        )
      `,
        [project.id],
      );

      // Restore from snapshot via temp lookup of key/locale IDs by name
      let restoredCount = 0;
      for (const entry of snapshot.data) {
        const ns = await manager.findOne(NamespaceEntity, {
          where: { projectId: project.id, slug: entry.namespace },
        });
        if (!ns) continue;

        const key = await manager.findOne(TranslationKeyEntity, {
          where: { namespaceId: ns.id, key: entry.key },
        });
        if (!key) continue;

        const locale = await manager.findOne(LocaleEntity, {
          where: { projectId: project.id, code: entry.locale },
        });
        if (!locale) continue;

        await manager.insert(TranslationValueEntity, {
          keyId: key.id,
          localeId: locale.id,
          value: entry.value,
        });
        restoredCount++;
      }

      return { restored: restoredCount };
    });
  }
}
