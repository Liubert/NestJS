import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectEntity } from '../../translations/entities/project.entity.js';
import { NamespaceEntity } from '../../translations/entities/namespace.entity.js';
import { LocaleEntity } from '../../translations/entities/locale.entity.js';
import { TranslationKeyEntity } from '../../translations/entities/translation-key.entity.js';
import { ProjectMemberEntity } from '../../translations/entities/project-member.entity.js';
import { UserRole } from '../../users/types/user-role.enum.js';

@Injectable()
export class ProjectAccessHelper {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(NamespaceEntity)
    private readonly namespaceRepo: Repository<NamespaceEntity>,
    @InjectRepository(LocaleEntity)
    private readonly localeRepo: Repository<LocaleEntity>,
    @InjectRepository(TranslationKeyEntity)
    private readonly keyRepo: Repository<TranslationKeyEntity>,
    @InjectRepository(ProjectMemberEntity)
    private readonly memberRepo: Repository<ProjectMemberEntity>,
  ) {}

  isAdmin(role: UserRole): boolean {
    return role === UserRole.ADMIN;
  }

  async requireProject(slug: string): Promise<ProjectEntity> {
    const project = await this.projectRepo.findOne({ where: { slug } });
    if (!project) throw new NotFoundException(`Project "${slug}" not found`);
    return project;
  }

  async requireInitializedProject(slug: string): Promise<ProjectEntity> {
    const project = await this.requireProject(slug);
    this.assertSandboxInitialized(project);
    return project;
  }

  assertSandboxInitialized(project: ProjectEntity): void {
    if (!project.sandboxInitializedAt) {
      throw new BadRequestException('Sandbox is not initialized');
    }
  }

  async assertAccess(
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

  async assertManageAccess(
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

  assertOwnerOrAdmin(
    project: ProjectEntity,
    userId: string,
    role: UserRole,
    action: string,
  ): void {
    if (!this.isAdmin(role) && project.ownerId !== userId) {
      throw new ForbiddenException(
        `Only the project owner or admin can ${action}`,
      );
    }
  }

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

  async requireKey(
    namespaceId: string,
    key: string,
  ): Promise<TranslationKeyEntity> {
    const keyEntity = await this.keyRepo.findOne({
      where: { namespaceId, key },
    });
    if (!keyEntity) throw new NotFoundException(`Key "${key}" not found`);
    return keyEntity;
  }

  async requireLocale(projectId: string, code: string): Promise<LocaleEntity> {
    const locale = await this.localeRepo.findOne({
      where: { projectId, code },
    });
    if (!locale) throw new NotFoundException(`Locale "${code}" not found`);
    return locale;
  }
}
