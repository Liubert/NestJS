import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { resolveLocaleAlias } from './constants/locale-aliases.const.js';
import { ProjectAccessHelper } from './helpers/project-access.helper.js';
import { SandboxPromotionService } from './sandbox-promotion.service.js';
import { ProjectEntity } from './entities/project.entity.js';
import { SandboxValueEntity } from './entities/sandbox-value.entity.js';
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
import type { QualityInfo, EntryRow } from './types/entry.types.js';
import {
  groupQualityByKey,
  groupValuesByKey,
} from './helpers/entry-list.helper.js';
import {
  expectedQualityFields,
  resetQualityFields,
} from './helpers/quality-state.helper.js';

export type SandboxEntryRow = EntryRow;

@Injectable()
export class SandboxService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SandboxValueEntity)
    private readonly sandboxRepo: Repository<SandboxValueEntity>,
    @InjectRepository(TranslationValueEntity)
    private readonly valueRepo: Repository<TranslationValueEntity>,
    @InjectRepository(TranslationKeyEntity)
    private readonly keyRepo: Repository<TranslationKeyEntity>,
    @InjectRepository(LocaleEntity)
    private readonly localeRepo: Repository<LocaleEntity>,
    private readonly dataSource: DataSource,
    private readonly access: ProjectAccessHelper,
    private readonly promotionService: SandboxPromotionService,
  ) {}

  // ─── Sandbox value operations ─────────────────────────────────────────────

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

    const valuesByKey = groupValuesByKey(values);

    // Quality: sandbox overrides production (sandbox quality takes precedence)
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
      `SELECT
         tv.key_id,
         l.code AS locale,
         -- If sandbox row exists, use its quality entirely (even NULLs = intentional reset).
         -- Fall back to production quality only when no sandbox row is present.
         CASE WHEN sv.key_id IS NOT NULL THEN sv.quality_score        ELSE tv.quality_score        END AS quality_score,
         CASE WHEN sv.key_id IS NOT NULL THEN sv.quality_level         ELSE tv.quality_level         END AS quality_level,
         CASE WHEN sv.key_id IS NOT NULL THEN sv.quality_comment       ELSE tv.quality_comment       END AS quality_comment,
         CASE WHEN sv.key_id IS NOT NULL THEN sv.quality_checked_at    ELSE tv.quality_checked_at    END AS quality_checked_at,
         CASE WHEN sv.key_id IS NOT NULL THEN sv.quality_review_state  ELSE tv.quality_review_state  END AS quality_review_state
       FROM translation_values tv
       JOIN translation_locales l ON l.id = tv.locale_id
       LEFT JOIN sandbox_values sv
         ON sv.key_id = tv.key_id AND sv.locale_id = tv.locale_id
         AND sv.project_id = $2 AND sv.is_deleted = false
       WHERE tv.key_id = ANY($1)

       UNION ALL

       -- Sandbox-only entries (no production value)
       SELECT sv.key_id, l.code AS locale,
              sv.quality_score, sv.quality_level, sv.quality_comment,
              sv.quality_checked_at, sv.quality_review_state
       FROM sandbox_values sv
       JOIN translation_locales l ON l.id = sv.locale_id
       WHERE sv.key_id = ANY($1) AND sv.project_id = $2 AND sv.is_deleted = false
         AND NOT EXISTS (
           SELECT 1 FROM translation_values tv2
           WHERE tv2.key_id = sv.key_id AND tv2.locale_id = sv.locale_id
         )`,
      [keyIds, project.id],
    );

    const qualityByKey = groupQualityByKey(qualityRows);

    const data: SandboxEntryRow[] = keys.map((k) => ({
      key: k.key,
      createdAt: k.created_at,
      context: k.context ?? null,
      values: valuesByKey.get(k.id) ?? {},
      quality: qualityByKey.get(k.id) ?? {},
    }));

    return paginate(data, Number(count), page, limit);
  }

  // ─── Create entry ─────────────────────────────────────────────────────────

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

  // ─── Update entry ─────────────────────────────────────────────────────────

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

    // Context lives on translation_keys (production) — do not modify it from sandbox.
    // Context changes will be supported after sandbox_keys staging is implemented.

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

  // ─── Revert key ───────────────────────────────────────────────────────────

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
    const diff = await this.promotionService.getDiff(projectSlug, userId, role);
    await this.projectRepo.update(project.id, {
      sandboxHasChanges: diff.total > 0,
    });
  }

  // ─── Delete entry ─────────────────────────────────────────────────────────

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
        // Context lives on translation_keys (production) — skip in sandbox mode
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
    const project = await this.access.requireInitializedProject(slug);
    await this.access.assertAccess(project, userId, userRole);

    const sv = await this.findSandboxValue(project.id, ns, key, locale);
    if (!sv) throw new NotFoundException('Sandbox value not found');

    const fields = expectedQualityFields();
    Object.assign(sv, fields);
    await this.sandboxRepo.save(sv);

    return {
      reviewState: 'expected',
      score: 100,
      level: 'expected',
      comment: null,
      checkedAt: fields.qualityCheckedAt!.toISOString(),
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
    const project = await this.access.requireInitializedProject(slug);
    await this.access.assertAccess(project, userId, userRole);

    const sv = await this.findSandboxValue(project.id, ns, key, locale);
    if (!sv) throw new NotFoundException('Sandbox value not found');

    Object.assign(sv, resetQualityFields());
    await this.sandboxRepo.save(sv);
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
