import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import AdmZip from 'adm-zip';
import { ProjectEntity } from './entities/project.entity.js';
import { NamespaceEntity } from './entities/namespace.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import { ImportTranslationsDto } from './dto/import-translations.dto.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { CreateNamespaceDto } from './dto/create-namespace.dto.js';
import { CreateEntryDto } from './dto/create-entry.dto.js';
import { UpdateEntryDto } from './dto/update-entry.dto.js';
import { ListEntriesQueryDto } from './dto/list-entries-query.dto.js';
import {
  paginate,
  PaginatedResponse,
} from '../../common/dto/paginated-response.dto.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EntryRow {
  key: string;
  createdAt: Date;
  values: Record<string, string>;
}

export interface ProjectDetails {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  locales: string[];
  namespaces: string[];
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
    private readonly dataSource: DataSource,
  ) {}

  // ─── Projects ─────────────────────────────────────────────────────────────

  async listProjects(
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<ProjectEntity>> {
    const [data, total] = await this.projectRepo.findAndCount({
      order: { name: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return paginate(data, total, page, limit);
  }

  async createProject(dto: CreateProjectDto): Promise<ProjectEntity> {
    const exists = await this.projectRepo.existsBy({ slug: dto.slug });
    if (exists) {
      throw new ConflictException(`Project "${dto.slug}" already exists`);
    }
    return this.projectRepo.save(
      this.projectRepo.create({ slug: dto.slug, name: dto.name ?? dto.slug }),
    );
  }

  async getProjectDetails(slug: string): Promise<ProjectDetails> {
    const project = await this.projectRepo.findOne({ where: { slug } });
    if (!project) throw new NotFoundException(`Project "${slug}" not found`);

    const [locales, namespaces] = await Promise.all([
      this.localeRepo.findBy({ projectId: project.id }),
      this.namespaceRepo.findBy({ projectId: project.id }),
    ]);

    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      createdAt: project.createdAt,
      locales: locales.map((l) => l.code),
      namespaces: namespaces.map((ns) => ns.slug),
    };
  }

  async deleteProject(slug: string): Promise<void> {
    const project = await this.projectRepo.findOne({ where: { slug } });
    if (!project) throw new NotFoundException(`Project "${slug}" not found`);
    await this.projectRepo.remove(project);
  }

  // ─── Namespaces ───────────────────────────────────────────────────────────

  async createNamespace(
    projectSlug: string,
    dto: CreateNamespaceDto,
  ): Promise<NamespaceEntity> {
    const project = await this.projectRepo.findOne({
      where: { slug: projectSlug },
    });
    if (!project)
      throw new NotFoundException(`Project "${projectSlug}" not found`);

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

  async deleteNamespace(projectSlug: string, nsSlug: string): Promise<void> {
    const project = await this.projectRepo.findOne({
      where: { slug: projectSlug },
    });
    if (!project)
      throw new NotFoundException(`Project "${projectSlug}" not found`);

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
  ): Promise<PaginatedResponse<EntryRow>> {
    const { page, limit, search, searchLocale, sortBy, sortOrder } = query;

    const project = await this.projectRepo.findOne({
      where: { slug: projectSlug },
    });
    if (!project)
      throw new NotFoundException(`Project "${projectSlug}" not found`);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    // Fetch all locales for this project (to build the values map)
    const locales = await this.localeRepo.findBy({ projectId: project.id });
    const localeMap = new Map(locales.map((l) => [l.id, l.code]));

    // Build the keys query with optional search
    const qb = this.keyRepo
      .createQueryBuilder('tk')
      .where('tk.namespace_id = :nsId', { nsId: ns.id });

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

    const sortColumn = sortBy === 'createdAt' ? 'tk.created_at' : 'tk.key';
    qb.orderBy(sortColumn, sortOrder.toUpperCase() as 'ASC' | 'DESC');

    const total = await qb.getCount();

    qb.skip((page - 1) * limit).take(limit);
    const keys = await qb.getMany();

    if (!keys.length) {
      return paginate([], total, page, limit);
    }

    // Fetch values for fetched keys in one query
    const keyIds = keys.map((k) => k.id);
    const values = await this.valueRepo
      .createQueryBuilder('tv')
      .where('tv.key_id IN (:...keyIds)', { keyIds })
      .select([
        'tv.key_id AS key_id',
        'tv.locale_id AS locale_id',
        'tv.value AS value',
      ])
      .getRawMany<{
        key_id: string;
        locale_id: string;
        value: string | null;
      }>();

    // Group values by key_id
    const valuesByKey = new Map<string, Record<string, string>>();
    for (const v of values) {
      if (!valuesByKey.has(v.key_id)) valuesByKey.set(v.key_id, {});
      const locale = localeMap.get(v.locale_id);
      if (locale) valuesByKey.get(v.key_id)![locale] = v.value ?? '';
    }

    const data: EntryRow[] = keys.map((k) => ({
      key: k.key,
      createdAt: k.createdAt,
      values: valuesByKey.get(k.id) ?? {},
    }));

    return paginate(data, total, page, limit);
  }

  async createEntry(
    projectSlug: string,
    nsSlug: string,
    dto: CreateEntryDto,
  ): Promise<EntryRow> {
    const { project, ns } = await this.resolveProjectAndNamespace(
      projectSlug,
      nsSlug,
    );

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
      this.keyRepo.create({ namespaceId: ns.id, key: dto.key }),
    );

    const values = await this.upsertValues(
      project.id,
      keyEntity.id,
      dto.values ?? {},
    );

    return { key: keyEntity.key, createdAt: keyEntity.createdAt, values };
  }

  async updateEntry(
    projectSlug: string,
    nsSlug: string,
    key: string,
    dto: UpdateEntryDto,
  ): Promise<EntryRow> {
    const { project, ns } = await this.resolveProjectAndNamespace(
      projectSlug,
      nsSlug,
    );

    const keyEntity = await this.keyRepo.findOne({
      where: { namespaceId: ns.id, key },
    });
    if (!keyEntity) throw new NotFoundException(`Key "${key}" not found`);

    const values = await this.upsertValues(
      project.id,
      keyEntity.id,
      dto.values,
    );

    return { key: keyEntity.key, createdAt: keyEntity.createdAt, values };
  }

  async deleteEntry(
    projectSlug: string,
    nsSlug: string,
    key: string,
  ): Promise<void> {
    const { ns } = await this.resolveProjectAndNamespace(projectSlug, nsSlug);

    const keyEntity = await this.keyRepo.findOne({
      where: { namespaceId: ns.id, key },
    });
    if (!keyEntity) throw new NotFoundException(`Key "${key}" not found`);

    await this.keyRepo.remove(keyEntity);
  }

  // ─── Locize-compatible read (existing, unchanged) ─────────────────────────

  async getNamespace(
    projectSlug: string,
    namespace: string,
    locale: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.valueRepo
      .createQueryBuilder('tv')
      .innerJoin('tv.translationKey', 'tk')
      .innerJoin('tk.namespace', 'ns')
      .innerJoin('ns.project', 'p')
      .innerJoin('tv.locale', 'l')
      .where('p.slug = :projectSlug', { projectSlug })
      .andWhere('ns.slug = :namespace', { namespace })
      .andWhere('l.code = :locale', { locale })
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
            for (const key of Object.keys(nsData)) {
              allKeys.add(key);
            }
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

  private async resolveProjectAndNamespace(
    projectSlug: string,
    nsSlug: string,
  ): Promise<{ project: ProjectEntity; ns: NamespaceEntity }> {
    const project = await this.projectRepo.findOne({
      where: { slug: projectSlug },
    });
    if (!project)
      throw new NotFoundException(`Project "${projectSlug}" not found`);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    return { project, ns };
  }

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
      if (!localeId) continue; // silently ignore unknown locales
      entities.push({ keyId, localeId, value });
    }

    if (entities.length) {
      await this.valueRepo.upsert(entities as TranslationValueEntity[], {
        conflictPaths: ['keyId', 'localeId'],
        skipUpdateIfNoValuesChanged: true,
      });
    }

    // Return fresh values map
    const saved = await this.valueRepo.find({ where: { keyId } });
    const result: Record<string, string> = {};
    for (const v of saved) {
      const locale = locales.find((l) => l.id === v.localeId);
      if (locale) result[locale.code] = v.value ?? '';
    }
    return result;
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
}
