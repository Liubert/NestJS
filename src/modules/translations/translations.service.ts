import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import AdmZip from 'adm-zip';
import { flattenJson, unflattenJson } from '../../common/utils/json.util.js';
import { resolveLocaleAlias } from './constants/locale-aliases.const.js';
import { ProjectAccessHelper } from './helpers/project-access.helper.js';
import { ProjectEntity } from './entities/project.entity.js';
import { NamespaceEntity } from './entities/namespace.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import { ProjectMemberEntity } from './entities/project-member.entity.js';
import { UserEntity } from '../users/user.entity.js';
import { UserRole } from '../users/types/user-role.enum.js';
import { ImportTranslationsDto } from './dto/import-translations.dto.js';
import { CreateEntryDto } from './dto/create-entry.dto.js';
import { UpdateEntryDto } from './dto/update-entry.dto.js';
import { ListEntriesQueryDto } from './dto/list-entries-query.dto.js';
import {
  paginate,
  PaginatedResponse,
} from '../../common/dto/paginated-response.dto.js';
import { AiTranslateService } from './ai-translate.service.js';
import {
  WebhooksService,
  WebhookEventPayload,
} from '../webhooks/webhooks.service.js';
import type { QualityInfo, EntryRow } from './types/entry.types.js';
import { groupQualityByKeyWithLocaleMap } from './helpers/entry-list.helper.js';
import { TranslationProjectsService } from './translation-projects.service.js';
import { TranslationQualityService } from './translation-quality.service.js';

export type { QualityInfo, EntryRow };
export type {
  LocaleInfo,
  ProjectDetails,
  MemberRow,
} from './translation-projects.service.js';

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
    private readonly access: ProjectAccessHelper,
    private readonly projectsService: TranslationProjectsService,
    private readonly qualityService: TranslationQualityService,
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

  // ─── Delegated: Projects, Members, Namespaces, Locales ─────────────────────
  // These delegate to TranslationProjectsService — kept here for controller backward compat.

  getProjectBySlug = this.projectsService.getProjectBySlug.bind(
    this.projectsService,
  );
  requireNamespace = this.projectsService.requireNamespace.bind(
    this.projectsService,
  );
  listProjects = this.projectsService.listProjects.bind(this.projectsService);
  createProject = this.projectsService.createProject.bind(this.projectsService);
  getProjectDetails = this.projectsService.getProjectDetails.bind(
    this.projectsService,
  );
  deleteProject = this.projectsService.deleteProject.bind(this.projectsService);
  listMembers = this.projectsService.listMembers.bind(this.projectsService);
  addMember = this.projectsService.addMember.bind(this.projectsService);
  removeMember = this.projectsService.removeMember.bind(this.projectsService);
  createNamespace = this.projectsService.createNamespace.bind(
    this.projectsService,
  );
  createLocale = this.projectsService.createLocale.bind(this.projectsService);
  deleteLocale = this.projectsService.deleteLocale.bind(this.projectsService);
  deleteNamespace = this.projectsService.deleteNamespace.bind(
    this.projectsService,
  );

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
      missingLocale,
    } = query;

    const project = await this.access.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, userRole);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

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

    const { valuesByKey, qualityByKey } = groupQualityByKeyWithLocaleMap(
      values,
      localeMap,
    );

    const data: EntryRow[] = keys.map((k) => ({
      key: k.key,
      createdAt: k.createdAt,
      context: k.context ?? null,
      values: valuesByKey.get(k.id) ?? {},
      quality: qualityByKey.get(k.id) ?? {},
    }));

    return paginate(data, total, page, limit);
  }

  async createEntry(
    projectSlug: string,
    nsSlug: string,
    dto: CreateEntryDto,
    userId: string,
    userRole: UserRole,
  ): Promise<EntryRow> {
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, userRole);

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
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, userRole);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    const keyEntity = await this.access.requireKey(ns.id, key);

    if (dto.context !== undefined) {
      keyEntity.context = dto.context ?? null;
      await this.keyRepo.save(keyEntity);
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
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, userRole);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    const keyEntity = await this.access.requireKey(ns.id, key);

    this.emitWebhook('translation.deleted', project, nsSlug, key);

    await this.keyRepo.remove(keyEntity);
  }

  // ─── Locize-compatible read (public — no access check) ────────────────────

  async getNamespace(
    projectSlug: string,
    namespace: string,
    locale: string,
  ): Promise<Record<string, unknown>> {
    const resolvedLocale = resolveLocaleAlias(locale);

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
    return unflattenJson(flat);
  }

  async getLocales(projectSlug: string): Promise<string[]> {
    const project = await this.access.requireProject(projectSlug);
    const locales = await this.localeRepo.findBy({ projectId: project.id });
    return locales.map((l) => l.code);
  }

  async getNamespaces(projectSlug: string): Promise<string[]> {
    const project = await this.access.requireProject(projectSlug);
    const namespaces = await this.namespaceRepo.findBy({
      projectId: project.id,
    });
    return namespaces.map((ns) => ns.slug);
  }

  async importFromZip(
    fileBuffer: Buffer,
    dto: ImportTranslationsDto,
  ): Promise<{ imported: number; locales: string[]; namespaces: string[] }> {
    const { projectSlug, projectName, defaultLocale = 'en' } = dto;
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
      const valueRepo = manager.getRepository(TranslationValueEntity);

      let project = await projectRepo.findOne({ where: { slug: projectSlug } });
      if (!project) {
        project = await projectRepo.save(
          projectRepo.create({
            slug: projectSlug,
            name: projectName ?? projectSlug,
          }),
        );
      }

      const localeMap = new Map<string, LocaleEntity>();
      for (const code of localeCodes) {
        let locale = await localeRepo.findOne({
          where: { projectId: project.id, code },
        });
        if (!locale) {
          locale = await localeRepo.save(
            localeRepo.create({
              projectId: project.id,
              code,
              isDefault: code === defaultLocale,
            }),
          );
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

        await keyRepo.delete({ namespaceId: ns.id });

        const allKeys = new Set<string>();
        for (const localeData of Object.values(zipData)) {
          const nsData = localeData[nsSlug];
          if (nsData) {
            for (const key of Object.keys(nsData)) allKeys.add(key);
          }
        }

        const keyEntities = await keyRepo.save(
          [...allKeys].map((key) =>
            keyRepo.create({ namespaceId: ns.id, key }),
          ),
        );
        const keyMap = new Map<string, TranslationKeyEntity>(
          keyEntities.map((k) => [k.key, k]),
        );

        for (const [localeCode, localeData] of Object.entries(zipData)) {
          const nsData = localeData[nsSlug];
          if (!nsData) continue;
          const locale = localeMap.get(localeCode)!;
          const valueEntities = Object.entries(nsData).map(([key, value]) =>
            valueRepo.create({
              keyId: keyMap.get(key)!.id,
              localeId: locale.id,
              value,
            }),
          );
          await valueRepo.save(valueEntities);
          imported += valueEntities.length;
        }
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

  private resetQualityStateIfChanged =
    this.qualityService.resetQualityStateIfChanged.bind(this.qualityService);

  // ─── Delegated: Quality ───────────────────────────────────────────────────

  runQualityCheck = this.qualityService.runQualityCheck.bind(
    this.qualityService,
  );
  markAsExpected = this.qualityService.markAsExpected.bind(this.qualityService);
  unmarkExpected = this.qualityService.unmarkExpected.bind(this.qualityService);

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
      result[locale][nsSlug] = flattenJson(
        rawContent as Record<string, unknown>,
      );
    }

    return result;
  }
}
