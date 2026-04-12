import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProjectAccessHelper } from './helpers/project-access.helper.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { NamespaceEntity } from '../translations/entities/namespace.entity.js';
import { LocaleEntity } from '../translations/entities/locale.entity.js';
import {
  ProjectMemberEntity,
  ProjectMemberRole,
} from '../translations/entities/project-member.entity.js';
import { UserEntity } from '../users/user.entity.js';
import { UserRole } from '../users/types/user-role.enum.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { CreateNamespaceDto } from './dto/create-namespace.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import {
  paginate,
  PaginatedResponse,
} from '../../common/dto/paginated-response.dto.js';
import { getLocaleSkill } from '../translations/locale-registry.js';

// ─── Types ────────────────────────────────────────────────────────────────────

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
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(NamespaceEntity)
    private readonly namespaceRepo: Repository<NamespaceEntity>,
    @InjectRepository(LocaleEntity)
    private readonly localeRepo: Repository<LocaleEntity>,
    @InjectRepository(ProjectMemberEntity)
    private readonly memberRepo: Repository<ProjectMemberEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly access: ProjectAccessHelper,
  ) {}

  // ─── Delegated access helpers ───────────────────────────────────────────────

  async getProjectBySlug(slug: string): Promise<ProjectEntity> {
    return this.access.requireProject(slug);
  }

  async getProjectLocales(projectSlug: string): Promise<LocaleEntity[]> {
    const project = await this.access.requireProject(projectSlug);
    return this.localeRepo.findBy({ projectId: project.id });
  }

  async requireNamespace(
    projectId: string,
    nsSlug: string,
  ): Promise<NamespaceEntity> {
    return this.access.requireNamespace(projectId, nsSlug);
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

    if (!this.access.isAdmin(userRole)) {
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

    // Create target locales provided by the user
    if (dto.locales?.length) {
      await this.localeRepo.save(
        dto.locales
          .filter((code) => code !== 'en')
          .map((code) =>
            this.localeRepo.create({
              projectId: project.id,
              code,
              isDefault: false,
            }),
          ),
      );
    }

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
    const project = await this.access.requireProject(slug);
    await this.access.assertAccess(project, userId, userRole);

    const [locales, nsRows] = await Promise.all([
      this.localeRepo.find({
        where: { projectId: project.id },
        order: { isDefault: 'DESC', code: 'ASC' },
      }),
      this.namespaceRepo
        .createQueryBuilder('ns')
        .select('ns.slug', 'slug')
        .addSelect(
          `(SELECT ROUND(AVG(min_score))::int
            FROM (
              SELECT MIN(sv.quality_score) AS min_score
              FROM translation_keys tk
              JOIN sandbox_values sv ON sv.key_id = tk.id
                AND sv.project_id = ns.project_id
                AND sv.is_deleted = false
              WHERE tk.namespace_id = ns.id
                AND sv.quality_score IS NOT NULL
              GROUP BY tk.id
            ) per_key)`,
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
    const project = await this.access.requireProject(slug);
    await this.access.assertManageAccess(project, userId, userRole);
    await this.projectRepo.remove(project);
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  async listMembers(
    projectSlug: string,
    userId: string,
    userRole: UserRole,
  ): Promise<MemberRow[]> {
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, userRole);

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
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertManageAccess(project, requesterId, requesterRole);

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
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertManageAccess(project, requesterId, requesterRole);

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
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertManageAccess(project, userId, userRole);

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

  async updateNamespace(
    projectSlug: string,
    oldSlug: string,
    newSlug: string,
    userId: string,
    userRole: UserRole,
  ): Promise<NamespaceEntity> {
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertManageAccess(project, userId, userRole);

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
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertManageAccess(project, userId, userRole);

    const ns = await this.namespaceRepo.findOne({
      where: { projectId: project.id, slug: nsSlug },
    });
    if (!ns) throw new NotFoundException(`Namespace "${nsSlug}" not found`);

    await this.namespaceRepo.remove(ns);
  }

  // ─── Locales ──────────────────────────────────────────────────────────────

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
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertManageAccess(project, userId, userRole);

    const exists = await this.localeRepo.existsBy({
      projectId: project.id,
      code,
    });
    if (exists) {
      throw new ConflictException(
        `Locale "${code}" already exists in project "${projectSlug}"`,
      );
    }

    const locale = await this.localeRepo.save(
      this.localeRepo.create({
        projectId: project.id,
        code,
        isDefault,
        aliases,
        localeSkill: localeSkill ?? getLocaleSkill(code) ?? null,
      }),
    );

    // If initTranslate is requested and this is a non-default locale, create
    // pending sandbox_value placeholders for all keys that have a default-locale
    // sandbox value. The auto-translate worker picks up rows with
    // pending_auto_translate=true regardless of the project's auto_translate_enabled flag.
    if (initTranslate && !isDefault && project.sandboxInitializedAt) {
      const defaultLocale = await this.localeRepo.findOneBy({
        projectId: project.id,
        isDefault: true,
      });
      if (defaultLocale) {
        await this.dataSource.query(
          `INSERT INTO sandbox_values (project_id, key_id, locale_id, value, pending_auto_translate, is_deleted, updated_at)
           SELECT ns.project_id, tk.id, $1, NULL, true, false, NOW()
           FROM translation_namespaces ns
           JOIN translation_keys tk ON tk.namespace_id = ns.id
           JOIN sandbox_values sv_def
             ON sv_def.key_id = tk.id
             AND sv_def.locale_id = $2
             AND sv_def.project_id = ns.project_id
             AND sv_def.is_deleted = false
             AND sv_def.value IS NOT NULL
           WHERE ns.project_id = $3
           ON CONFLICT (project_id, key_id, locale_id) DO NOTHING`,
          [locale.id, defaultLocale.id, project.id],
        );
      }
    }

    return locale;
  }

  async updateLocale(
    projectSlug: string,
    code: string,
    aliases: string[],
    userId: string,
    userRole: UserRole,
    localeSkill?: string | null,
  ): Promise<LocaleEntity> {
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertManageAccess(project, userId, userRole);

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
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertManageAccess(project, userId, userRole);

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

  // ─── Settings ─────────────────────────────────────────────────────────────

  async updateProjectSettings(
    slug: string,
    settings: {
      autoTranslateEnabled?: boolean;
      aiTokenDailyLimit?: number | null;
    },
    userId: string,
    role: UserRole,
  ): Promise<{
    autoTranslateEnabled: boolean;
    aiTokenDailyLimit: number | null;
  }> {
    const project = await this.access.requireProject(slug);
    this.access.assertOwnerOrAdmin(
      project,
      userId,
      role,
      'update project settings',
    );
    if (settings.autoTranslateEnabled !== undefined) {
      project.autoTranslateEnabled = settings.autoTranslateEnabled;
    }
    if ('aiTokenDailyLimit' in settings) {
      project.aiTokenDailyLimit = settings.aiTokenDailyLimit ?? null;
    }
    await this.projectRepo.save(project);
    return {
      autoTranslateEnabled: project.autoTranslateEnabled,
      aiTokenDailyLimit: project.aiTokenDailyLimit,
    };
  }
}
