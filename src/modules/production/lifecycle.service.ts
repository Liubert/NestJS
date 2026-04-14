import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProjectAccessHelper } from '../projects/helpers/project-access.helper.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { SandboxValueEntity } from '../translations/entities/sandbox-value.entity.js';
import { ProductionSnapshotEntity } from '../translations/entities/production-snapshot.entity.js';
import { UserRole } from '../users/types/user-role.enum.js';

@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepo: Repository<ProjectEntity>,
    @InjectRepository(SandboxValueEntity)
    private readonly sandboxRepo: Repository<SandboxValueEntity>,
    @InjectRepository(ProductionSnapshotEntity)
    private readonly snapshotRepo: Repository<ProductionSnapshotEntity>,
    private readonly dataSource: DataSource,
    private readonly access: ProjectAccessHelper,
  ) {}

  // ─── Get sandbox status ───────────────────────────────────────────────────

  async getSandboxStatus(projectSlug: string): Promise<{
    hasChanges: boolean;
    snapshotCount: number;
  }> {
    const project = await this.access.requireProject(projectSlug);
    const snapshotCount = await this.snapshotRepo.count({
      where: { projectId: project.id },
    });

    return {
      hasChanges: project.sandboxHasChanges,
      snapshotCount,
    };
  }

  // ─── Reset sandbox ────────────────────────────────────────────────────────

  /**
   * Discards all sandbox changes and re-copies from current production
   * (including quality data, context fields).
   */
  async resetSandbox(
    projectSlug: string,
    userId: string,
    role: UserRole,
  ): Promise<{ copiedRows: number }> {
    const project = await this.access.requireProject(projectSlug);

    this.access.assertOwnerOrAdmin(project, userId, role, 'reset sandbox');

    return this.dataSource.transaction(async (manager) => {
      await manager.delete(SandboxValueEntity, { projectId: project.id });

      let copiedRows = 0;
      try {
        const result = await manager.query<{ id: string }[]>(
          `
          INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at,
            context, context_need, context_reason,
            quality_score, quality_level, quality_comment, quality_checked_at, quality_review_state, quality_content_hash)
          SELECT
            ns.project_id, tv.key_id, tv.locale_id, tv.value, false, now(),
            tk.context, tk.context_need, tk.context_reason,
            tv.quality_score, tv.quality_level, tv.quality_comment, tv.quality_checked_at, tv.quality_review_state, tv.quality_content_hash
          FROM translation_values tv
          JOIN translation_keys tk ON tk.id = tv.key_id
          JOIN translation_namespaces ns ON ns.id = tk.namespace_id
          WHERE ns.project_id = $1
          RETURNING id
          `,
          [project.id],
        );
        copiedRows = Array.isArray(result) ? result.length : 0;
      } catch (err) {
        this.logger.error(
          `resetSandbox SQL failed for project ${projectSlug}: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
        throw err;
      }

      await manager.update(ProjectEntity, project.id, {
        sandboxHasChanges: false,
      });

      return { copiedRows };
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

  // ─── Auto-translate toggle ────────────────────────────────────────────────

  async updateAutoTranslate(
    slug: string,
    enabled: boolean,
    userId: string,
    role: UserRole,
  ): Promise<{ autoTranslateEnabled: boolean }> {
    const project = await this.access.requireProject(slug);
    this.access.assertOwnerOrAdmin(
      project,
      userId,
      role,
      'update auto-translate',
    );
    project.autoTranslateEnabled = enabled;
    await this.projectRepo.save(project);
    return { autoTranslateEnabled: enabled };
  }
}
