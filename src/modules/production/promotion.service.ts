import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProjectAccessHelper } from '../projects/helpers/project-access.helper.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { SandboxValueEntity } from '../translations/entities/sandbox-value.entity.js';
import {
  ProductionSnapshotEntity,
  SnapshotEntry,
} from '../translations/entities/production-snapshot.entity.js';
import { TranslationValueEntity } from '../translations/entities/translation-value.entity.js';
import { TranslationKeyEntity } from '../translations/entities/translation-key.entity.js';
import { NamespaceEntity } from '../translations/entities/namespace.entity.js';
import { LocaleEntity } from '../translations/entities/locale.entity.js';
import { UserRole } from '../users/types/user-role.enum.js';
import { TranslationCacheService } from '../translations/translation-cache.service.js';

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
export class PromotionService {
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
    private readonly translationCache: TranslationCacheService,
  ) {}

  // ─── Diff (paginated) ────────────────────────────────────────────────────

  async getDiff(
    projectSlug: string,
    _userId: string,
    _role: UserRole,
    page = 1,
    limit = 50,
    filters?: { namespace?: string; locale?: string; status?: string },
  ): Promise<{
    total: number;
    added: number;
    changed: number;
    deleted: number;
    entries: DiffEntry[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const project = await this.access.requireProject(projectSlug);

    const offset = (page - 1) * limit;
    const params: unknown[] = [
      project.id,
      filters?.namespace ?? null,
      filters?.locale ?? null,
      filters?.status ?? null,
      limit,
      offset,
    ];

    // Raw SQL: FULL OUTER JOIN production vs sandbox, with window-function counts and pagination
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
        total: string;
        added: string;
        changed: string;
        deleted: string;
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
      ),
      diff AS (
        SELECT
          COALESCE(p.ns_slug, s.ns_slug)  AS ns_slug,
          COALESCE(p.key,     s.key)      AS key,
          COALESCE(p.locale,  s.locale)   AS locale,
          p.value                         AS production_value,
          s.value                         AS sandbox_value,
          s.is_deleted                    AS is_deleted,
          s.quality_score                 AS quality_score,
          s.quality_level                 AS quality_level,
          s.quality_comment               AS quality_comment,
          CASE
            WHEN p.key IS NULL THEN 'added'
            WHEN s.is_deleted = true THEN 'deleted'
            ELSE 'changed'
          END AS status
        FROM production p
        FULL OUTER JOIN sandbox s
          ON p.ns_slug = s.ns_slug
         AND p.key = s.key
         AND p.locale = s.locale
        WHERE
          p.key IS NULL
          OR s.is_deleted = true
          OR (p.value IS DISTINCT FROM s.value AND s.is_deleted IS NOT TRUE)
      ),
      filtered AS (
        SELECT * FROM diff
        WHERE ($2::text IS NULL OR ns_slug = $2)
          AND ($3::text IS NULL OR locale = $3)
          AND ($4::text IS NULL OR status = $4)
      ),
      counts AS (
        SELECT
          COUNT(*)                                    AS total,
          COUNT(*) FILTER (WHERE status = 'added')   AS added,
          COUNT(*) FILTER (WHERE status = 'changed') AS changed,
          COUNT(*) FILTER (WHERE status = 'deleted') AS deleted
        FROM filtered
      )
      SELECT
        f.ns_slug,
        f.key,
        f.locale,
        f.production_value,
        f.sandbox_value,
        f.is_deleted,
        f.quality_score,
        f.quality_level,
        f.quality_comment,
        c.total,
        c.added,
        c.changed,
        c.deleted
      FROM filtered f, counts c
      ORDER BY f.ns_slug, f.key, f.locale
      LIMIT $5 OFFSET $6
    `,
      params,
    );

    const total = rows.length > 0 ? parseInt(rows[0].total, 10) : 0;
    const added = rows.length > 0 ? parseInt(rows[0].added, 10) : 0;
    const changed = rows.length > 0 ? parseInt(rows[0].changed, 10) : 0;
    const deleted = rows.length > 0 ? parseInt(rows[0].deleted, 10) : 0;

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
      total,
      added,
      changed,
      deleted,
      entries,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Promote ──────────────────────────────────────────────────────────────

  /**
   * Promotes sandbox to production atomically:
   * 1. Snapshot production state for revert
   * 2. Replace production values with sandbox values (including quality data)
   * 3. Copy sandbox context to translation_keys
   * 4. Clean up sandbox-only deleted keys
   * 5. Re-init sandbox from new production state
   */
  async promote(
    projectSlug: string,
    userId: string,
    role: UserRole,
  ): Promise<{ snapshotId: string; promoted: number }> {
    const project = await this.access.requireProject(projectSlug);

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

      // 3. Insert sandbox values (non-deleted) as new production values (including quality data)
      const insertResult = await manager.query<{ id: string }[]>(
        `
        INSERT INTO translation_values (id, key_id, locale_id, value,
          quality_score, quality_level, quality_comment,
          quality_checked_at, quality_review_state, quality_content_hash, updated_at)
        SELECT gen_random_uuid(), sv.key_id, sv.locale_id, sv.value,
          sv.quality_score, sv.quality_level, sv.quality_comment,
          sv.quality_checked_at, sv.quality_review_state, sv.quality_content_hash, now()
        FROM sandbox_values sv
        WHERE sv.project_id = $1 AND sv.is_deleted = false
        RETURNING id
      `,
        [project.id],
      );

      const promotedCount = insertResult.length;

      // 3b. Copy sandbox context to translation_keys
      await manager.query(
        `
        UPDATE translation_keys tk
        SET
          context        = sv_ctx.context,
          context_need   = sv_ctx.context_need,
          context_reason = sv_ctx.context_reason
        FROM (
          SELECT DISTINCT ON (sv.key_id)
            sv.key_id,
            sv.context,
            sv.context_need,
            sv.context_reason
          FROM sandbox_values sv
          WHERE sv.project_id = $1 AND sv.is_deleted = false
            AND sv.context IS NOT NULL
        ) sv_ctx
        WHERE tk.id = sv_ctx.key_id
      `,
        [project.id],
      );

      // 4. Delete sandbox-only keys that were deleted in sandbox
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

      // 5. Reset sandbox: delete all sandbox rows, re-copy from new production (with quality data)
      await manager.query(`DELETE FROM sandbox_values WHERE project_id = $1`, [
        project.id,
      ]);

      await manager.query(
        `
        INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at,
          context, context_need, context_reason,
          quality_score, quality_level, quality_comment, quality_checked_at, quality_review_state, quality_content_hash)
        SELECT ns.project_id, tv.key_id, tv.locale_id, tv.value, false, now(),
          tk.context, tk.context_need, tk.context_reason,
          tv.quality_score, tv.quality_level, tv.quality_comment, tv.quality_checked_at, tv.quality_review_state, tv.quality_content_hash
        FROM translation_values tv
        JOIN translation_keys tk ON tk.id = tv.key_id
        JOIN translation_namespaces ns ON ns.id = tk.namespace_id
        WHERE ns.project_id = $1
      `,
        [project.id],
      );

      await manager.update(ProjectEntity, project.id, {
        sandboxHasChanges: false,
      });

      // Invalidate translation cache after production data changed
      this.translationCache.invalidateProject(projectSlug);

      return { snapshotId: savedSnapshot.id, promoted: promotedCount };
    });
  }

  // ─── Promote selective ────────────────────────────────────────────────────

  async promoteSelective(
    projectSlug: string,
    keys: { namespace: string; key: string }[],
    userId: string,
    role: UserRole,
  ): Promise<{ snapshotId: string; promoted: number }> {
    const project = await this.access.requireProject(projectSlug);

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

        // Get sandbox values for this key (including quality data)
        const svRows = await manager.query<
          {
            locale_id: string;
            value: string | null;
            is_deleted: boolean;
            quality_score: number | null;
            quality_level: string | null;
            quality_comment: string | null;
            quality_checked_at: Date | null;
            quality_review_state: string | null;
            quality_content_hash: string | null;
          }[]
        >(
          `SELECT locale_id, value, is_deleted,
            quality_score, quality_level, quality_comment,
            quality_checked_at, quality_review_state, quality_content_hash
           FROM sandbox_values
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
            // Upsert into production (with quality data from sandbox)
            await manager.query(
              `INSERT INTO translation_values (id, key_id, locale_id, value,
                quality_score, quality_level, quality_comment,
                quality_checked_at, quality_review_state, quality_content_hash, updated_at)
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, now())
               ON CONFLICT (key_id, locale_id) DO UPDATE SET
                value = $3,
                quality_score = $4, quality_level = $5, quality_comment = $6,
                quality_checked_at = $7, quality_review_state = $8, quality_content_hash = $9,
                updated_at = now()`,
              [
                keyId,
                sv.locale_id,
                sv.value,
                sv.quality_score,
                sv.quality_level,
                sv.quality_comment,
                sv.quality_checked_at,
                sv.quality_review_state,
                sv.quality_content_hash,
              ],
            );
            promoted++;
          }
        }

        // Copy sandbox context to translation_keys for this key
        await manager.query(
          `
          UPDATE translation_keys tk
          SET
            context        = sv_ctx.context,
            context_need   = sv_ctx.context_need,
            context_reason = sv_ctx.context_reason
          FROM (
            SELECT sv.context, sv.context_need, sv.context_reason
            FROM sandbox_values sv
            WHERE sv.project_id = $1 AND sv.key_id = $2
              AND sv.is_deleted = false AND sv.context IS NOT NULL
            LIMIT 1
          ) sv_ctx
          WHERE tk.id = $2
          `,
          [project.id, keyId],
        );

        // Re-sync sandbox for this key from production (including quality data)
        await manager.query(
          `DELETE FROM sandbox_values WHERE project_id = $1 AND key_id = $2`,
          [project.id, keyId],
        );
        await manager.query(
          `INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at,
            context, context_need, context_reason,
            quality_score, quality_level, quality_comment, quality_checked_at, quality_review_state, quality_content_hash)
           SELECT $1, tv.key_id, tv.locale_id, tv.value, false, now(),
            tk.context, tk.context_need, tk.context_reason,
            tv.quality_score, tv.quality_level, tv.quality_comment, tv.quality_checked_at, tv.quality_review_state, tv.quality_content_hash
           FROM translation_values tv
           JOIN translation_keys tk ON tk.id = tv.key_id
           WHERE tv.key_id = $2`,
          [project.id, keyId],
        );
      }

      // Check if sandbox still has remaining changes
      // Must compare values + is_deleted, not just key_id/locale_id pairs
      const remaining = await manager.query<{ cnt: string }[]>(
        `SELECT COUNT(*) AS cnt
         FROM sandbox_values sv
         WHERE sv.project_id = $1
           AND (
             -- deleted in sandbox (production key marked for removal)
             sv.is_deleted = true
             -- or added (exists in sandbox but not in production)
             OR NOT EXISTS (
               SELECT 1 FROM translation_values tv
               WHERE tv.key_id = sv.key_id AND tv.locale_id = sv.locale_id
             )
             -- or changed (value differs from production)
             OR EXISTS (
               SELECT 1 FROM translation_values tv
               WHERE tv.key_id = sv.key_id AND tv.locale_id = sv.locale_id
                 AND tv.value IS DISTINCT FROM sv.value
             )
           )`,
        [project.id],
      );
      const hasChanges = Number(remaining[0]?.cnt ?? 0) > 0;
      await manager.update(ProjectEntity, project.id, {
        sandboxHasChanges: hasChanges,
      });

      // Invalidate translation cache after selective promotion
      this.translationCache.invalidateProject(projectSlug);

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

      // Invalidate translation cache after revert
      this.translationCache.invalidateProject(projectSlug);

      return { restored: restoredCount };
    });
  }
}
