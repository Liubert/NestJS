import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { resolveLocaleAlias } from './constants/locale-aliases.const.js';
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
import { CreateEntryDto } from './dto/create-entry.dto.js';
import { UpdateEntryDto } from './dto/update-entry.dto.js';
import { ListEntriesQueryDto } from './dto/list-entries-query.dto.js';
import {
  paginate,
  PaginatedResponse,
} from '../../common/dto/paginated-response.dto.js';
import type { QualityInfo } from './translations.service.js';

const MAX_SNAPSHOTS = 5;

export interface SandboxEntryRow {
  key: string;
  createdAt: Date;
  context: string | null;
  values: Record<string, string>;
  quality: Record<string, QualityInfo | null>;
}

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
export class SandboxService {
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

  // ─── Initialize sandbox ───────────────────────────────────────────────────

  /**
   * Copies all current production values into sandbox_values.
   * Safe to call multiple times — existing sandbox rows are preserved (ON CONFLICT DO NOTHING).
   * Call explicitly to reset: pass force=true to wipe and re-copy.
   */
  async initSandbox(
    projectSlug: string,
    userId: string,
    role: UserRole,
    force = false,
  ): Promise<{ initialized: boolean; copiedRows: number }> {
    const project = await this.access.requireProject(projectSlug);

    if (force) {
      await this.sandboxRepo.delete({ projectId: project.id });
    } else if (project.sandboxInitializedAt) {
      return { initialized: false, copiedRows: 0 };
    }

    // Copy all production values for this project into sandbox
    const result = await this.dataSource.query<{ count: string }[]>(
      `
      INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at)
      SELECT
        ns.project_id,
        tv.key_id,
        tv.locale_id,
        tv.value,
        false,
        now()
      FROM translation_values tv
      JOIN translation_keys tk ON tk.id = tv.key_id
      JOIN translation_namespaces ns ON ns.id = tk.namespace_id
      WHERE ns.project_id = $1
      ON CONFLICT (project_id, key_id, locale_id) DO NOTHING
      RETURNING id
    `,
      [project.id],
    );

    const copiedRows = Array.isArray(result) ? result.length : 0;

    await this.projectRepo.update(project.id, {
      sandboxInitializedAt: new Date(),
      sandboxHasChanges: false,
    });

    return { initialized: true, copiedRows };
  }

  // ─── Get sandbox status ───────────────────────────────────────────────────

  async getSandboxStatus(projectSlug: string): Promise<{
    initialized: boolean;
    initializedAt: Date | null;
    hasChanges: boolean;
    snapshotCount: number;
  }> {
    const project = await this.access.requireProject(projectSlug);
    const snapshotCount = await this.snapshotRepo.count({
      where: { projectId: project.id },
    });

    return {
      initialized: !!project.sandboxInitializedAt,
      initializedAt: project.sandboxInitializedAt,
      hasChanges: project.sandboxHasChanges,
      snapshotCount,
    };
  }

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

  // ─── Update a value in sandbox ────────────────────────────────────────────

  /**
   * Upserts a sandbox value. Called from the entries service when sandbox mode is active.
   * Creates sandbox row if not exists; updates if exists.
   */
  async upsertSandboxValue(
    projectId: string,
    keyId: string,
    localeId: string,
    value: string,
  ): Promise<void> {
    await this.sandboxRepo.upsert(
      { projectId, keyId, localeId, value, isDeleted: false },
      {
        conflictPaths: ['projectId', 'keyId', 'localeId'],
        skipUpdateIfNoValuesChanged: true,
      },
    );
    await this.projectRepo.update(projectId, { sandboxHasChanges: true });
  }

  /**
   * Marks a value as deleted in sandbox (soft delete — preserves diff visibility).
   */
  async deleteSandboxValue(
    projectId: string,
    keyId: string,
    localeId: string,
  ): Promise<void> {
    await this.sandboxRepo.upsert(
      { projectId, keyId, localeId, value: null, isDeleted: true },
      { conflictPaths: ['projectId', 'keyId', 'localeId'] },
    );
    await this.projectRepo.update(projectId, { sandboxHasChanges: true });
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

  // ─── List snapshots ───────────────────────────────────────────────────────

  async listSnapshots(
    projectSlug: string,
  ): Promise<
    { id: string; label: string | null; createdAt: Date; entryCount: number }[]
  > {
    const project = await this.access.requireProject(projectSlug);

    const snapshots = await this.snapshotRepo.find({
      where: { projectId: project.id },
      order: { createdAt: 'DESC' },
    });

    return snapshots.map((s) => ({
      id: s.id,
      label: s.label,
      createdAt: s.createdAt,
      entryCount: s.data.length,
    }));
  }

  // ─── Reset sandbox ────────────────────────────────────────────────────────

  /**
   * Discards all sandbox changes and re-copies from current production.
   */
  async resetSandbox(
    projectSlug: string,
    userId: string,
    role: UserRole,
  ): Promise<{ copiedRows: number }> {
    const project = await this.access.requireProject(projectSlug);

    this.access.assertOwnerOrAdmin(project, userId, role, 'reset sandbox');

    const result = await this.initSandbox(projectSlug, userId, role, true);
    return { copiedRows: result.copiedRows };
  }

  // ─── Sandbox HTTP namespace (flat JSON for consumer apps) ────────────────

  /**
   * Returns a flat key→value map for a namespace in sandbox mode.
   * Intended for the public HTTP endpoint with ?env=sandbox, allowing developer
   * apps to test against sandbox without promoting to production.
   *
   * Locale alias resolution mirrors TranslationsService.LOCALE_ALIASES.
   * Returns production values for keys not overridden in sandbox.
   */
  async getSandboxNamespace(
    projectSlug: string,
    namespace: string,
    locale: string,
  ): Promise<Record<string, string>> {
    const resolvedLocale = resolveLocaleAlias(locale);

    const project = await this.access.requireProject(projectSlug);

    if (!project.sandboxInitializedAt) {
      // Sandbox not initialized — fall back to production data
      return {};
    }

    const rows = await this.dataSource.query<
      {
        key: string;
        value: string | null;
      }[]
    >(
      `
      SELECT tk.key, COALESCE(sv.value, tv.value) AS value
      FROM translation_values tv
      JOIN translation_keys tk ON tk.id = tv.key_id
      JOIN translation_namespaces ns ON ns.id = tk.namespace_id
      JOIN translation_locales l ON l.id = tv.locale_id
      LEFT JOIN sandbox_values sv
        ON sv.key_id = tv.key_id
        AND sv.locale_id = tv.locale_id
        AND sv.project_id = $1
        AND sv.is_deleted = false
      WHERE ns.project_id = $1
        AND ns.slug = $2
        AND l.code = $3

      UNION ALL

      -- Sandbox-only keys (not yet in production)
      SELECT tk.key, sv.value
      FROM sandbox_values sv
      JOIN translation_keys tk ON tk.id = sv.key_id
      JOIN translation_namespaces ns ON ns.id = tk.namespace_id
      JOIN translation_locales l ON l.id = sv.locale_id
      WHERE sv.project_id = $1
        AND ns.slug = $2
        AND l.code = $3
        AND sv.is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM translation_values tv2
          WHERE tv2.key_id = sv.key_id AND tv2.locale_id = sv.locale_id
        )
    `,
      [project.id, namespace, resolvedLocale],
    );

    return Object.fromEntries(
      rows
        .filter((r) => r.value !== null)
        .map((r) => [r.key, r.value as string]),
    );
  }

  // ─── Sandbox entries (editable view) ──────────────────────────────────────

  /**
   * Returns the "sandbox view" of a namespace:
   * - Production entries not deleted in sandbox (sandbox value if overridden, else production)
   * - Sandbox-only entries (added in sandbox, not yet in production)
   * Deleted entries (all locales marked is_deleted=true) are excluded.
   */
  async listSandboxEntries(
    projectSlug: string,
    nsSlug: string,
    query: ListEntriesQueryDto,
    _userId: string,
    _role: UserRole,
  ): Promise<PaginatedResponse<SandboxEntryRow>> {
    const project = await this.access.requireProject(projectSlug);

    this.access.assertSandboxInitialized(project);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    const {
      page,
      limit,
      search,
      sortBy,
      sortOrder,
      qualityLevel,
      missingLocale,
    } = query;
    const params: unknown[] = [project.id, ns.id];

    let searchCondition = '';
    if (search && search.length >= 2) {
      params.push(`%${search}%`);
      const si = params.length;
      searchCondition = `
        AND (
          tk.key ILIKE $${si}
          OR EXISTS (
            SELECT 1 FROM sandbox_values sv2
            WHERE sv2.key_id = tk.id AND sv2.project_id = $1
              AND sv2.is_deleted = false AND sv2.value ILIKE $${si}
          )
          OR EXISTS (
            SELECT 1 FROM translation_values tv2
            WHERE tv2.key_id = tk.id AND tv2.value ILIKE $${si}
          )
        )
      `;
    }

    let qualityCondition = '';
    if (qualityLevel) {
      if (qualityLevel === 'unchecked') {
        qualityCondition = `
          AND EXISTS (
            SELECT 1 FROM translation_values tv3
            WHERE tv3.key_id = tk.id AND tv3.value IS NOT NULL AND tv3.quality_level IS NULL
          )
        `;
      } else {
        params.push(qualityLevel);
        const qi = params.length;
        qualityCondition = `
          AND EXISTS (
            SELECT 1 FROM translation_values tv3
            WHERE tv3.key_id = tk.id AND tv3.quality_level = $${qi}
          )
        `;
      }
    }

    let missingLocaleCondition = '';
    if (missingLocale) {
      params.push(missingLocale);
      const mli = params.length;
      missingLocaleCondition = `
        AND NOT EXISTS (
          SELECT 1 FROM (
            SELECT COALESCE(sv_ml.value, tv_ml.value) AS effective_value
            FROM translation_locales tl_ml
            LEFT JOIN translation_values tv_ml ON tv_ml.key_id = tk.id AND tv_ml.locale_id = tl_ml.id
            LEFT JOIN sandbox_values sv_ml ON sv_ml.key_id = tk.id AND sv_ml.locale_id = tl_ml.id AND sv_ml.project_id = $1 AND sv_ml.is_deleted = false
            WHERE tl_ml.project_id = $1 AND tl_ml.code = $${mli}
          ) sub
          WHERE sub.effective_value IS NOT NULL AND sub.effective_value != ''
        )
      `;
    }

    // A key is visible in sandbox if:
    // (a) it has production values OR sandbox-active values, AND
    // (b) it is NOT fully deleted in sandbox (all sandbox entries are is_deleted=true)
    const visibilityWhere = `
      AND NOT (
        EXISTS (SELECT 1 FROM sandbox_values sv WHERE sv.key_id = tk.id AND sv.project_id = $1 AND sv.is_deleted = true)
        AND NOT EXISTS (SELECT 1 FROM sandbox_values sv WHERE sv.key_id = tk.id AND sv.project_id = $1 AND sv.is_deleted = false)
      )
      AND (
        EXISTS (SELECT 1 FROM translation_values tv WHERE tv.key_id = tk.id)
        OR EXISTS (SELECT 1 FROM sandbox_values sv WHERE sv.key_id = tk.id AND sv.project_id = $1 AND sv.is_deleted = false)
      )
    `;

    const baseWhere = `tk.namespace_id = $2 ${visibilityWhere} ${searchCondition} ${qualityCondition} ${missingLocaleCondition}`;

    const [{ count }] = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(DISTINCT tk.id) AS count FROM translation_keys tk WHERE ${baseWhere}`,
      params,
    );

    const sortCol =
      sortBy === 'qualityScore'
        ? '(SELECT MIN(tv_qs.quality_score) FROM translation_values tv_qs WHERE tv_qs.key_id = tk.id AND tv_qs.quality_score IS NOT NULL)'
        : sortBy === 'createdAt'
          ? 'tk.created_at'
          : 'tk.key';
    const sortDir = sortOrder.toUpperCase() as 'ASC' | 'DESC';
    const nullsLast = sortBy === 'qualityScore' ? ' NULLS LAST' : '';

    params.push(limit, (page - 1) * limit);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const qualitySelectExpr =
      sortBy === 'qualityScore'
        ? `, (SELECT MIN(tv_qs.quality_score) FROM translation_values tv_qs WHERE tv_qs.key_id = tk.id AND tv_qs.quality_score IS NOT NULL) AS _qs`
        : '';
    const qualityOrderCol = sortBy === 'qualityScore' ? '_qs' : '';

    const keys = await this.dataSource.query<
      { id: string; key: string; created_at: Date; context: string | null }[]
    >(
      `SELECT DISTINCT tk.id, tk.key, tk.created_at, tk.context${qualitySelectExpr}
       FROM translation_keys tk
       WHERE ${baseWhere}
       ORDER BY ${qualityOrderCol || sortCol} ${sortDir}${nullsLast}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    if (!keys.length) return paginate([], Number(count), page, limit);

    const keyIds = keys.map((k) => k.id);

    const values = await this.dataSource.query<
      { key_id: string; locale: string; value: string | null }[]
    >(
      `
      -- Production values, overridden by sandbox where available
      SELECT tv.key_id, l.code AS locale, COALESCE(sv.value, tv.value) AS value
      FROM translation_values tv
      JOIN translation_locales l ON l.id = tv.locale_id
      LEFT JOIN sandbox_values sv
        ON sv.key_id = tv.key_id AND sv.locale_id = tv.locale_id
        AND sv.project_id = $1 AND sv.is_deleted = false
      WHERE tv.key_id = ANY($2)

      UNION ALL

      -- Sandbox-only values (added in sandbox, not present in production)
      SELECT sv.key_id, l.code AS locale, sv.value
      FROM sandbox_values sv
      JOIN translation_locales l ON l.id = sv.locale_id
      WHERE sv.key_id = ANY($2) AND sv.project_id = $1 AND sv.is_deleted = false
        AND NOT EXISTS (
          SELECT 1 FROM translation_values tv2
          WHERE tv2.key_id = sv.key_id AND tv2.locale_id = sv.locale_id
        )
    `,
      [project.id, keyIds],
    );

    const valuesByKey = new Map<string, Record<string, string>>();
    for (const v of values) {
      if (!valuesByKey.has(v.key_id)) valuesByKey.set(v.key_id, {});
      if (v.value != null) valuesByKey.get(v.key_id)![v.locale] = v.value;
    }

    // Quality is stored on production translation_values rows
    const qualityRows = await this.dataSource.query<
      {
        key_id: string;
        locale: string;
        quality_score: number | null;
        quality_level: string | null;
        quality_comment: string | null;
        quality_checked_at: string | null;
        quality_review_state: string | null;
      }[]
    >(
      `SELECT tv.key_id, l.code AS locale,
              tv.quality_score, tv.quality_level, tv.quality_comment,
              tv.quality_checked_at, tv.quality_review_state
       FROM translation_values tv
       JOIN translation_locales l ON l.id = tv.locale_id
       WHERE tv.key_id = ANY($1)`,
      [keyIds],
    );

    const qualityByKey = new Map<string, Record<string, QualityInfo | null>>();
    for (const q of qualityRows) {
      if (!qualityByKey.has(q.key_id)) qualityByKey.set(q.key_id, {});
      qualityByKey.get(q.key_id)![q.locale] = {
        reviewState: (q.quality_review_state ??
          'not_checked') as QualityInfo['reviewState'],
        score: q.quality_score,
        level: q.quality_level as
          | 'green'
          | 'yellow'
          | 'red'
          | 'expected'
          | null,
        comment: q.quality_comment,
        checkedAt: q.quality_checked_at,
      };
    }

    const data: SandboxEntryRow[] = keys.map((k) => ({
      key: k.key,
      createdAt: k.created_at,
      context: k.context ?? null,
      values: valuesByKey.get(k.id) ?? {},
      quality: qualityByKey.get(k.id) ?? {},
    }));

    return paginate(data, Number(count), page, limit);
  }

  /**
   * Creates a new translation key and stores initial values in sandbox only.
   * The key is visible in production only after promote().
   */
  async createSandboxEntry(
    projectSlug: string,
    nsSlug: string,
    dto: CreateEntryDto,
    _userId: string,
    _role: UserRole,
  ): Promise<SandboxEntryRow> {
    const project = await this.access.requireProject(projectSlug);

    this.access.assertSandboxInitialized(project);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    const exists = await this.keyRepo.existsBy({
      namespaceId: ns.id,
      key: dto.key,
    });
    if (exists) {
      throw new ConflictException(
        `Key "${dto.key}" already exists in namespace "${nsSlug}"`,
      );
    }

    const keyEntity = await this.keyRepo.save(
      this.keyRepo.create({
        namespaceId: ns.id,
        key: dto.key,
        context: dto.context ?? null,
      }),
    );

    const locales = await this.localeRepo.findBy({ projectId: project.id });
    const resultValues: Record<string, string> = {};

    for (const locale of locales) {
      const val = dto.values?.[locale.code];
      if (val !== undefined) {
        await this.upsertSandboxValue(project.id, keyEntity.id, locale.id, val);
        resultValues[locale.code] = val;
      }
    }

    return {
      key: keyEntity.key,
      createdAt: keyEntity.createdAt,
      context: keyEntity.context,
      values: resultValues,
      quality: {},
    };
  }

  /**
   * Updates sandbox values for an existing key (does not touch production).
   */
  async updateSandboxEntry(
    projectSlug: string,
    nsSlug: string,
    key: string,
    dto: UpdateEntryDto,
    _userId: string,
    _role: UserRole,
  ): Promise<SandboxEntryRow> {
    const project = await this.access.requireProject(projectSlug);

    this.access.assertSandboxInitialized(project);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    const keyEntity = await this.access.requireKey(ns.id, key);

    if (dto.context !== undefined) {
      keyEntity.context = dto.context ?? null;
      await this.keyRepo.save(keyEntity);
    }

    const locales = await this.localeRepo.findBy({ projectId: project.id });
    const resultValues: Record<string, string> = {};

    for (const locale of locales) {
      const val = dto.values[locale.code];
      if (val !== undefined) {
        await this.upsertSandboxValue(project.id, keyEntity.id, locale.id, val);
        resultValues[locale.code] = val;
      }
    }

    return {
      key: keyEntity.key,
      createdAt: keyEntity.createdAt,
      context: keyEntity.context,
      values: resultValues,
      quality: {},
    };
  }

  /**
   * Reverts a specific key in sandbox to its production state.
   * - Added-only keys (no production values): key entity is deleted entirely.
   * - Changed/deleted keys: sandbox rows are replaced with current production values.
   * Recalculates sandboxHasChanges after the revert.
   */
  async revertSandboxKey(
    projectSlug: string,
    nsSlug: string,
    key: string,
    userId: string,
    role: UserRole,
  ): Promise<void> {
    const project = await this.access.requireProject(projectSlug);

    this.access.assertSandboxInitialized(project);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    const keyEntity = await this.access.requireKey(ns.id, key);

    const productionValues = await this.valueRepo.find({
      where: { keyId: keyEntity.id },
    });

    // Remove all sandbox entries for this key
    await this.sandboxRepo.delete({
      projectId: project.id,
      keyId: keyEntity.id,
    });

    if (productionValues.length === 0) {
      // Added-only in sandbox — remove the key entity entirely
      await this.keyRepo.delete(keyEntity.id);
    } else {
      // Re-copy production values into sandbox so this key is no longer changed/deleted
      for (const pv of productionValues) {
        await this.sandboxRepo.save(
          this.sandboxRepo.create({
            projectId: project.id,
            keyId: keyEntity.id,
            localeId: pv.localeId,
            value: pv.value,
            isDeleted: false,
          }),
        );
      }
    }

    // Recalculate sandboxHasChanges
    const diff = await this.getDiff(projectSlug, userId, role);
    await this.projectRepo.update(project.id, {
      sandboxHasChanges: diff.total > 0,
    });
  }

  /**
   * Soft-deletes a key in sandbox across all locales (marks is_deleted=true).
   * The key is removed from production only after promote().
   */
  async deleteSandboxEntry(
    projectSlug: string,
    nsSlug: string,
    key: string,
    _userId: string,
    _role: UserRole,
  ): Promise<void> {
    const project = await this.access.requireProject(projectSlug);

    this.access.assertSandboxInitialized(project);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    const keyEntity = await this.access.requireKey(ns.id, key);

    const locales = await this.localeRepo.findBy({ projectId: project.id });

    for (const locale of locales) {
      await this.deleteSandboxValue(project.id, keyEntity.id, locale.id);
    }
  }

  // ─── Batch upsert ──────────────────────────────────────────────────────────

  /**
   * Batch upsert: creates or updates multiple keys+values in sandbox.
   * Uses efficient patterns: bulk fetch existing keys, then split into creates/updates.
   */
  async batchUpsert(
    project: ProjectEntity,
    namespace: NamespaceEntity,
    entries: {
      key: string;
      values: Record<string, string>;
      context?: string;
    }[],
  ): Promise<{ created: number; updated: number }> {
    this.access.assertSandboxInitialized(project);

    const locales = await this.localeRepo.findBy({ projectId: project.id });
    const localeByCode = new Map(locales.map((l) => [l.code, l]));

    // Fetch all existing keys for this namespace in one query
    const existingKeys = await this.keyRepo.find({
      where: { namespaceId: namespace.id },
    });
    const existingKeyMap = new Map(existingKeys.map((k) => [k.key, k]));

    let created = 0;
    let updated = 0;

    for (const entry of entries) {
      let keyEntity = existingKeyMap.get(entry.key);

      if (!keyEntity) {
        // Create new key
        keyEntity = await this.keyRepo.save(
          this.keyRepo.create({
            namespaceId: namespace.id,
            key: entry.key,
            context: entry.context ?? null,
          }),
        );
        existingKeyMap.set(entry.key, keyEntity);
        created++;
      } else {
        // Update context if provided
        if (entry.context !== undefined) {
          keyEntity.context = entry.context ?? null;
          await this.keyRepo.save(keyEntity);
        }
        updated++;
      }

      // Upsert sandbox values for each locale
      for (const [code, value] of Object.entries(entry.values)) {
        const locale = localeByCode.get(code);
        if (locale) {
          await this.upsertSandboxValue(
            project.id,
            keyEntity.id,
            locale.id,
            value,
          );
        }
      }
    }

    return { created, updated };
  }

  // ─── Rename key ──────────────────────────────────────────────────────────

  /**
   * Renames a translation key. Safe because all FKs reference key.id, not key.key.
   */
  async renameKey(
    project: ProjectEntity,
    namespace: NamespaceEntity,
    oldKey: string,
    newKey: string,
  ): Promise<void> {
    const keyEntity = await this.keyRepo.findOne({
      where: { namespaceId: namespace.id, key: oldKey },
    });
    if (!keyEntity) {
      throw new NotFoundException(
        `Key "${oldKey}" not found in namespace "${namespace.slug}"`,
      );
    }

    // Check that newKey doesn't already exist in this namespace
    const exists = await this.keyRepo.existsBy({
      namespaceId: namespace.id,
      key: newKey,
    });
    if (exists) {
      throw new ConflictException(
        `Key "${newKey}" already exists in namespace "${namespace.slug}"`,
      );
    }

    keyEntity.key = newKey;
    await this.keyRepo.save(keyEntity);

    await this.projectRepo.update(project.id, { sandboxHasChanges: true });
  }

  // ─── Expected override (sandbox) ────────────────────────────────────────────

  async markSandboxExpected(
    slug: string,
    ns: string,
    key: string,
    locale: string,
    userId: string,
    userRole: UserRole,
  ): Promise<QualityInfo> {
    const project = await this.requireInitializedProject(slug);
    this.assertAccess(project, userId, userRole);

    const sv = await this.findSandboxValue(project.id, ns, key, locale);
    if (!sv) throw new NotFoundException('Sandbox value not found');

    sv.qualityReviewState = 'expected';
    sv.qualityScore = 100;
    sv.qualityLevel = 'expected';
    sv.qualityComment = null;
    sv.qualityCheckedAt = new Date();
    await this.sandboxRepo.save(sv);

    return {
      reviewState: 'expected',
      score: 100,
      level: 'expected',
      comment: null,
      checkedAt: sv.qualityCheckedAt.toISOString(),
    };
  }

  async unmarkSandboxExpected(
    slug: string,
    ns: string,
    key: string,
    locale: string,
    userId: string,
    userRole: UserRole,
  ): Promise<void> {
    const project = await this.requireInitializedProject(slug);
    this.assertAccess(project, userId, userRole);

    const sv = await this.findSandboxValue(project.id, ns, key, locale);
    if (!sv) throw new NotFoundException('Sandbox value not found');

    sv.qualityReviewState = 'not_checked';
    sv.qualityScore = null;
    sv.qualityLevel = null;
    sv.qualityComment = null;
    sv.qualityCheckedAt = null;
    await this.sandboxRepo.save(sv);
  }

  async updateAutoTranslate(
    slug: string,
    enabled: boolean,
  ): Promise<{ autoTranslateEnabled: boolean }> {
    const project = await this.projectRepo.findOneBy({ slug });
    if (!project) throw new NotFoundException('Project not found');
    project.autoTranslateEnabled = enabled;
    await this.projectRepo.save(project);
    return { autoTranslateEnabled: enabled };
  }

  // ─── Private helper ─────────────────────────────────────────────────────────

  private async findSandboxValue(
    projectId: string,
    ns: string,
    key: string,
    locale: string,
  ): Promise<SandboxValueEntity | null> {
    return this.sandboxRepo
      .createQueryBuilder('sv')
      .innerJoin('sv.translationKey', 'tk')
      .innerJoin('tk.namespace', 'ns')
      .innerJoin('sv.locale', 'l')
      .where('sv.project_id = :projectId', { projectId })
      .andWhere('ns.slug = :ns', { ns })
      .andWhere('tk.key = :key', { key })
      .andWhere('l.code = :locale', { locale })
      .getOne();
  }
}
