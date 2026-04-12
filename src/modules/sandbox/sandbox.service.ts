import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { hashSha256 } from '../../common/utils/hash.util.js';
import { resolveLocaleCandidates } from '../translations/constants/locale-aliases.const.js';
import { ProjectAccessHelper } from '../projects/helpers/project-access.helper.js';
import { PromotionService } from '../production/promotion.service.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { SandboxValueEntity } from '../translations/entities/sandbox-value.entity.js';
import { TranslationValueEntity } from '../translations/entities/translation-value.entity.js';
import { TranslationKeyEntity } from '../translations/entities/translation-key.entity.js';
import { NamespaceEntity } from '../translations/entities/namespace.entity.js';
import { LocaleEntity } from '../translations/entities/locale.entity.js';
import { UserRole } from '../users/types/user-role.enum.js';
import { CreateEntryDto } from '../translations/dto/create-entry.dto.js';
import { UpdateEntryDto } from '../translations/dto/update-entry.dto.js';
import { ListEntriesQueryDto } from '../translations/dto/list-entries-query.dto.js';
import {
  paginate,
  PaginatedResponse,
} from '../../common/dto/paginated-response.dto.js';
import type { QualityInfo } from '../translations/types/entry.types.js';
import {
  groupQualityByKey,
  groupValuesByKey,
} from '../translations/helpers/entry-list.helper.js';
import {
  expectedQualityFields,
  resetQualityFields,
} from '../translations/helpers/quality-state.helper.js';
import { AiTranslateService } from '../ai/ai-translate.service.js';
import { AutoTranslateWorkerService } from '../quality/auto-translate-worker.service.js';
import { scoreToLevel } from '../quality/quality-constants.js';
import type {
  AnalyzeEntriesResponse,
  AnalysisItemResult,
} from '../translations/dto/analyze-entries.dto.js';
import type { RetranslateDto } from '../translations/dto/retranslate.dto.js';

const CONTEXT_NEED_PRIORITY: Record<string, number> = {
  required: 2,
  useful: 1,
  none: 0,
};

function contextNeedPriority(need: string | null | undefined): number {
  return CONTEXT_NEED_PRIORITY[need ?? ''] ?? -1;
}

export interface SandboxEntryRow {
  key: string;
  createdAt: Date;
  context: string | null;
  contextNeed: 'required' | 'useful' | 'none' | null;
  contextReason: string | null;
  values: Record<string, string | null>;
  quality: Record<string, QualityInfo | null>;
  pendingAutoTranslate: Record<string, boolean>;
}

@Injectable()
export class SandboxService {
  private readonly logger = new Logger(SandboxService.name);

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SandboxValueEntity)
    private readonly sandboxRepo: Repository<SandboxValueEntity>,
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
    private readonly promotionService: PromotionService,
    private readonly aiTranslateService: AiTranslateService,
    private readonly autoTranslateWorkerService: AutoTranslateWorkerService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async requireProject(slug: string): Promise<ProjectEntity> {
    const project = await this.projectRepo.findOne({ where: { slug } });
    if (!project) throw new NotFoundException(`Project "${slug}" not found`);
    return project;
  }

  private isAdmin(role: UserRole): boolean {
    return role === UserRole.ADMIN;
  }

  // ─── Sandbox value operations ─────────────────────────────────────────────

  /**
   * Upserts a sandbox value. Called from the entries service when sandbox mode is active.
   * Creates sandbox row if not exists; updates if exists.
   */
  async upsertSandboxValue(
    projectId: string,
    keyId: string,
    localeId: string,
    rawValue: string,
  ): Promise<void> {
    const value = rawValue.trimEnd();
    try {
      // Check if value actually changed — skip quality reset if identical
      const existing = await this.sandboxRepo.findOne({
        where: { projectId, keyId, localeId },
        select: ['value', 'qualityReviewState'],
      });

      const valueChanged = !existing || existing.value !== value;

      await this.sandboxRepo.upsert(
        {
          projectId,
          keyId,
          localeId,
          value,
          isDeleted: false,
          ...(valueChanged && existing?.qualityReviewState !== 'expected'
            ? {
                qualityReviewState: 'not_checked',
                qualityScore: null,
                qualityLevel: null,
                qualityComment: null,
                qualityCheckedAt: null,
              }
            : {}),
        },
        {
          conflictPaths: ['projectId', 'keyId', 'localeId'],
        },
      );
    } catch (err) {
      this.logger.error(
        `upsertSandboxValue failed: projectId=${projectId} keyId=${keyId} localeId=${localeId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw err;
    }
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

  async deleteNamespaceSandboxTranslations(
    projectSlug: string,
    nsSlug: string,
    userId: string,
    role: UserRole,
  ): Promise<{ deleted: number }> {
    const project = await this.requireProject(projectSlug);

    if (!this.isAdmin(role) && project.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the project owner or admin can reset namespace translations',
      );
    }

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const defaultLocale = await this.localeRepo.findOne({
      where: { projectId: project.id, isDefault: true },
    });
    if (!defaultLocale) throw new NotFoundException('No default locale found');

    // TypeORM returns [rows, rowCount] for DELETE/UPDATE — use destructuring
    const [deletedRows, deletedCount] = await this.dataSource.query<
      [{ id: string }[], number]
    >(
      `DELETE FROM sandbox_values
       WHERE project_id = $1
         AND locale_id != $2
         AND key_id IN (SELECT id FROM translation_keys WHERE namespace_id = $3)
       RETURNING id`,
      [project.id, defaultLocale.id, ns.id],
    );

    if (deletedRows.length > 0) {
      await this.projectRepo.update(project.id, { sandboxHasChanges: true });
    }

    // Always trigger re-translation after reset — even if sandbox was empty
    // (keys exist only in production). Bypasses auto_translate_enabled intentionally.
    this.autoTranslateWorkerService.triggerForNamespace(project.id, ns.id);

    // Reset quality states for all remaining sandbox values in this namespace
    // so quality worker re-runs and re-evaluates contextNeed after re-translation
    await this.dataSource.query(
      `UPDATE sandbox_values
       SET quality_review_state = 'not_checked'
       WHERE project_id = $1
         AND key_id IN (SELECT id FROM translation_keys WHERE namespace_id = $2)
         AND is_deleted = false`,
      [project.id, ns.id],
    );

    return { deleted: deletedCount };
  }

  async deleteLocaleSandboxTranslations(
    projectSlug: string,
    nsSlug: string,
    localeCode: string,
    userId: string,
    role: UserRole,
  ): Promise<{ deleted: number }> {
    const project = await this.requireProject(projectSlug);

    if (!this.isAdmin(role) && project.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the project owner or admin can reset locale translations',
      );
    }

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const locale = await this.localeRepo.findOne({
      where: { projectId: project.id, code: localeCode },
    });
    if (!locale)
      throw new NotFoundException(`Locale "${localeCode}" not found`);

    if (locale.isDefault) {
      throw new BadRequestException('Cannot reset the default (source) locale');
    }

    // TypeORM returns [rows, rowCount] for DELETE/UPDATE — use destructuring
    const [deletedRows, deletedCount] = await this.dataSource.query<
      [{ id: string }[], number]
    >(
      `DELETE FROM sandbox_values
       WHERE project_id = $1
         AND locale_id = $2
         AND key_id IN (SELECT id FROM translation_keys WHERE namespace_id = $3)
       RETURNING id`,
      [project.id, locale.id, ns.id],
    );

    if (deletedRows.length > 0) {
      await this.projectRepo.update(project.id, { sandboxHasChanges: true });
    }

    // Always trigger re-translation after reset — even if sandbox was empty
    this.autoTranslateWorkerService.triggerForNamespace(project.id, ns.id);

    // Reset quality states for remaining sandbox values for this locale
    // After DELETE this may match 0 rows, which is fine — safety net
    await this.dataSource.query(
      `UPDATE sandbox_values
       SET quality_review_state = 'not_checked'
       WHERE project_id = $1
         AND locale_id = $2
         AND key_id IN (SELECT id FROM translation_keys WHERE namespace_id = $3)
         AND is_deleted = false`,
      [project.id, locale.id, ns.id],
    );

    return { deleted: deletedCount };
  }

  async deleteKeySandboxValue(
    projectSlug: string,
    nsSlug: string,
    keyName: string,
    localeCode: string,
    userId: string,
    role: UserRole,
  ): Promise<{ deleted: number }> {
    const project = await this.requireProject(projectSlug);

    if (!this.isAdmin(role) && project.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the project owner or admin can reset key translations',
      );
    }

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const key = await this.keyRepo.findOne({
      where: { namespaceId: ns.id, key: keyName },
    });
    if (!key) throw new NotFoundException(`Key "${keyName}" not found`);

    const locale = await this.localeRepo.findOne({
      where: { projectId: project.id, code: localeCode },
    });
    if (!locale)
      throw new NotFoundException(`Locale "${localeCode}" not found`);

    if (locale.isDefault) {
      throw new BadRequestException('Cannot reset the default (source) locale');
    }

    const [deletedRows] = await this.dataSource.query<
      [{ id: string }[], number]
    >(
      `DELETE FROM sandbox_values
       WHERE project_id = $1
         AND key_id = $2
         AND locale_id = $3
       RETURNING id`,
      [project.id, key.id, locale.id],
    );

    if (deletedRows.length > 0) {
      await this.projectRepo.update(project.id, { sandboxHasChanges: true });
    }

    // Fire-and-forget: re-translate this single key for all non-default locales.
    // Pass ns.id so triggerForKey uses the same sandbox-source-text query as replace-per-locale.
    this.autoTranslateWorkerService.triggerForKey(project.id, ns.id, key.id);

    return { deleted: deletedRows.length };
  }

  async retranslate(
    projectSlug: string,
    nsSlug: string,
    dto: RetranslateDto,
    userId: string,
    role: UserRole,
  ): Promise<{ deleted: number }> {
    if (dto.key && dto.locale) {
      return this.deleteKeySandboxValue(
        projectSlug,
        nsSlug,
        dto.key,
        dto.locale,
        userId,
        role,
      );
    }
    if (dto.key) {
      return this.retranslateKeyNonExpected(
        projectSlug,
        nsSlug,
        dto.key,
        userId,
        role,
      );
    }
    if (dto.locale) {
      return this.deleteLocaleSandboxTranslations(
        projectSlug,
        nsSlug,
        dto.locale,
        userId,
        role,
      );
    }
    return this.deleteNamespaceSandboxTranslations(
      projectSlug,
      nsSlug,
      userId,
      role,
    );
  }

  /**
   * Deletes all non-expected sandbox translations for a key across all non-default locales,
   * then triggers auto-translation to fill them back in.
   * Used when the source locale value is edited — all translations need to be regenerated.
   */
  async retranslateKeyNonExpected(
    projectSlug: string,
    nsSlug: string,
    keyName: string,
    userId: string,
    role: UserRole,
  ): Promise<{ deleted: number }> {
    const project = await this.requireProject(projectSlug);

    if (!this.isAdmin(role) && project.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the project owner or admin can reset key translations',
      );
    }

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const key = await this.keyRepo.findOne({
      where: { namespaceId: ns.id, key: keyName },
    });
    if (!key) throw new NotFoundException(`Key "${keyName}" not found`);

    const defaultLocale = await this.localeRepo.findOne({
      where: { projectId: project.id, isDefault: true },
    });
    if (!defaultLocale) throw new NotFoundException('No default locale found');

    const [deletedRows] = await this.dataSource.query<
      [{ id: string }[], number]
    >(
      `DELETE FROM sandbox_values
       WHERE project_id = $1
         AND key_id = $2
         AND locale_id != $3
         AND (quality_review_state IS NULL OR quality_review_state != 'expected')
       RETURNING id`,
      [project.id, key.id, defaultLocale.id],
    );

    if (deletedRows.length > 0) {
      await this.projectRepo.update(project.id, { sandboxHasChanges: true });
    }

    this.autoTranslateWorkerService.triggerForKey(project.id, ns.id, key.id);

    return { deleted: deletedRows.length };
  }

  async resetNamespaceQuality(
    projectSlug: string,
    nsSlug: string,
    userId: string,
    role: UserRole,
  ): Promise<{ reset: number }> {
    const project = await this.requireProject(projectSlug);

    if (!this.isAdmin(role) && project.ownerId !== userId) {
      throw new ForbiddenException(
        'Only the project owner or admin can reset namespace quality scores',
      );
    }

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const [, resetCount] = await this.dataSource.query<
      [{ id: string }[], number]
    >(
      `UPDATE sandbox_values
       SET quality_review_state = 'not_checked',
           quality_score = NULL,
           quality_level = NULL,
           quality_comment = NULL,
           quality_checked_at = NULL,
           quality_content_hash = NULL
       WHERE project_id = $1
         AND key_id IN (SELECT id FROM translation_keys WHERE namespace_id = $2)
         AND is_deleted = false
         AND quality_review_state != 'expected'
       RETURNING id`,
      [project.id, ns.id],
    );

    return { reset: resetCount };
  }

  // ─── Sandbox HTTP namespace (flat JSON for consumer apps) ────────────────

  /**
   * Returns a flat key→value map for a namespace in sandbox mode.
   * Intended for the public HTTP endpoint with ?env=sandbox, allowing developer
   * apps to test against sandbox without promoting to production.
   *
   * Returns only sandbox values — no production fallback.
   * If a key is missing from sandbox (e.g. during auto-translate after reset),
   * it is omitted rather than falling back to stale production data.
   *
   * Locale alias resolution mirrors TranslationsService.LOCALE_ALIASES.
   */
  async getSandboxNamespace(
    projectSlug: string,
    namespace: string,
    locale: string,
  ): Promise<Record<string, string>> {
    const candidates = resolveLocaleCandidates(locale);

    const project = await this.access.requireProject(projectSlug);

    const rows = await this.dataSource.query<
      {
        key: string;
        value: string | null;
      }[]
    >(
      `
      SELECT tk.key, sv.value
      FROM sandbox_values sv
      JOIN translation_keys tk ON tk.id = sv.key_id
      JOIN translation_namespaces ns ON ns.id = tk.namespace_id
      JOIN translation_locales l ON l.id = sv.locale_id
      WHERE sv.project_id = $1
        AND ns.slug = $2
        AND (l.code = ANY($3) OR l.aliases && $3::text[])
        AND sv.is_deleted = false
    `,
      [project.id, namespace, candidates],
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
    userId: string,
    role: UserRole,
  ): Promise<PaginatedResponse<SandboxEntryRow>> {
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, role);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    const {
      page,
      limit,
      search,
      sortBy,
      sortOrder,
      qualityLevel,
      reviewState,
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
            SELECT 1 FROM sandbox_values sv3
            WHERE sv3.key_id = tk.id AND sv3.project_id = $1
              AND sv3.is_deleted = false AND sv3.value IS NOT NULL AND sv3.quality_level IS NULL
          )
        `;
      } else if (qualityLevel === 'needs_context') {
        qualityCondition = `
          AND (SELECT sv_ctx.context_need FROM sandbox_values sv_ctx WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1 AND sv_ctx.is_deleted = false AND sv_ctx.context_need IS NOT NULL LIMIT 1) IN ('required', 'useful')
          AND (SELECT sv_ctx.context FROM sandbox_values sv_ctx WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1 AND sv_ctx.is_deleted = false AND sv_ctx.context IS NOT NULL LIMIT 1) IS NULL
        `;
      } else if (qualityLevel === 'context_required') {
        qualityCondition = `
          AND (SELECT sv_ctx.context_need FROM sandbox_values sv_ctx WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1 AND sv_ctx.is_deleted = false AND sv_ctx.context_need IS NOT NULL LIMIT 1) = 'required'
          AND (SELECT sv_ctx.context FROM sandbox_values sv_ctx WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1 AND sv_ctx.is_deleted = false AND sv_ctx.context IS NOT NULL LIMIT 1) IS NULL
        `;
      } else if (qualityLevel === 'context_useful') {
        qualityCondition = `
          AND (SELECT sv_ctx.context_need FROM sandbox_values sv_ctx WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1 AND sv_ctx.is_deleted = false AND sv_ctx.context_need IS NOT NULL LIMIT 1) = 'useful'
          AND (SELECT sv_ctx.context FROM sandbox_values sv_ctx WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1 AND sv_ctx.is_deleted = false AND sv_ctx.context IS NOT NULL LIMIT 1) IS NULL
        `;
      } else if (qualityLevel === 'expected') {
        qualityCondition = `
          AND EXISTS (
            SELECT 1 FROM sandbox_values sv3
            WHERE sv3.key_id = tk.id AND sv3.project_id = $1
              AND sv3.is_deleted = false AND sv3.quality_level = 'expected'
          )
        `;
      } else {
        params.push(qualityLevel);
        const qi = params.length;
        qualityCondition = `
          AND EXISTS (
            SELECT 1 FROM sandbox_values sv3
            WHERE sv3.key_id = tk.id AND sv3.project_id = $1
              AND sv3.is_deleted = false AND sv3.quality_level = $${qi}
          )
        `;
      }
    }

    let reviewStateCondition = '';
    if (reviewState) {
      params.push(reviewState);
      const rsi = params.length;
      reviewStateCondition = `
        AND EXISTS (
          SELECT 1 FROM sandbox_values sv4
          WHERE sv4.key_id = tk.id AND sv4.project_id = $1
            AND sv4.is_deleted = false AND sv4.quality_review_state = $${rsi}
        )
      `;
    }

    let missingLocaleCondition = '';
    if (missingLocale) {
      params.push(missingLocale);
      const mli = params.length;
      missingLocaleCondition = `
        AND NOT EXISTS (
          SELECT 1 FROM sandbox_values sv_ml
          JOIN translation_locales tl_ml ON tl_ml.id = sv_ml.locale_id
          WHERE sv_ml.key_id = tk.id AND sv_ml.project_id = $1 AND sv_ml.is_deleted = false
            AND tl_ml.code = $${mli} AND sv_ml.value IS NOT NULL AND sv_ml.value != ''
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

    const baseWhere = `tk.namespace_id = $2 ${visibilityWhere} ${searchCondition} ${qualityCondition} ${reviewStateCondition} ${missingLocaleCondition}`;

    const [{ count }] = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(DISTINCT tk.id) AS count FROM translation_keys tk WHERE ${baseWhere}`,
      params,
    );

    const sortCol =
      sortBy === 'qualityScore'
        ? `(SELECT MIN(sv_qs.quality_score) FROM sandbox_values sv_qs WHERE sv_qs.key_id = tk.id AND sv_qs.project_id = $1 AND sv_qs.is_deleted = false AND sv_qs.quality_score IS NOT NULL)`
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
        ? `, (SELECT MIN(sv_qs.quality_score) FROM sandbox_values sv_qs WHERE sv_qs.key_id = tk.id AND sv_qs.project_id = $1 AND sv_qs.is_deleted = false AND sv_qs.quality_score IS NOT NULL) AS _qs`
        : '';
    const qualityOrderCol = sortBy === 'qualityScore' ? '_qs' : '';

    const keys = await this.dataSource.query<
      {
        id: string;
        key: string;
        created_at: Date;
        context: string | null;
        context_need: string | null;
        context_reason: string | null;
      }[]
    >(
      `SELECT DISTINCT tk.id, tk.key, tk.created_at,
              (SELECT sv_ctx.context FROM sandbox_values sv_ctx
               WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1
                 AND sv_ctx.is_deleted = false AND sv_ctx.context IS NOT NULL LIMIT 1) AS context,
              (SELECT sv_ctx.context_need FROM sandbox_values sv_ctx
               WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1
                 AND sv_ctx.is_deleted = false AND sv_ctx.context_need IS NOT NULL LIMIT 1) AS context_need,
              (SELECT sv_ctx.context_reason FROM sandbox_values sv_ctx
               WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1
                 AND sv_ctx.is_deleted = false AND sv_ctx.context_reason IS NOT NULL LIMIT 1) AS context_reason${qualitySelectExpr}
       FROM translation_keys tk
       WHERE ${baseWhere}
       ORDER BY ${qualityOrderCol || sortCol} ${sortDir}${nullsLast}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    if (!keys.length) return paginate([], Number(count), page, limit);

    const keyIds = keys.map((k) => k.id);

    const values = await this.dataSource.query<
      {
        key_id: string;
        locale: string;
        value: string | null;
        pending_auto_translate: boolean;
      }[]
    >(
      `SELECT tk.id AS key_id, l.code AS locale, sv.value,
              COALESCE(sv.pending_auto_translate, false) AS pending_auto_translate
       FROM translation_keys tk
       CROSS JOIN translation_locales l
       LEFT JOIN sandbox_values sv
         ON sv.key_id = tk.id
         AND sv.locale_id = l.id
         AND sv.project_id = $1
         AND sv.is_deleted = false
       WHERE tk.id = ANY($2) AND l.project_id = $1`,
      [project.id, keyIds],
    );

    const valuesByKey = groupValuesByKey(values);
    const pendingByKey = new Map<string, Record<string, boolean>>();
    for (const v of values) {
      if (v.pending_auto_translate) {
        if (!pendingByKey.has(v.key_id)) pendingByKey.set(v.key_id, {});
        pendingByKey.get(v.key_id)![v.locale] = true;
      }
    }

    // Quality is stored on sandbox_values
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
      `SELECT sv.key_id, l.code AS locale,
              sv.quality_score, sv.quality_level, sv.quality_comment,
              sv.quality_checked_at, sv.quality_review_state
       FROM sandbox_values sv
       JOIN translation_locales l ON l.id = sv.locale_id
       WHERE sv.key_id = ANY($1) AND sv.project_id = $2 AND sv.is_deleted = false`,
      [keyIds, project.id],
    );

    const qualityByKey = groupQualityByKey(qualityRows);

    const data: SandboxEntryRow[] = keys.map((k) => {
      const vals = valuesByKey.get(k.id) ?? {};
      const qual = qualityByKey.get(k.id) ?? {};
      return {
        key: k.key,
        createdAt: k.created_at,
        context: k.context ?? null,
        contextNeed: (k.context_need as SandboxEntryRow['contextNeed']) ?? null,
        contextReason: k.context_reason ?? null,
        values: vals,
        quality: qual,
        pendingAutoTranslate: pendingByKey.get(k.id) ?? {},
      };
    });

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
    userId: string,
    role: UserRole,
  ): Promise<SandboxEntryRow> {
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, role);

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

    // Create key entity without context — context is staged in sandbox_values
    const keyEntity = await this.keyRepo.save(
      this.keyRepo.create({
        namespaceId: ns.id,
        key: dto.key,
      }),
    );

    const locales = await this.localeRepo.findBy({ projectId: project.id });
    const defaultLocale = locales.find((l) => l.isDefault);
    if (defaultLocale) {
      const sourceVal = dto.values?.[defaultLocale.code];
      if (!sourceVal || sourceVal.trim() === '') {
        throw new BadRequestException(
          `Source locale "${defaultLocale.code}" value is required`,
        );
      }
    }

    const resultValues: Record<string, string> = {};

    for (const locale of locales) {
      const val = dto.values?.[locale.code];
      if (val !== undefined) {
        await this.upsertSandboxValue(project.id, keyEntity.id, locale.id, val);
        resultValues[locale.code] = val;
      }
    }

    // Write context to sandbox_values rows (staged, not written to translation_keys)
    if (dto.context !== undefined && dto.context !== null) {
      await this.sandboxRepo.update(
        { keyId: keyEntity.id, projectId: project.id },
        { context: dto.context },
      );
    }

    return {
      key: keyEntity.key,
      createdAt: keyEntity.createdAt,
      context: dto.context ?? null,
      contextNeed: null,
      contextReason: null,
      values: resultValues,
      quality: {},
      pendingAutoTranslate: {},
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
    userId: string,
    role: UserRole,
  ): Promise<SandboxEntryRow> {
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, role);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    const keyEntity = await this.access.requireKey(ns.id, key);

    // Track whether context changed (for quality reset).
    // Read from sandbox_values (where edits live), not from translation_keys
    // (which holds production context). They diverge when the sandbox context
    // was edited but not yet promoted.
    const sandboxCtxRow = await this.sandboxRepo.findOne({
      where: { keyId: keyEntity.id, projectId: project.id, isDeleted: false },
      select: ['context'],
    });
    const oldContext = sandboxCtxRow?.context ?? null;
    const newContext =
      dto.context !== undefined
        ? (dto.context ?? null)
        : (sandboxCtxRow?.context ?? null);
    const contextChanged =
      dto.context !== undefined && oldContext !== newContext;

    if (dto.context !== undefined) {
      // Write context to sandbox_values rows (not to translation_keys directly)
      await this.sandboxRepo.update(
        { keyId: keyEntity.id, projectId: project.id },
        {
          context: newContext,
          contextNeed: contextChanged ? null : undefined,
          contextReason: contextChanged ? null : undefined,
        },
      );

      if (contextChanged) {
        // Reset quality state on sandbox values when context changes
        await this.sandboxRepo
          .createQueryBuilder()
          .update()
          .set(resetQualityFields())
          .where(
            'project_id = :projectId AND key_id = :keyId AND quality_review_state != :expectedState',
            {
              projectId: project.id,
              keyId: keyEntity.id,
              expectedState: 'expected',
            },
          )
          .execute();
      }
    }

    const locales = await this.localeRepo.findBy({ projectId: project.id });
    const defaultLocale = locales.find((l) => l.isDefault);

    if (defaultLocale) {
      const sourceVal = dto.values[defaultLocale.code];
      if (sourceVal !== undefined && (!sourceVal || sourceVal.trim() === '')) {
        throw new BadRequestException(
          `Source locale "${defaultLocale.code}" value is required`,
        );
      }
    }

    const resultValues: Record<string, string> = {};

    for (const locale of locales) {
      const val = dto.values[locale.code];
      if (val !== undefined) {
        await this.upsertSandboxValue(project.id, keyEntity.id, locale.id, val);
        resultValues[locale.code] = val;
      }
    }

    // Read back the sandbox context from a sandbox row (per-locale, take first available)
    const sandboxRow = await this.sandboxRepo.findOne({
      where: { keyId: keyEntity.id, projectId: project.id, isDeleted: false },
    });

    return {
      key: keyEntity.key,
      createdAt: keyEntity.createdAt,
      context: sandboxRow?.context ?? null,
      contextNeed: sandboxRow?.contextNeed ?? null,
      contextReason: sandboxRow?.contextReason ?? null,
      values: resultValues,
      quality: {},
      pendingAutoTranslate: {},
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
    await this.access.assertAccess(project, userId, role);

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
            context: keyEntity.context,
            contextNeed: keyEntity.contextNeed,
            contextReason: keyEntity.contextReason,
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

  // ─── Sandbox quality check ────────────────────────────────────────────────

  /**
   * Runs AI quality check on all locales of a key, reading from SANDBOX values
   * and persisting results to SANDBOX values. Production is never touched.
   */
  async runSandboxQualityCheck(
    projectSlug: string,
    nsSlug: string,
    key: string,
    userId: string,
    role: UserRole,
  ): Promise<Record<string, QualityInfo | null>> {
    const project = await this.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, role);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const keyEntity = await this.keyRepo.findOne({
      where: { namespaceId: ns.id, key },
    });
    if (!keyEntity) throw new NotFoundException(`Key "${key}" not found`);

    // Read sandbox context — do NOT fall back to production
    const sandboxCtxForCheck = await this.sandboxRepo.findOne({
      where: { keyId: keyEntity.id, projectId: project.id, isDeleted: false },
      select: ['context'],
    });
    const sandboxContext = sandboxCtxForCheck?.context ?? null;

    const locales = await this.localeRepo.findBy({ projectId: project.id });
    const defaultLocale = locales.find((l) => l.isDefault);

    // Read source text from sandbox (default locale)
    let source: string | undefined;
    if (defaultLocale) {
      const sourceRow = await this.sandboxRepo.findOne({
        where: {
          projectId: project.id,
          keyId: keyEntity.id,
          localeId: defaultLocale.id,
          isDeleted: false,
        },
      });
      source = sourceRow?.value ?? undefined;
    }

    const results: Record<string, QualityInfo | null> = {};

    await Promise.allSettled(
      locales.map(async (locale) => {
        // Read from sandbox
        const sandboxValue = await this.sandboxRepo.findOne({
          where: {
            projectId: project.id,
            keyId: keyEntity.id,
            localeId: locale.id,
            isDeleted: false,
          },
        });

        // Skip expected (manually accepted) translations
        if (sandboxValue?.qualityReviewState === 'expected') {
          results[locale.code] = {
            reviewState: 'expected',
            score: 100,
            level: 'expected',
            comment: null,
            checkedAt: sandboxValue.qualityCheckedAt?.toISOString() ?? null,
          };
          return;
        }

        const translation = sandboxValue?.value;
        if (!translation) {
          results[locale.code] = null;
          return;
        }

        try {
          const mode = locale.isDefault
            ? 'language_quality'
            : source
              ? 'translation_quality'
              : 'language_quality';

          const result = await this.aiTranslateService.checkQuality(
            locale.isDefault ? translation : (source ?? translation),
            translation,
            locale.code,
            mode,
            project.id,
            sandboxContext ?? undefined,
          );

          // Persist contextNeed/contextReason from AI evaluation (higher priority wins)
          if (
            contextNeedPriority(result.contextNeed) >
            contextNeedPriority(keyEntity.contextNeed)
          ) {
            keyEntity.contextNeed = result.contextNeed;
            keyEntity.contextReason = result.contextReason;
            await this.keyRepo.save(keyEntity);
          }

          // Persist quality results to SANDBOX (not production)
          await this.sandboxRepo
            .createQueryBuilder()
            .update()
            .set({
              qualityScore: result.score,
              qualityLevel: result.level,
              qualityComment: result.comment,
              qualityCheckedAt: new Date(),
              qualityReviewState: 'checked',
              contextNeed: result.contextNeed,
              contextReason: result.contextReason,
            })
            .where(
              'project_id = :projectId AND key_id = :keyId AND locale_id = :localeId',
              {
                projectId: project.id,
                keyId: keyEntity.id,
                localeId: locale.id,
              },
            )
            .execute();

          results[locale.code] = {
            reviewState: 'checked',
            score: result.score,
            level: result.level,
            comment: result.comment,
            checkedAt: new Date().toISOString(),
          };
        } catch {
          results[locale.code] = null;
        }
      }),
    );

    return results;
  }

  async bulkSandboxQualityCheck(
    projectSlug: string,
    nsSlug: string,
    keys: string[] | undefined,
    userId: string,
    userRole: UserRole,
  ): Promise<{
    results: Array<
      | {
          key: string;
          status: 'ok';
          results: Record<string, QualityInfo | null>;
        }
      | { key: string; status: 'error'; error: string }
    >;
  }> {
    const project = await this.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    let targetKeys: string[];
    if (!keys || keys.length === 0) {
      const allKeyEntities = await this.keyRepo.find({
        where: { namespaceId: ns.id },
        select: ['key'],
      });
      targetKeys = allKeyEntities.map((k) => k.key);
    } else {
      targetKeys = keys;
    }

    const results: Array<
      | {
          key: string;
          status: 'ok';
          results: Record<string, QualityInfo | null>;
        }
      | { key: string; status: 'error'; error: string }
    > = [];

    for (const key of targetKeys) {
      try {
        const checkResult = await this.runSandboxQualityCheck(
          projectSlug,
          nsSlug,
          key,
          userId,
          userRole,
        );
        results.push({ key, status: 'ok', results: checkResult });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ key, status: 'error', error: message });
      }
    }

    return { results };
  }

  // ─── Sandbox attention items ────────────────────────────────────────────────

  /**
   * Returns sandbox translations needing quality attention.
   * Reads quality data from sandbox_values (not production).
   */
  async getSandboxAttentionItems(
    projectSlug: string,
    nsSlug: string,
    options: {
      limit: number;
      qualityLevels: string[];
      includeUnchecked: boolean;
    },
    userId: string,
    role: UserRole,
  ): Promise<PaginatedResponse<SandboxEntryRow>> {
    const project = await this.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, role);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const limit = Math.min(options.limit, 100);
    const levels = options.qualityLevels.filter((l) =>
      ['green', 'yellow', 'red'].includes(l),
    );

    const conditions: string[] = [];
    const params: unknown[] = [project.id, ns.id];

    if (levels.length) {
      params.push(levels);
      conditions.push(`EXISTS (
        SELECT 1 FROM sandbox_values sv2
        WHERE sv2.key_id = tk.id AND sv2.project_id = $1
          AND sv2.is_deleted = false AND sv2.quality_level = ANY($${params.length})
      )`);
    }

    if (options.includeUnchecked) {
      conditions.push(`EXISTS (
        SELECT 1 FROM sandbox_values sv3
        WHERE sv3.key_id = tk.id AND sv3.project_id = $1
          AND sv3.is_deleted = false AND sv3.value IS NOT NULL AND sv3.quality_level IS NULL
      )`);
    }

    if (
      options.qualityLevels.includes('needs_context') ||
      !options.qualityLevels.length
    ) {
      conditions.push(
        `(
          (SELECT sv_ctx.context_need FROM sandbox_values sv_ctx
           WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1
             AND sv_ctx.is_deleted = false AND sv_ctx.context_need IS NOT NULL LIMIT 1) IN ('required', 'useful')
          AND (SELECT sv_ctx.context FROM sandbox_values sv_ctx
               WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1
                 AND sv_ctx.is_deleted = false AND sv_ctx.context IS NOT NULL LIMIT 1) IS NULL
        )`,
      );
    }

    // Visibility: key must have at least one active sandbox value
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

    const whereClause = conditions.length
      ? `AND (${conditions.join(' OR ')})`
      : '';

    const countResult = await this.dataSource.query<{ cnt: string }[]>(
      `SELECT COUNT(DISTINCT tk.id) AS cnt
       FROM translation_keys tk
       WHERE tk.namespace_id = $2 ${visibilityWhere} ${whereClause}`,
      params,
    );
    const total = Number(countResult[0]?.cnt ?? 0);

    params.push(limit);
    const keys = await this.dataSource.query<
      {
        id: string;
        key: string;
        created_at: Date;
        context: string | null;
        context_need: string | null;
        context_reason: string | null;
      }[]
    >(
      `SELECT DISTINCT tk.id, tk.key, tk.created_at,
              (SELECT sv_ctx.context FROM sandbox_values sv_ctx
               WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1
                 AND sv_ctx.is_deleted = false AND sv_ctx.context IS NOT NULL LIMIT 1) AS context,
              (SELECT sv_ctx.context_need FROM sandbox_values sv_ctx
               WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1
                 AND sv_ctx.is_deleted = false AND sv_ctx.context_need IS NOT NULL LIMIT 1) AS context_need,
              (SELECT sv_ctx.context_reason FROM sandbox_values sv_ctx
               WHERE sv_ctx.key_id = tk.id AND sv_ctx.project_id = $1
                 AND sv_ctx.is_deleted = false AND sv_ctx.context_reason IS NOT NULL LIMIT 1) AS context_reason,
              (SELECT MIN(sv_qs.quality_score) FROM sandbox_values sv_qs
               WHERE sv_qs.key_id = tk.id AND sv_qs.project_id = $1
                 AND sv_qs.is_deleted = false AND sv_qs.quality_score IS NOT NULL) AS _qs
       FROM translation_keys tk
       WHERE tk.namespace_id = $2 ${visibilityWhere} ${whereClause}
       ORDER BY _qs ASC NULLS FIRST
       LIMIT $${params.length}`,
      params,
    );

    if (!keys.length) return paginate([], total, 1, limit);

    const keyIds = keys.map((k) => k.id);

    // Load sandbox values
    const values = await this.dataSource.query<
      {
        key_id: string;
        locale: string;
        value: string | null;
        pending_auto_translate: boolean;
      }[]
    >(
      `SELECT sv.key_id, l.code AS locale, sv.value,
              COALESCE(sv.pending_auto_translate, false) AS pending_auto_translate
       FROM sandbox_values sv
       JOIN translation_locales l ON l.id = sv.locale_id
       WHERE sv.key_id = ANY($1) AND sv.project_id = $2 AND sv.is_deleted = false`,
      [keyIds, project.id],
    );

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
      `SELECT sv.key_id, l.code AS locale,
              sv.quality_score, sv.quality_level, sv.quality_comment,
              sv.quality_checked_at, sv.quality_review_state
       FROM sandbox_values sv
       JOIN translation_locales l ON l.id = sv.locale_id
       WHERE sv.key_id = ANY($1) AND sv.project_id = $2 AND sv.is_deleted = false`,
      [keyIds, project.id],
    );

    const valuesByKey = new Map<string, Record<string, string>>();
    const pendingByKey2 = new Map<string, Record<string, boolean>>();
    for (const v of values) {
      if (!valuesByKey.has(v.key_id)) valuesByKey.set(v.key_id, {});
      if (v.value != null) valuesByKey.get(v.key_id)![v.locale] = v.value;
      if (v.pending_auto_translate) {
        if (!pendingByKey2.has(v.key_id)) pendingByKey2.set(v.key_id, {});
        pendingByKey2.get(v.key_id)![v.locale] = true;
      }
    }

    const qualityByKey = new Map<string, Record<string, QualityInfo | null>>();
    for (const q of qualityRows) {
      if (!qualityByKey.has(q.key_id)) qualityByKey.set(q.key_id, {});
      qualityByKey.get(q.key_id)![q.locale] = {
        reviewState: (q.quality_review_state ??
          'not_checked') as QualityInfo['reviewState'],
        score: q.quality_score,
        level: q.quality_level as QualityInfo['level'],
        comment: q.quality_comment,
        checkedAt: q.quality_checked_at,
      };
    }

    const data: SandboxEntryRow[] = keys.map((k) => {
      const vals = valuesByKey.get(k.id) ?? {};
      const qual = qualityByKey.get(k.id) ?? {};
      return {
        key: k.key,
        createdAt: k.created_at,
        context: k.context ?? null,
        contextNeed: (k.context_need as SandboxEntryRow['contextNeed']) ?? null,
        contextReason: k.context_reason ?? null,
        values: vals,
        quality: qual,
        pendingAutoTranslate: pendingByKey2.get(k.id) ?? {},
      };
    });

    return paginate(data, total, 1, limit);
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
    userId: string,
    role: UserRole,
  ): Promise<void> {
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, role);

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
  async bulkUpsert(
    project: ProjectEntity,
    namespace: NamespaceEntity,
    entries: {
      key: string;
      values: Record<string, string>;
      context?: string;
    }[],
  ): Promise<{ created: number; updated: number }> {
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
        // Create new key — context is staged in sandbox_values, not written to translation_keys
        keyEntity = await this.keyRepo.save(
          this.keyRepo.create({
            namespaceId: namespace.id,
            key: entry.key,
          }),
        );
        existingKeyMap.set(entry.key, keyEntity);
        created++;
      } else {
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

      // Write context to sandbox_values rows (staged, not written to translation_keys)
      if (entry.context !== undefined) {
        const newContext = entry.context ?? null;
        await this.sandboxRepo.update(
          { keyId: keyEntity.id, projectId: project.id },
          { context: newContext, contextNeed: null, contextReason: null },
        );
      }
    }

    return { created, updated };
  }

  // ─── Batch delete ─────────────────────────────────────────────────────────

  async bulkDelete(
    projectSlug: string,
    nsSlug: string,
    keys: string[],
    userId: string,
    role: UserRole,
  ): Promise<{ deleted: number }> {
    const project = await this.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, role);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const locales = await this.localeRepo.findBy({ projectId: project.id });
    let deleted = 0;

    for (const key of keys) {
      const keyEntity = await this.keyRepo.findOne({
        where: { namespaceId: ns.id, key },
      });
      if (!keyEntity) continue;

      for (const locale of locales) {
        await this.deleteSandboxValue(project.id, keyEntity.id, locale.id);
      }
      deleted++;
    }

    return { deleted };
  }

  // ─── Batch translate ─────────────────────────────────────────────────────

  // ─── Bulk revert ────────────────────────────────────────────────────────

  async bulkRevert(
    projectSlug: string,
    nsSlug: string,
    keys: string[],
    userId: string,
    role: UserRole,
  ): Promise<{ reverted: number; skipped: number }> {
    let reverted = 0;
    let skipped = 0;

    for (const key of keys) {
      try {
        await this.revertSandboxKey(projectSlug, nsSlug, key, userId, role);
        reverted++;
      } catch {
        skipped++;
      }
    }

    return { reverted, skipped };
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
    const project = await this.requireProject(slug);
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
    const project = await this.requireProject(slug);
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

  // ─── Persist quality results ──────────────────────────────────────────────

  /**
   * Persist AI quality results into sandbox_values after a bulk translate+save.
   * Takes the projectId, namespace slug, and the results map from bulkCheckQuality.
   * Updates each matching sandbox_value row with score, level, comment, hash, and state.
   */
  async persistQualityResults(
    projectId: string,
    namespaceSlug: string,
    results: Record<
      string,
      Record<string, { score: number; level: string; comment: string }>
    >,
  ): Promise<void> {
    const ns = await this.namespaceRepo.findOne({
      where: { projectId, slug: namespaceSlug },
    });
    if (!ns) return;

    const locales = await this.localeRepo.findBy({ projectId });
    const localeByCode = new Map(locales.map((l) => [l.code, l]));

    const now = new Date();

    for (const [keyName, localeMap] of Object.entries(results)) {
      const keyEntity = await this.keyRepo.findOne({
        where: { namespaceId: ns.id, key: keyName },
      });
      if (!keyEntity) continue;

      for (const [localeCode, r] of Object.entries(localeMap)) {
        const locale = localeByCode.get(localeCode);
        if (!locale) continue;

        const sandboxValue = await this.sandboxRepo.findOne({
          where: { projectId, keyId: keyEntity.id, localeId: locale.id },
        });
        if (!sandboxValue || !sandboxValue.value) continue;

        // Preserve expected state — do not overwrite manually accepted translations
        if (sandboxValue.qualityReviewState === 'expected') continue;

        const hash = hashSha256(sandboxValue.value);

        const score = Math.min(100, Math.max(1, Math.round(r.score)));
        const level = scoreToLevel(score);

        await this.sandboxRepo
          .createQueryBuilder()
          .update()
          .set({
            qualityScore: score,
            qualityLevel: level,
            qualityComment: r.comment,
            qualityCheckedAt: now,
            qualityReviewState: 'checked',
            qualityContentHash: hash,
          })
          .where(
            'project_id = :projectId AND key_id = :keyId AND locale_id = :localeId',
            { projectId, keyId: keyEntity.id, localeId: locale.id },
          )
          .execute();
      }
    }
  }

  // ─── Analyze entries (preflight) ──────────────────────────────────────────────

  /**
   * Read-only preflight analysis: check a batch of planned keys for duplicates,
   * conflicts with existing keys, and source text reuse candidates.
   * No DB writes — purely a diagnostic query.
   */
  async analyzeEntries(
    projectSlug: string,
    nsSlug: string,
    entries: { key: string; text: string; context?: string }[],
    userId: string,
    role: UserRole,
    sourceLocaleOverride?: string,
  ): Promise<AnalyzeEntriesResponse> {
    // 1. Resolve project and access
    const project = await this.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, role);

    // 2. Resolve namespace
    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    // 3. Resolve source locale
    let sourceLocale: LocaleEntity;
    if (sourceLocaleOverride) {
      const found = await this.localeRepo.findOne({
        where: { projectId: project.id, code: sourceLocaleOverride },
      });
      if (!found) {
        throw new NotFoundException(
          `Locale "${sourceLocaleOverride}" not found in project`,
        );
      }
      sourceLocale = found;
    } else {
      const found = await this.localeRepo.findOne({
        where: { projectId: project.id, isDefault: true },
      });
      if (!found) {
        throw new NotFoundException(
          'No default locale configured for this project',
        );
      }
      sourceLocale = found;
    }

    // 4. Query 1: all existing keys in namespace
    const existingKeys = await this.keyRepo.find({
      where: { namespaceId: ns.id },
    });
    const existingKeyMap = new Map<string, TranslationKeyEntity>();
    for (const k of existingKeys) {
      existingKeyMap.set(k.key, k);
    }

    // 5. Query 2: existing sandbox source values for this namespace + locale
    const rawValues = await this.sandboxRepo
      .createQueryBuilder('sv')
      .innerJoin('sv.translationKey', 'tk')
      .innerJoin('sv.locale', 'loc')
      .where('tk.namespaceId = :nsId', { nsId: ns.id })
      .andWhere('loc.code = :locale', { locale: sourceLocale.code })
      .andWhere('sv.isDeleted = false')
      .andWhere("sv.value IS NOT NULL AND sv.value != ''")
      .select(['tk.key AS key', 'sv.value AS value'])
      .getRawMany<{ key: string; value: string }>();

    // Build lookup maps
    const valueToKeys = new Map<string, string[]>();
    const keyToSourceValue = new Map<string, string>();
    for (const row of rawValues) {
      keyToSourceValue.set(row.key, row.value);
      const existing = valueToKeys.get(row.value) ?? [];
      existing.push(row.key);
      valueToKeys.set(row.value, existing);
    }

    // 6. Classify each entry
    const results: AnalysisItemResult[] = [];

    // Track keys and source texts already seen within the batch for duplicate detection
    const batchKeysSeen = new Map<string, number>(); // key -> index in results
    const batchTextsSeen = new Map<
      string,
      { resultIdx: number; key: string }
    >(); // text -> {resultIdx, key}

    for (const entry of entries) {
      // Step A: batch duplicate by key
      if (batchKeysSeen.has(entry.key)) {
        const firstIdx = batchKeysSeen.get(entry.key)!;
        // Retroactively mark the first occurrence as duplicate
        if (results[firstIdx].status !== 'duplicate_in_batch') {
          results[firstIdx] = {
            ...results[firstIdx],
            status: 'duplicate_in_batch',
            recommendation: 'rename',
            conflict: {
              reason: 'Key appears more than once in the submitted batch',
              batchConflictWith: entry.key,
            },
          };
        }
        results.push({
          key: entry.key,
          text: entry.text,
          status: 'duplicate_in_batch',
          recommendation: 'rename',
          conflict: {
            reason: 'Key appears more than once in the submitted batch',
            batchConflictWith: entry.key,
          },
        });
        continue;
      }

      // Step A2: batch duplicate by source text (same text, different key)
      if (batchTextsSeen.has(entry.text)) {
        const first = batchTextsSeen.get(entry.text)!;
        // Retroactively mark the first occurrence as duplicate
        if (results[first.resultIdx].status !== 'duplicate_in_batch') {
          results[first.resultIdx] = {
            ...results[first.resultIdx],
            status: 'duplicate_in_batch',
            recommendation: 'review',
            conflict: {
              reason:
                'Source text appears more than once in the submitted batch',
              batchConflictWith: entry.key,
            },
          };
        }
        results.push({
          key: entry.key,
          text: entry.text,
          status: 'duplicate_in_batch',
          recommendation: 'review',
          conflict: {
            reason: 'Source text appears more than once in the submitted batch',
            batchConflictWith: first.key,
          },
        });
        batchKeysSeen.set(entry.key, results.length - 1);
        continue;
      }

      batchKeysSeen.set(entry.key, results.length);
      batchTextsSeen.set(entry.text, {
        resultIdx: results.length,
        key: entry.key,
      });

      // Step B: check if key already exists in the namespace
      if (existingKeyMap.has(entry.key)) {
        const existingValue = keyToSourceValue.get(entry.key);
        if (existingValue !== undefined && existingValue === entry.text) {
          results.push({
            key: entry.key,
            text: entry.text,
            status: 'key_exists_same_value',
            recommendation: 'skip',
            conflict: {
              reason:
                'Key already exists in this namespace with the same source text',
              existingValue,
            },
          });
        } else {
          results.push({
            key: entry.key,
            text: entry.text,
            status: 'key_exists_different_value',
            recommendation: 'update',
            conflict: {
              reason:
                'Key already exists in this namespace with a different source text',
              existingValue: existingValue ?? undefined,
            },
          });
        }
        continue;
      }

      // Step C: check if source text already exists under another key
      const keysWithSameText = valueToKeys.get(entry.text);
      if (keysWithSameText && keysWithSameText.length > 0) {
        if (keysWithSameText.length === 1) {
          results.push({
            key: entry.key,
            text: entry.text,
            status: 'value_exists_under_other_key',
            recommendation: 'reuse',
            conflict: {
              reason:
                'Source text already exists under a different key — consider reusing it',
              existingKeys: keysWithSameText,
            },
          });
        } else {
          // Multiple keys share the same text — ambiguous, needs review
          results.push({
            key: entry.key,
            text: entry.text,
            status: 'needs_manual_review',
            recommendation: 'review',
            conflict: {
              reason:
                'Source text already exists under multiple keys — review to choose the right one',
              existingKeys: keysWithSameText,
            },
          });
        }
        continue;
      }

      // Step D: safe to create
      results.push({
        key: entry.key,
        text: entry.text,
        status: 'safe_to_create',
        recommendation: 'create',
      });
    }

    // 7. Compute summary
    const summary = {
      total: results.length,
      safeToCreate: 0,
      alreadyExistSameValue: 0,
      keyConflicts: 0,
      sourceTextDuplicates: 0,
      batchConflicts: 0,
      needsReview: 0,
    };

    for (const r of results) {
      switch (r.status) {
        case 'safe_to_create':
          summary.safeToCreate++;
          break;
        case 'key_exists_same_value':
          summary.alreadyExistSameValue++;
          break;
        case 'key_exists_different_value':
          summary.keyConflicts++;
          break;
        case 'value_exists_under_other_key':
          summary.sourceTextDuplicates++;
          break;
        case 'duplicate_in_batch':
          summary.batchConflicts++;
          break;
        case 'needs_manual_review':
          summary.needsReview++;
          break;
      }
    }

    return { sourceLocale: sourceLocale.code, results, summary };
  }

  // ─── Quality comment lookup ───────────────────────────────────────────────

  /**
   * Returns a map of key name → first non-null quality comment for the given keys.
   * Used by bulkTranslateAndSave to pass previous feedback to Gemini on retranslation.
   */
  async getQualityCommentsForKeys(
    projectId: string,
    namespaceId: string,
    keyNames: string[],
  ): Promise<Map<string, string>> {
    if (!keyNames.length) return new Map();

    const rows = await this.dataSource.query<
      { key_name: string; quality_comment: string }[]
    >(
      `SELECT tk.key AS key_name, sv.quality_comment
       FROM translation_keys tk
       JOIN sandbox_values sv
         ON sv.key_id = tk.id
         AND sv.project_id = $1
         AND sv.is_deleted = false
         AND sv.quality_comment IS NOT NULL
       WHERE tk.namespace_id = $2
         AND tk.key = ANY($3)
       ORDER BY tk.key`,
      [projectId, namespaceId, keyNames],
    );

    const map = new Map<string, string>();
    for (const row of rows) {
      // Take first comment per key (ORDER BY ensures deterministic pick)
      if (!map.has(row.key_name)) {
        map.set(row.key_name, row.quality_comment);
      }
    }
    return map;
  }
}
