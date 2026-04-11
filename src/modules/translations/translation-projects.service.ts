import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectAccessHelper } from './helpers/project-access.helper.js';
import { ProjectEntity } from './entities/project.entity.js';
import { NamespaceEntity } from './entities/namespace.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import {
  ProjectMemberEntity,
  ProjectMemberRole,
} from './entities/project-member.entity.js';
import { UserEntity } from '../users/user.entity.js';
import { UserRole } from '../users/types/user-role.enum.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { CreateNamespaceDto } from './dto/create-namespace.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import {
  paginate,
  PaginatedResponse,
} from '../../common/dto/paginated-response.dto.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocaleInfo {
  code: string;
  isDefault: boolean;
}

export interface ProjectDetails {
  id: string;
  slug: string;
  name: string;
  ownerId: string | null;
  createdAt: Date;
  locales: LocaleInfo[];
  namespaces: string[];
  autoTranslateEnabled: boolean;
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
export class TranslationProjectsService {
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
    private readonly access: ProjectAccessHelper,
  ) {}

  // ─── Delegated access helpers ───────────────────────────────────────────────

  async getProjectBySlug(slug: string): Promise<ProjectEntity> {
    return this.access.requireProject(slug);
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

    return project;
  }

  async getProjectDetails(
    slug: string,
    userId: string,
    userRole: UserRole,
  ): Promise<ProjectDetails> {
    const project = await this.access.requireProject(slug);
    await this.access.assertAccess(project, userId, userRole);

    const [locales, namespaces] = await Promise.all([
      this.localeRepo.findBy({ projectId: project.id }),
      this.namespaceRepo.findBy({ projectId: project.id }),
    ]);

    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      ownerId: project.ownerId,
      createdAt: project.createdAt,
      locales: locales.map((l) => ({ code: l.code, isDefault: l.isDefault })),
      namespaces: namespaces.map((ns) => ns.slug),
      autoTranslateEnabled: project.autoTranslateEnabled,
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

  async createLocale(
    projectSlug: string,
    code: string,
    isDefault = false,
    userId: string,
    userRole: UserRole,
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

    return this.localeRepo.save(
      this.localeRepo.create({ projectId: project.id, code, isDefault }),
    );
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

    await this.localeRepo.remove(locale);
  }

  async deleteNamespace(
    projectSlug: string,
    nsSlug: string,
    userId: string,
    userRole: UserRole,
  ): Promise<void> {
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertManageAccess(project, userId, userRole);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    await this.namespaceRepo.remove(ns);
  }
}
