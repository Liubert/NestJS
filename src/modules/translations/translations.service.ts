import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createHash } from 'crypto';
import AdmZip from 'adm-zip';
import { ProjectEntity } from './entities/project.entity.js';
import { NamespaceEntity } from './entities/namespace.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import {
  ProjectMemberEntity,
  ProjectMemberRole,
} from './entities/project-member.entity.js';
import { UserEntity } from '../users/user.entity.js';
import { UserRole } from '../users/types/user-role.enum.js';
import { ImportTranslationsDto } from './dto/import-translations.dto.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { CreateNamespaceDto } from './dto/create-namespace.dto.js';
import { CreateEntryDto } from './dto/create-entry.dto.js';
import { UpdateEntryDto } from './dto/update-entry.dto.js';
import { ListEntriesQueryDto } from './dto/list-entries-query.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import {
  paginate,
  PaginatedResponse,
} from '../../common/dto/paginated-response.dto.js';
import { AiTranslateService } from './ai-translate.service.js';
import {
  WebhooksService,
  WebhookEventPayload,
} from '../webhooks/webhooks.service.js';
import { getLocaleSkill } from './locale-registry.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QualityInfo {
  reviewState:
    | 'not_checked'
    | 'queued'
    | 'processing'
    | 'checked'
    | 'expected'
    | 'failed';
  score: number | null;
  level: 'green' | 'yellow' | 'red' | 'expected' | null;
  comment: string | null;
  checkedAt: string | null;
}

export interface EntryRow {
  key: string;
  createdAt: Date;
  context: string | null;
  contextNeed: 'required' | 'useful' | 'none' | null;
  contextReason: string | null;
  values: Record<string, string>;
  quality: Record<string, QualityInfo | null>;
}

export interface LocaleInfo {
  code: string;
  isDefault: boolean;
  aliases: string[];
  localeSkill: string | null;
}

export interface NamespaceInfo {
  slug: string;
  avgScore: number | null;
}

export interface ProjectDetails {
  id: string;
  slug: string;
  name: string;
  ownerId: string | null;
  createdAt: Date;
  locales: LocaleInfo[];
  namespaces: NamespaceInfo[];
  autoTranslateEnabled: boolean;
  aiTokenDailyLimit: number | null;
}

export interface MemberRow {
  userId: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: ProjectMemberRole;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class TranslationsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(NamespaceEntity)
    private readonly namespaceRepo: Repository<NamespaceEntity>,
    @InjectRepository(LocaleEntity)
    private readonly localeRepo: Repository<LocaleEntity>,
    @InjectRepository(TranslationKeyEntity)
    private readonly keyRepo: Repository<TranslationKeyEntity>,
    @InjectRepository(TranslationValueEntity)
    private readonly valueRepo: Repository<TranslationValueEntity>,
    @InjectRepository(ProjectMemberEntity)
    private readonly memberRepo: Repository<ProjectMemberEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly aiTranslateService: AiTranslateService,
    @Inject(forwardRef(() => WebhooksService))
    private readonly webhooksService: WebhooksService,
  ) {}

  private emitWebhook(
    event: WebhookEventPayload['event'],
    project: ProjectEntity,
    namespace: string,
    key: string,
    locales?: string[],
    environment: 'production' | 'sandbox' = 'production',
  ): void {
    void this.webhooksService.emit({
      event,
      projectId: project.id,
      projectSlug: project.slug,
      namespace,
      key,
      locales,
      environment,
      timestamp: new Date().toISOString(),
    });
  }

  // ─── Access control helpers ────────────────────────────────────────────────

  private isAdmin(role: UserRole): boolean {
    return role === UserRole.ADMIN;
  }

  /** Throws ForbiddenException if user is not a member of the project (admins bypass). */
  private async assertAccess(
    project: ProjectEntity,
    userId: string,
    role: UserRole,
  ): Promise<void> {
    if (this.isAdmin(role)) return;
    const member = await this.memberRepo.findOne({
      where: { projectId: project.id, userId },
    });
    if (!member) {
      throw new ForbiddenException(`No access to project "${project.slug}"`);
    }
  }

  /** Throws ForbiddenException if user is not owner of the project (admins bypass). */
  private async assertManageAccess(
    project: ProjectEntity,
    userId: string,
    role: UserRole,
  ): Promise<void> {
    if (this.isAdmin(role)) return;
    const member = await this.memberRepo.findOne({
      where: { projectId: project.id, userId },
    });
    if (!member || member.role !== 'owner') {
      throw new ForbiddenException(
        `Only the project owner or an admin can manage project "${project.slug}"`,
      );
    }
  }

  /** Resolves project by slug; throws NotFoundException if not found. */
  private async requireProject(slug: string): Promise<ProjectEntity> {
    const project = await this.projectRepo.findOne({ where: { slug } });
    if (!project) throw new NotFoundException(`Project "${slug}" not found`);
    return project;
  }

  /** Public accessor for project by slug (used by controllers). */
  async getProjectBySlug(slug: string): Promise<ProjectEntity> {
    return this.requireProject(slug);
  }

  /** Fetch all locales for a project by slug. Used by AI endpoints to inject guidance. */
  async getProjectLocales(projectSlug: string): Promise<LocaleEntity[]> {
    const project = await this.requireProject(projectSlug);
    return this.localeRepo.findBy({ projectId: project.id });
  }

  /** Public accessor for namespace by projectId + slug (used by controllers). */
  async requireNamespace(
    projectId: string,
    nsSlug: string,
  ): Promise<NamespaceEntity> {
    const ns = await this.namespaceRepo.findOne({
      where: { projectId, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);
    return ns;
  }

  // ─── Projects ─────────────────────────────────────────────────────────────

  async listProjects(
    page: number,
    limit: number,
    userId: string,
    userRole: UserRole,
  ): Promise<PaginatedResponse<ProjectEntity>> {
    const qb = this.projectRepo
      .createQueryBuilder('p')
      .orderBy('p.name', 'ASC');

    if (!this.isAdmin(userRole)) {
      qb.innerJoin(
        'project_members',
        'pm',
        'pm.project_id = p.id AND pm.user_id = :userId',
        { userId },
      );
    }

    const total = await qb.getCount();
    const data = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return paginate(data, total, page, limit);
  }

  async createProject(
    dto: CreateProjectDto,
    userId: string,
  ): Promise<ProjectEntity> {
    const exists = await this.projectRepo.existsBy({ slug: dto.slug });
    if (exists) {
      throw new ConflictException(`Project "${dto.slug}" already exists`);
    }

    const project = await this.projectRepo.save(
      this.projectRepo.create({
        slug: dto.slug,
        name: dto.name ?? dto.slug,
        ownerId: userId,
        aiTokenDailyLimit: 2_000_000,
      }),
    );

    // Auto-add creator as owner member
    await this.memberRepo.save(
      this.memberRepo.create({
        projectId: project.id,
        userId,
        role: 'owner',
      }),
    );

    // Auto-create default source locale (English)
    await this.localeRepo.save(
      this.localeRepo.create({
        projectId: project.id,
        code: 'en',
        isDefault: true,
      }),
    );

    // Create namespaces provided by the user
    await this.namespaceRepo.save(
      dto.namespaces.map((slug) =>
        this.namespaceRepo.create({
          projectId: project.id,
          slug,
        }),
      ),
    );

    // Auto-initialize sandbox (empty — no production data to copy yet)
    await this.projectRepo.update(project.id, {
      sandboxInitializedAt: new Date(),
      sandboxHasChanges: false,
    });
    project.sandboxInitializedAt = new Date();
    project.sandboxHasChanges = false;

    return project;
  }

  async getProjectDetails(
    slug: string,
    userId: string,
    userRole: UserRole,
  ): Promise<ProjectDetails> {
    const project = await this.requireProject(slug);
    await this.assertAccess(project, userId, userRole);

    const [locales, nsRows] = await Promise.all([
      this.localeRepo.find({
        where: { projectId: project.id },
        order: { isDefault: 'DESC', code: 'ASC' },
      }),
      this.namespaceRepo
        .createQueryBuilder('ns')
        .select('ns.slug', 'slug')
        .addSelect(
          `(SELECT ROUND(AVG(tv.quality_score))::int
            FROM translation_keys tk
            JOIN translation_values tv ON tv.key_id = tk.id
            WHERE tk.namespace_id = ns.id
              AND tv.quality_score IS NOT NULL)`,
          'avgScore',
        )
        .where('ns.project_id = :projectId', { projectId: project.id })
        .getRawMany<{ slug: string; avgScore: string | null }>(),
    ]);

    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      ownerId: project.ownerId,
      createdAt: project.createdAt,
      locales: locales.map((l) => ({
        code: l.code,
        isDefault: l.isDefault,
        aliases: l.aliases ?? [],
        localeSkill: l.localeSkill ?? null,
      })),
      namespaces: nsRows.map((r) => ({
        slug: r.slug,
        avgScore: r.avgScore !== null ? Number(r.avgScore) : null,
      })),
      autoTranslateEnabled: project.autoTranslateEnabled,
      aiTokenDailyLimit: project.aiTokenDailyLimit ?? null,
    };
  }

  async deleteProject(
    slug: string,
    userId: string,
    userRole: UserRole,
  ): Promise<void> {
    const project = await this.requireProject(slug);
    await this.assertManageAccess(project, userId, userRole);
    await this.projectRepo.remove(project);
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  async listMembers(
    projectSlug: string,
    userId: string,
    userRole: UserRole,
  ): Promise<MemberRow[]> {
    const project = await this.requireProject(projectSlug);
    await this.assertAccess(project, userId, userRole);

    const rows = await this.memberRepo
      .createQueryBuilder('pm')
      .innerJoin(UserEntity, 'u', 'u.id = pm.user_id')
      .where('pm.project_id = :projectId', { projectId: project.id })
      .select([
        'pm.user_id AS "userId"',
        'pm.role AS role',
        'u.email AS email',
        'u.first_name AS "firstName"',
        'u.last_name AS "lastName"',
      ])
      .orderBy('pm.created_at', 'ASC')
      .getRawMany<MemberRow>();

    return rows;
  }

  async addMember(
    projectSlug: string,
    dto: AddMemberDto,
    requesterId: string,
    requesterRole: UserRole,
  ): Promise<MemberRow> {
    const project = await this.requireProject(projectSlug);
    await this.assertManageAccess(project, requesterId, requesterRole);

    const targetUser = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (!targetUser) {
      throw new NotFoundException(`No user with email "${dto.email}"`);
    }

    const existing = await this.memberRepo.findOne({
      where: { projectId: project.id, userId: targetUser.id },
    });
    if (existing) {
      throw new ConflictException(
        `User "${dto.email}" is already a member of this project`,
      );
    }

    const member = await this.memberRepo.save(
      this.memberRepo.create({
        projectId: project.id,
        userId: targetUser.id,
        role: dto.role ?? 'member',
      }),
    );

    return {
      userId: member.userId,
      email: targetUser.email,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      role: member.role,
    };
  }

  async removeMember(
    projectSlug: string,
    targetUserId: string,
    requesterId: string,
    requesterRole: UserRole,
  ): Promise<void> {
    const project = await this.requireProject(projectSlug);
    await this.assertManageAccess(project, requesterId, requesterRole);

    const member = await this.memberRepo.findOne({
      where: { projectId: project.id, userId: targetUserId },
    });
    if (!member) {
      throw new NotFoundException(`User is not a member of this project`);
    }
    if (member.role === 'owner') {
      throw new BadRequestException(
        'Cannot remove the project owner. Transfer ownership first.',
      );
    }

    await this.memberRepo.remove(member);
  }

  // ─── Namespaces ───────────────────────────────────────────────────────────

  async createNamespace(
    projectSlug: string,
    dto: CreateNamespaceDto,
    userId: string,
    userRole: UserRole,
  ): Promise<NamespaceEntity> {
    const project = await this.requireProject(projectSlug);
    await this.assertManageAccess(project, userId, userRole);

    const exists = await this.namespaceRepo.existsBy({
      projectId: project.id,
      slug: dto.slug,
    });
    if (exists) {
      throw new ConflictException(
        `Namespace "${dto.slug}" already exists in project "${projectSlug}"`,
      );
    }

    return this.namespaceRepo.save(
      this.namespaceRepo.create({
        projectId: project.id,
        slug: dto.slug,
        originalFile: `${dto.slug}.json`,
      }),
    );
  }

  async createLocale(
    projectSlug: string,
    code: string,
    isDefault = false,
    userId: string,
    userRole: UserRole,
    aliases: string[] = [],
    localeSkill?: string | null,
    initTranslate = false,
  ): Promise<LocaleEntity> {
    const project = await this.requireProject(projectSlug);
    await this.assertManageAccess(project, userId, userRole);

    const exists = await this.localeRepo.existsBy({
      projectId: project.id,
      code,
    });
    if (exists) {
      throw new ConflictException(
        `Locale "${code}" already exists in project "${projectSlug}"`,
      );
    }

    return this.localeRepo.save(
      this.localeRepo.create({
        projectId: project.id,
        code,
        isDefault,
        aliases,
        localeSkill: localeSkill ?? getLocaleSkill(code) ?? null,
        initTranslate,
      }),
    );
  }

  async updateLocale(
    projectSlug: string,
    code: string,
    aliases: string[],
    userId: string,
    userRole: UserRole,
    localeSkill?: string | null,
  ): Promise<LocaleEntity> {
    const project = await this.requireProject(projectSlug);
    await this.assertManageAccess(project, userId, userRole);

    const locale = await this.localeRepo.findOne({
      where: { projectId: project.id, code },
    });
    if (!locale) throw new NotFoundException(`Locale "${code}" not found`);

    locale.aliases = aliases;
    if (localeSkill !== undefined) locale.localeSkill = localeSkill;
    return this.localeRepo.save(locale);
  }

  async deleteLocale(
    projectSlug: string,
    code: string,
    userId: string,
    userRole: UserRole,
  ): Promise<void> {
    const project = await this.requireProject(projectSlug);
    await this.assertManageAccess(project, userId, userRole);

    const locale = await this.localeRepo.findOne({
      where: { projectId: project.id, code },
    });
    if (!locale) throw new NotFoundException(`Locale "${code}" not found`);

    if (locale.isDefault) {
      throw new BadRequestException(
        `Cannot delete the default locale "${code}". Change the default locale first.`,
      );
    }

    await this.localeRepo.remove(locale);
  }

  async updateNamespace(
    projectSlug: string,
    oldSlug: string,
    newSlug: string,
    userId: string,
    userRole: UserRole,
  ): Promise<NamespaceEntity> {
    const project = await this.requireProject(projectSlug);
    await this.assertManageAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: oldSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${oldSlug}" not found`);

    if (oldSlug !== newSlug) {
      const exists = await this.namespaceRepo.existsBy({
        projectId: project.id,
        slug: newSlug,
      });
      if (exists) {
        throw new ConflictException(
          `Namespace "${newSlug}" already exists in project "${projectSlug}"`,
        );
      }
    }

    ns.slug = newSlug;
    ns.originalFile = `${newSlug}.json`;
    return this.namespaceRepo.save(ns);
  }

  async deleteNamespace(
    projectSlug: string,
    nsSlug: string,
    userId: string,
    userRole: UserRole,
  ): Promise<void> {
    const project = await this.requireProject(projectSlug);
    await this.assertManageAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    await this.namespaceRepo.remove(ns);
  }

  // ─── Entries ──────────────────────────────────────────────────────────────

  async listEntries(
    projectSlug: string,
    nsSlug: string,
    query: ListEntriesQueryDto,
    userId: string,
    userRole: UserRole,
  ): Promise<PaginatedResponse<EntryRow>> {
    const {
      page,
      limit,
      search,
      searchLocale,
      sortBy,
      sortOrder,
      qualityLevel,
      reviewState,
      missingLocale,
    } = query;

    const project = await this.requireProject(projectSlug);
    await this.assertAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const locales = await this.localeRepo.findBy({ projectId: project.id });
    const localeMap = new Map(locales.map((l) => [l.id, l.code]));

    const qb = // Only include keys that have at least one production value.
      // Sandbox-only keys (added in sandbox, not yet promoted) must not appear here.
      this.keyRepo
        .createQueryBuilder('tk')
        .where('tk.namespace_id = :nsId', { nsId: ns.id }).andWhere(`EXISTS (
        SELECT 1 FROM translation_values tv_exist WHERE tv_exist.key_id = tk.id
      )`);

    if (search && search.length >= 2) {
      const valueCondition = searchLocale
        ? `EXISTS (
            SELECT 1 FROM translation_values tv2
            JOIN translation_locales l2 ON l2.id = tv2.locale_id
            WHERE tv2.key_id = tk.id
              AND tv2.value ILIKE :search
              AND l2.code = :searchLocale
          )`
        : `EXISTS (
            SELECT 1 FROM translation_values tv2
            WHERE tv2.key_id = tk.id
              AND tv2.value ILIKE :search
          )`;

      qb.andWhere(`(tk.key ILIKE :search OR ${valueCondition})`, {
        search: `%${search}%`,
        ...(searchLocale ? { searchLocale } : {}),
      });
    }

    if (qualityLevel) {
      if (qualityLevel === 'unchecked') {
        qb.andWhere(`EXISTS (
          SELECT 1 FROM translation_values tv3
          WHERE tv3.key_id = tk.id AND tv3.value IS NOT NULL AND tv3.quality_level IS NULL
        )`);
      } else if (qualityLevel === 'needs_context') {
        qb.andWhere(
          "tk.context_need IN ('required', 'useful') AND tk.context IS NULL",
        );
      } else if (qualityLevel === 'context_required') {
        qb.andWhere("tk.context_need = 'required' AND tk.context IS NULL");
      } else if (qualityLevel === 'context_useful') {
        qb.andWhere("tk.context_need = 'useful' AND tk.context IS NULL");
      } else if (qualityLevel === 'expected') {
        qb.andWhere(
          `EXISTS (
            SELECT 1 FROM translation_values tv3
            WHERE tv3.key_id = tk.id AND tv3.quality_level = 'expected'
          )`,
        );
      } else {
        qb.andWhere(
          `EXISTS (
          SELECT 1 FROM translation_values tv3
          WHERE tv3.key_id = tk.id AND tv3.quality_level = :qualityLevel
        )`,
          { qualityLevel },
        );
      }
    }

    if (reviewState) {
      qb.andWhere(
        `EXISTS (
          SELECT 1 FROM translation_values tv4
          WHERE tv4.key_id = tk.id AND tv4.quality_review_state = :reviewState
        )`,
        { reviewState },
      );
    }

    if (missingLocale) {
      qb.andWhere(
        `NOT EXISTS (
          SELECT 1 FROM translation_values tv_ml
          JOIN translation_locales tl_ml ON tl_ml.id = tv_ml.locale_id
          WHERE tv_ml.key_id = tk.id
            AND tl_ml.code = :missingLocale
            AND tv_ml.value IS NOT NULL
            AND tv_ml.value != ''
        )`,
        { missingLocale },
      );
    }

    if (sortBy === 'qualityScore') {
      qb.orderBy(
        `(SELECT MIN(tv_qs.quality_score) FROM translation_values tv_qs WHERE tv_qs.key_id = tk.id AND tv_qs.quality_score IS NOT NULL)`,
        sortOrder.toUpperCase() as 'ASC' | 'DESC',
        'NULLS LAST',
      );
    } else {
      const sortColumn = sortBy === 'createdAt' ? 'tk.created_at' : 'tk.key';
      qb.orderBy(sortColumn, sortOrder.toUpperCase() as 'ASC' | 'DESC');
    }

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const keys = await qb.getMany();

    if (!keys.length) {
      return paginate([], total, page, limit);
    }

    const keyIds = keys.map((k) => k.id);
    const values = await this.valueRepo
      .createQueryBuilder('tv')
      .where('tv.key_id IN (:...keyIds)', { keyIds })
      .select([
        'tv.key_id AS key_id',
        'tv.locale_id AS locale_id',
        'tv.value AS value',
        'tv.quality_score AS quality_score',
        'tv.quality_level AS quality_level',
        'tv.quality_comment AS quality_comment',
        'tv.quality_checked_at AS quality_checked_at',
        'tv.quality_review_state AS quality_review_state',
      ])
      .getRawMany<{
        key_id: string;
        locale_id: string;
        value: string | null;
        quality_score: number | null;
        quality_level: string | null;
        quality_comment: string | null;
        quality_checked_at: string | null;
        quality_review_state: string | null;
      }>();

    const valuesByKey = new Map<string, Record<string, string>>();
    const qualityByKey = new Map<string, Record<string, QualityInfo | null>>();
    for (const v of values) {
      if (!valuesByKey.has(v.key_id)) valuesByKey.set(v.key_id, {});
      if (!qualityByKey.has(v.key_id)) qualityByKey.set(v.key_id, {});
      const locale = localeMap.get(v.locale_id);
      if (locale) {
        valuesByKey.get(v.key_id)![locale] = v.value ?? '';
        qualityByKey.get(v.key_id)![locale] = {
          reviewState: (v.quality_review_state ??
            'not_checked') as QualityInfo['reviewState'],
          score: v.quality_score,
          level: v.quality_level as
            | 'green'
            | 'yellow'
            | 'red'
            | 'expected'
            | null,
          comment: v.quality_comment,
          checkedAt: v.quality_checked_at,
        };
      }
    }

    const data: EntryRow[] = keys.map((k) => ({
      key: k.key,
      createdAt: k.createdAt,
      context: k.context ?? null,
      contextNeed: k.contextNeed ?? null,
      contextReason: k.contextReason ?? null,
      values: valuesByKey.get(k.id) ?? {},
      quality: qualityByKey.get(k.id) ?? {},
    }));

    return paginate(data, total, page, limit);
  }

  async getAttentionItems(
    projectSlug: string,
    nsSlug: string,
    options: {
      limit: number;
      qualityLevels: string[];
      includeUnchecked: boolean;
    },
    userId: string,
    userRole: UserRole,
  ): Promise<PaginatedResponse<EntryRow>> {
    const project = await this.requireProject(projectSlug);
    await this.assertAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const limit = Math.min(options.limit, 100);
    const levels = options.qualityLevels.filter((l) =>
      ['green', 'yellow', 'red'].includes(l),
    );

    // Build WHERE conditions for non-green items
    const conditions: string[] = [];
    const params: unknown[] = [ns.id];

    if (levels.length) {
      params.push(levels);
      conditions.push(`EXISTS (
        SELECT 1 FROM translation_values tv2
        WHERE tv2.key_id = tk.id AND tv2.quality_level = ANY($${params.length})
      )`);
    }

    if (options.includeUnchecked) {
      conditions.push(`EXISTS (
        SELECT 1 FROM translation_values tv3
        WHERE tv3.key_id = tk.id AND tv3.value IS NOT NULL AND tv3.quality_level IS NULL
      )`);
    }

    // Always include keys where context is required/useful but missing
    if (
      options.qualityLevels.includes('needs_context') ||
      !options.qualityLevels.length
    ) {
      conditions.push(
        `(tk.context_need IN ('required', 'useful') AND tk.context IS NULL)`,
      );
    }

    const whereClause = conditions.length
      ? `AND (${conditions.join(' OR ')})`
      : '';

    // Count + fetch keys
    const countResult = await this.dataSource.query<{ cnt: string }[]>(
      `SELECT COUNT(DISTINCT tk.id) AS cnt
       FROM translation_keys tk
       WHERE tk.namespace_id = $1 ${whereClause}`,
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
      `SELECT DISTINCT tk.id, tk.key, tk.created_at, tk.context, tk.context_need, tk.context_reason,
              (SELECT MIN(tv_qs.quality_score) FROM translation_values tv_qs WHERE tv_qs.key_id = tk.id AND tv_qs.quality_score IS NOT NULL) AS _qs
       FROM translation_keys tk
       WHERE tk.namespace_id = $1 ${whereClause}
       ORDER BY _qs ASC NULLS FIRST
       LIMIT $${params.length}`,
      params,
    );

    if (!keys.length) return paginate([], total, 1, limit);

    const keyIds = keys.map((k) => k.id);

    // Load values and quality
    const values = await this.dataSource.query<
      { key_id: string; locale: string; value: string | null }[]
    >(
      `SELECT tv.key_id, l.code AS locale, tv.value
       FROM translation_values tv
       JOIN translation_locales l ON l.id = tv.locale_id
       WHERE tv.key_id = ANY($1)`,
      [keyIds],
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
      `SELECT tv.key_id, l.code AS locale,
              tv.quality_score, tv.quality_level, tv.quality_comment,
              tv.quality_checked_at, tv.quality_review_state
       FROM translation_values tv
       JOIN translation_locales l ON l.id = tv.locale_id
       WHERE tv.key_id = ANY($1)`,
      [keyIds],
    );

    // Build maps
    const valuesByKey = new Map<string, Record<string, string>>();
    for (const v of values) {
      if (!valuesByKey.has(v.key_id)) valuesByKey.set(v.key_id, {});
      if (v.value != null) valuesByKey.get(v.key_id)![v.locale] = v.value;
    }

    const qualityByKey = new Map<string, Record<string, QualityInfo>>();
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

    const data: EntryRow[] = keys.map((k) => ({
      key: k.key,
      createdAt: k.created_at,
      context: k.context ?? null,
      contextNeed: (k.context_need as EntryRow['contextNeed']) ?? null,
      contextReason: k.context_reason ?? null,
      values: valuesByKey.get(k.id) ?? {},
      quality: qualityByKey.get(k.id) ?? {},
    }));

    return paginate(data, total, 1, limit);
  }

  async createEntry(
    projectSlug: string,
    nsSlug: string,
    dto: CreateEntryDto,
    userId: string,
    userRole: UserRole,
  ): Promise<EntryRow> {
    const project = await this.requireProject(projectSlug);
    await this.assertAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

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

    const values = await this.upsertValues(
      project.id,
      keyEntity.id,
      dto.values ?? {},
    );

    this.emitWebhook(
      'translation.created',
      project,
      nsSlug,
      dto.key,
      Object.keys(dto.values ?? {}),
    );

    return {
      key: keyEntity.key,
      createdAt: keyEntity.createdAt,
      context: keyEntity.context,
      contextNeed: keyEntity.contextNeed ?? null,
      contextReason: keyEntity.contextReason ?? null,
      values,
      quality: {},
    };
  }

  async updateEntry(
    projectSlug: string,
    nsSlug: string,
    key: string,
    dto: UpdateEntryDto,
    userId: string,
    userRole: UserRole,
  ): Promise<EntryRow> {
    const project = await this.requireProject(projectSlug);
    await this.assertAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const keyEntity = await this.keyRepo.findOne({
      where: { namespaceId: ns.id, key },
    });
    if (!keyEntity) throw new NotFoundException(`Key "${key}" not found`);

    if (dto.context !== undefined) {
      const oldContext = keyEntity.context;
      keyEntity.context = dto.context ?? null;
      // Reset contextNeed so AI re-determines it with new context
      if (oldContext !== keyEntity.context) {
        keyEntity.contextNeed = null;
        keyEntity.contextReason = null;
      }
      await this.keyRepo.save(keyEntity);
      // Context change triggers async quality re-evaluation
      if (oldContext !== keyEntity.context) {
        await this.resetQualityForKey(keyEntity.id);
      }
    }

    const values = await this.upsertValues(
      project.id,
      keyEntity.id,
      dto.values,
    );

    this.emitWebhook(
      'translation.updated',
      project,
      nsSlug,
      key,
      Object.keys(dto.values),
    );

    return {
      key: keyEntity.key,
      createdAt: keyEntity.createdAt,
      context: keyEntity.context,
      contextNeed: keyEntity.contextNeed ?? null,
      contextReason: keyEntity.contextReason ?? null,
      values,
      quality: {},
    };
  }

  async deleteEntry(
    projectSlug: string,
    nsSlug: string,
    key: string,
    userId: string,
    userRole: UserRole,
  ): Promise<void> {
    const project = await this.requireProject(projectSlug);
    await this.assertAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const keyEntity = await this.keyRepo.findOne({
      where: { namespaceId: ns.id, key },
    });
    if (!keyEntity) throw new NotFoundException(`Key "${key}" not found`);

    this.emitWebhook('translation.deleted', project, nsSlug, key);

    await this.keyRepo.remove(keyEntity);
  }

  // ─── Locize-compatible read (public — no access check) ────────────────────

  /**
   * BCP 47 locale aliases — maps short ISO 639-1 codes (used by legacy apps) to
   * the full BCP 47 codes stored on the server. Tried as fallback when the exact
   * locale code is not found.
   *
   * To add a new alias: append an entry here. No other changes needed.
   */
  private static readonly LOCALE_ALIASES: Record<string, string> = {
    no: 'nb', // Norwegian (legacy ISO 639-1)
    nn: 'nb', // Norwegian Nynorsk — fall back to Bokmål
    'nb-NO': 'nb', // backward compat — was normalised to nb by migration
    'da-DK': 'da', // backward compat — was normalised to da by migration
  };

  async getNamespace(
    projectSlug: string,
    namespace: string,
    locale: string,
  ): Promise<Record<string, unknown>> {
    // Resolve alias: if the consumer passes 'no' or 'da', map to the canonical code
    const resolvedLocale =
      TranslationsService.LOCALE_ALIASES[locale.toLowerCase()] ?? locale;

    const rows = await this.valueRepo
      .createQueryBuilder('tv')
      .innerJoin('tv.translationKey', 'tk')
      .innerJoin('tk.namespace', 'ns')
      .innerJoin('ns.project', 'p')
      .innerJoin('tv.locale', 'l')
      .where('p.slug = :projectSlug', { projectSlug })
      .andWhere('ns.slug = :namespace', { namespace })
      .andWhere('l.code = :locale', { locale: resolvedLocale })
      .select(['tk.key AS key', 'tv.value AS value'])
      .getRawMany<{ key: string; value: string | null }>();

    if (!rows.length) {
      const projectExists = await this.projectRepo.existsBy({
        slug: projectSlug,
      });
      if (!projectExists) {
        throw new NotFoundException(`Project "${projectSlug}" not found`);
      }
      const nsExists = await this.namespaceRepo.existsBy({ slug: namespace });
      if (!nsExists) {
        throw new NotFoundException(
          `Namespace "${namespace}" not found in project "${projectSlug}"`,
        );
      }
      throw new NotFoundException(
        `Locale "${locale}" not found in namespace "${namespace}"`,
      );
    }

    const flat: Record<string, string> = Object.fromEntries(
      rows.map((r) => [r.key, r.value ?? '']),
    );
    return this.unflattenJson(flat);
  }

  async getLocales(projectSlug: string): Promise<string[]> {
    const project = await this.projectRepo.findOne({
      where: { slug: projectSlug },
    });
    if (!project) {
      throw new NotFoundException(`Project "${projectSlug}" not found`);
    }
    const locales = await this.localeRepo.findBy({ projectId: project.id });
    return locales.map((l) => l.code);
  }

  async getNamespaces(projectSlug: string): Promise<string[]> {
    const project = await this.projectRepo.findOne({
      where: { slug: projectSlug },
    });
    if (!project) {
      throw new NotFoundException(`Project "${projectSlug}" not found`);
    }
    const namespaces = await this.namespaceRepo.findBy({
      projectId: project.id,
    });
    return namespaces.map((ns) => ns.slug);
  }

  async importFromZip(
    fileBuffer: Buffer,
    dto: ImportTranslationsDto,
  ): Promise<{ imported: number; locales: string[]; namespaces: string[] }> {
    const { projectSlug, projectName } = dto;
    const zipData = this.parseZip(fileBuffer);
    const localeCodes = Object.keys(zipData);

    if (!localeCodes.length) {
      throw new BadRequestException(
        'ZIP file contains no valid locale directories',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const projectRepo = manager.getRepository(ProjectEntity);
      const namespaceRepo = manager.getRepository(NamespaceEntity);
      const localeRepo = manager.getRepository(LocaleEntity);
      const keyRepo = manager.getRepository(TranslationKeyEntity);

      let project = await projectRepo.findOne({ where: { slug: projectSlug } });
      if (!project) {
        project = await projectRepo.save(
          projectRepo.create({
            slug: projectSlug,
            name: projectName ?? projectSlug,
            aiTokenDailyLimit: 2_000_000,
          }),
        );
      }

      // Ensure 'en' locale always exists and is default
      const localeMap = new Map<string, LocaleEntity>();
      const allLocaleCodes = new Set(localeCodes);
      allLocaleCodes.add('en');

      for (const code of allLocaleCodes) {
        let locale = await localeRepo.findOne({
          where: { projectId: project.id, code },
        });
        if (!locale) {
          locale = await localeRepo.save(
            localeRepo.create({
              projectId: project.id,
              code,
              isDefault: code === 'en',
            }),
          );
        } else if (code === 'en' && !locale.isDefault) {
          locale.isDefault = true;
          await localeRepo.save(locale);
        }
        localeMap.set(code, locale);
      }

      const allNamespaceSlugs = new Set<string>();
      for (const localeData of Object.values(zipData)) {
        for (const nsSlug of Object.keys(localeData)) {
          allNamespaceSlugs.add(nsSlug);
        }
      }

      const namespaceMap = new Map<string, NamespaceEntity>();
      let imported = 0;

      for (const nsSlug of allNamespaceSlugs) {
        let ns = await namespaceRepo.findOne({
          where: { projectId: project.id, slug: nsSlug },
        });
        if (!ns) {
          ns = await namespaceRepo.save(
            namespaceRepo.create({
              projectId: project.id,
              slug: nsSlug,
              originalFile: `${nsSlug}.json`,
            }),
          );
        }
        namespaceMap.set(nsSlug, ns);

        // Collect all keys from ZIP for this namespace
        const allKeys = new Set<string>();
        for (const localeData of Object.values(zipData)) {
          const nsData = localeData[nsSlug];
          if (nsData) {
            for (const key of Object.keys(nsData)) allKeys.add(key);
          }
        }

        // Upsert keys: create missing, keep existing
        const existingKeys = await keyRepo.findBy({ namespaceId: ns.id });
        const existingKeyMap = new Map(existingKeys.map((k) => [k.key, k]));

        const newKeys = [...allKeys].filter((k) => !existingKeyMap.has(k));
        if (newKeys.length) {
          const created = await keyRepo.save(
            newKeys.map((key) => keyRepo.create({ namespaceId: ns.id, key })),
          );
          for (const k of created) existingKeyMap.set(k.key, k);
        }

        // Write values to sandbox only
        for (const [localeCode, localeData] of Object.entries(zipData)) {
          const nsData = localeData[nsSlug];
          if (!nsData) continue;
          const locale = localeMap.get(localeCode)!;

          for (const [key, value] of Object.entries(nsData)) {
            const keyEntity = existingKeyMap.get(key);
            if (!keyEntity) continue;

            await manager.query(
              `INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at)
               VALUES ($1, $2, $3, $4, false, now())
               ON CONFLICT (project_id, key_id, locale_id)
               DO UPDATE SET value = $4, is_deleted = false, updated_at = now(),
                 quality_review_state = 'not_checked', quality_score = NULL,
                 quality_level = NULL, quality_comment = NULL, quality_checked_at = NULL`,
              [project.id, keyEntity.id, locale.id, value],
            );
            imported++;
          }
        }
      }

      // Auto-init sandbox if not yet initialized
      if (!project.sandboxInitializedAt) {
        await manager.update(ProjectEntity, project.id, {
          sandboxInitializedAt: new Date(),
          sandboxHasChanges: true,
        });
      } else {
        await manager.update(ProjectEntity, project.id, {
          sandboxHasChanges: true,
        });
      }

      return {
        imported,
        locales: [...localeMap.keys()],
        namespaces: [...namespaceMap.keys()],
      };
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async upsertValues(
    projectId: string,
    keyId: string,
    values: Record<string, string>,
  ): Promise<Record<string, string>> {
    const locales = await this.localeRepo.findBy({ projectId });
    const localeMap = new Map(locales.map((l) => [l.code, l.id]));

    const entities: Partial<TranslationValueEntity>[] = [];
    for (const [code, value] of Object.entries(values)) {
      const localeId = localeMap.get(code);
      if (!localeId) continue;
      entities.push({ keyId, localeId, value });
    }

    if (entities.length) {
      await this.valueRepo.upsert(entities as TranslationValueEntity[], {
        conflictPaths: ['keyId', 'localeId'],
        skipUpdateIfNoValuesChanged: true,
      });

      // Reset quality state for any locale whose content has changed
      for (const [code, value] of Object.entries(values)) {
        const localeId = localeMap.get(code);
        if (!localeId) continue;
        await this.resetQualityStateIfChanged(keyId, localeId, value);
      }
    }

    const saved = await this.valueRepo.find({ where: { keyId } });
    const result: Record<string, string> = {};
    for (const v of saved) {
      const locale = locales.find((l) => l.id === v.localeId);
      if (locale) result[locale.code] = v.value ?? '';
    }
    return result;
  }

  private async resetQualityStateIfChanged(
    keyId: string,
    localeId: string,
    value: string,
  ): Promise<void> {
    const hash = createHash('sha256').update(value).digest('hex');
    await this.valueRepo
      .createQueryBuilder()
      .update()
      .set({
        qualityReviewState: 'not_checked',
        qualityContentHash: hash,
        qualityScore: null,
        qualityLevel: null,
        qualityComment: null,
        qualityCheckedAt: null,
      })
      .where(
        'key_id = :keyId AND locale_id = :localeId AND quality_review_state != :expectedState AND (quality_content_hash IS NULL OR quality_content_hash != :hash)',
        { keyId, localeId, hash, expectedState: 'expected' },
      )
      .execute();
  }

  /** Reset quality state for ALL locales of a key (triggers async re-evaluation). */
  async resetQualityForKey(keyId: string): Promise<void> {
    await this.valueRepo
      .createQueryBuilder()
      .update()
      .set({
        qualityReviewState: 'not_checked',
        qualityScore: null,
        qualityLevel: null,
        qualityComment: null,
        qualityCheckedAt: null,
      })
      .where('key_id = :keyId AND quality_review_state != :expectedState', {
        keyId,
        expectedState: 'expected',
      })
      .execute();
  }

  // ─── Quality check ────────────────────────────────────────────────────────

  private async persistQualityResult(
    keyId: string,
    localeId: string,
    result: {
      score: number;
      level: 'green' | 'yellow' | 'red';
      comment: string;
    },
  ): Promise<void> {
    await this.valueRepo.update(
      { keyId, localeId },
      {
        qualityScore: result.score,
        qualityLevel: result.level,
        qualityComment: result.comment,
        qualityCheckedAt: new Date(),
        qualityReviewState: 'checked',
      },
    );
  }

  async runQualityCheck(
    projectSlug: string,
    nsSlug: string,
    key: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Record<string, QualityInfo | null>> {
    const project = await this.requireProject(projectSlug);
    await this.assertAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const keyEntity = await this.keyRepo.findOne({
      where: { namespaceId: ns.id, key },
    });
    if (!keyEntity) throw new NotFoundException(`Key "${key}" not found`);

    const locales = await this.localeRepo.findBy({ projectId: project.id });
    const defaultLocale = locales.find((l) => l.isDefault);

    // Read source from sandbox first, fallback to production
    let source: string | undefined;
    if (defaultLocale) {
      const [sandboxSource] = await this.dataSource.query<
        { value: string | null }[]
      >(
        `SELECT sv.value FROM sandbox_values sv
         WHERE sv.project_id = $1 AND sv.key_id = $2 AND sv.locale_id = $3 AND sv.is_deleted = false
         LIMIT 1`,
        [project.id, keyEntity.id, defaultLocale.id],
      );
      if (sandboxSource?.value) {
        source = sandboxSource.value;
      } else {
        const prodSource = await this.valueRepo.findOne({
          where: { keyId: keyEntity.id, localeId: defaultLocale.id },
        });
        source = prodSource?.value ?? undefined;
      }
    }

    const results: Record<string, QualityInfo | null> = {};

    await Promise.allSettled(
      locales.map(async (locale) => {
        // Read from sandbox first, fallback to production
        const [sandboxRow] = await this.dataSource.query<
          {
            value: string | null;
            quality_review_state: string | null;
            quality_checked_at: string | null;
          }[]
        >(
          `SELECT sv.value, sv.quality_review_state, sv.quality_checked_at
           FROM sandbox_values sv
           WHERE sv.project_id = $1 AND sv.key_id = $2 AND sv.locale_id = $3 AND sv.is_deleted = false
           LIMIT 1`,
          [project.id, keyEntity.id, locale.id],
        );

        const reviewState = sandboxRow?.quality_review_state;
        if (reviewState === 'expected') {
          results[locale.code] = {
            reviewState: 'expected',
            score: 100,
            level: 'expected',
            comment: null,
            checkedAt: sandboxRow?.quality_checked_at ?? null,
          };
          return;
        }

        const translation = sandboxRow?.value;
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
            keyEntity.context ?? undefined,
          );

          if (
            result.contextNeed &&
            (keyEntity.contextNeed !== result.contextNeed ||
              keyEntity.contextReason !== result.contextReason)
          ) {
            keyEntity.contextNeed = result.contextNeed;
            keyEntity.contextReason = result.contextReason;
            await this.keyRepo.save(keyEntity);
          }

          // Persist to sandbox
          await this.dataSource.query(
            `UPDATE sandbox_values
             SET quality_score = $1, quality_level = $2, quality_comment = $3,
                 quality_checked_at = now(), quality_review_state = 'checked'
             WHERE project_id = $4 AND key_id = $5 AND locale_id = $6`,
            [
              result.score,
              result.level,
              result.comment,
              project.id,
              keyEntity.id,
              locale.id,
            ],
          );

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

  async markAsExpected(
    projectSlug: string,
    nsSlug: string,
    key: string,
    localeCode: string,
    userId: string,
    userRole: UserRole,
  ): Promise<QualityInfo> {
    const project = await this.requireProject(projectSlug);
    await this.assertAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const keyEntity = await this.keyRepo.findOne({
      where: { namespaceId: ns.id, key },
    });
    if (!keyEntity) throw new NotFoundException(`Key "${key}" not found`);

    const locale = await this.localeRepo.findOne({
      where: { projectId: project.id, code: localeCode },
    });
    if (!locale)
      throw new NotFoundException(`Locale "${localeCode}" not found`);

    const valueEntity = await this.valueRepo.findOne({
      where: { keyId: keyEntity.id, localeId: locale.id },
    });
    if (!valueEntity || !valueEntity.value) {
      throw new BadRequestException(
        `No value to mark as expected for ${localeCode}`,
      );
    }

    const hash = createHash('sha256').update(valueEntity.value).digest('hex');
    await this.valueRepo.update(
      { keyId: keyEntity.id, localeId: locale.id },
      {
        qualityScore: 100,
        qualityLevel: 'expected',
        qualityReviewState: 'expected',
        qualityCheckedAt: new Date(),
        qualityContentHash: hash,
        qualityComment: null,
      },
    );

    return {
      reviewState: 'expected',
      score: 100,
      level: 'expected',
      comment: null,
      checkedAt: new Date().toISOString(),
    };
  }

  async unmarkExpected(
    projectSlug: string,
    nsSlug: string,
    key: string,
    localeCode: string,
    userId: string,
    userRole: UserRole,
  ): Promise<QualityInfo> {
    const project = await this.requireProject(projectSlug);
    await this.assertAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    const keyEntity = await this.keyRepo.findOne({
      where: { namespaceId: ns.id, key },
    });
    if (!keyEntity) throw new NotFoundException(`Key "${key}" not found`);

    const locale = await this.localeRepo.findOne({
      where: { projectId: project.id, code: localeCode },
    });
    if (!locale)
      throw new NotFoundException(`Locale "${localeCode}" not found`);

    await this.valueRepo.update(
      { keyId: keyEntity.id, localeId: locale.id },
      {
        qualityScore: null,
        qualityLevel: null,
        qualityReviewState: 'not_checked',
        qualityCheckedAt: null,
        qualityContentHash: null,
        qualityComment: null,
      },
    );

    return {
      reviewState: 'not_checked',
      score: null,
      level: null,
      comment: null,
      checkedAt: null,
    };
  }

  private parseZip(
    buffer: Buffer,
  ): Record<string, Record<string, Record<string, string>>> {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();
    const result: Record<string, Record<string, Record<string, string>>> = {};

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const parts = entry.entryName.split('/');
      const jsonName = parts[parts.length - 1];
      const locale = parts[parts.length - 2];
      if (!jsonName.endsWith('.json') || !locale) continue;
      const nsSlug = jsonName.replace(/\.json$/, '');

      let rawContent: unknown;
      try {
        rawContent = JSON.parse(entry.getData().toString('utf8'));
      } catch {
        continue;
      }
      if (
        typeof rawContent !== 'object' ||
        rawContent === null ||
        Array.isArray(rawContent)
      ) {
        continue;
      }

      result[locale] ??= {};
      result[locale][nsSlug] = this.flattenJson(
        rawContent as Record<string, unknown>,
      );
    }

    return result;
  }

  private flattenJson(
    obj: Record<string, unknown>,
    prefix = '',
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value)
      ) {
        Object.assign(
          result,
          this.flattenJson(value as Record<string, unknown>, fullKey),
        );
      } else {
        result[fullKey] =
          value != null ? (value as string | number | boolean).toString() : '';
      }
    }
    return result;
  }

  private unflattenJson(flat: Record<string, string>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(flat)) {
      const parts = key.split('.');
      if (parts.length === 1) {
        result[key] = value;
        continue;
      }
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (
          typeof current[parts[i]] !== 'object' ||
          current[parts[i]] === null
        ) {
          current[parts[i]] = {};
        }
        current = current[parts[i]] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]] = value;
    }
    return result;
  }

  // ─── Bulk operations ──────────────────────────────────────────────────────

  async bulkQualityCheck(
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
    await this.assertAccess(project, userId, userRole);

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
        const checkResult = await this.runQualityCheck(
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

  async bulkMarkExpected(
    projectSlug: string,
    nsSlug: string,
    keys: string[],
    locale: string | undefined,
    userId: string,
    userRole: UserRole,
  ): Promise<{ marked: number }> {
    const project = await this.requireProject(projectSlug);
    await this.assertAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    let marked = 0;

    if (locale) {
      for (const key of keys) {
        try {
          await this.markAsExpected(
            projectSlug,
            nsSlug,
            key,
            locale,
            userId,
            userRole,
          );
          marked++;
        } catch {
          // skip failures, count only successes
        }
      }
    } else {
      const locales = await this.localeRepo.findBy({ projectId: project.id });
      for (const key of keys) {
        for (const loc of locales) {
          try {
            await this.markAsExpected(
              projectSlug,
              nsSlug,
              key,
              loc.code,
              userId,
              userRole,
            );
            marked++;
          } catch {
            // skip failures, count only successes
          }
        }
      }
    }

    return { marked };
  }

  async bulkUpdateContext(
    projectSlug: string,
    nsSlug: string,
    updates: Array<{ key: string; context: string }>,
    userId: string,
    userRole: UserRole,
  ): Promise<{ updated: number }> {
    const project = await this.requireProject(projectSlug);
    await this.assertAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    let updated = 0;
    for (const item of updates) {
      const result = await this.keyRepo.update(
        { namespaceId: ns.id, key: item.key },
        { context: item.context },
      );
      updated += result.affected ?? 0;
    }

    return { updated };
  }
}
