import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProjectAccessHelper } from './helpers/project-access.helper.js';
import { ProjectEntity } from './entities/project.entity.js';
import { SandboxValueEntity } from './entities/sandbox-value.entity.js';
import { ProductionSnapshotEntity } from './entities/production-snapshot.entity.js';
import { UserRole } from '../users/types/user-role.enum.js';

@Injectable()
export class SandboxLifecycleService {
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

  // ─── Initialize sandbox ───────────────────────────────────────────────────

  /**
   * Copies all current production values into sandbox_values.
   * Safe to call multiple times — existing sandbox rows are preserved (ON CONFLICT DO NOTHING).
   * Call explicitly to reset: pass force=true to wipe and re-copy.
   */
  async initSandbox(
    projectSlug: string,
    userId: string,
    role: UserRole,
    force = false,
  ): Promise<{ initialized: boolean; copiedRows: number }> {
    const project = await this.access.requireProject(projectSlug);

    if (force) {
      await this.sandboxRepo.delete({ projectId: project.id });
    } else if (project.sandboxInitializedAt) {
      return { initialized: false, copiedRows: 0 };
    }

    // Copy all production values for this project into sandbox
    const result = await this.dataSource.query<{ count: string }[]>(
      `
      INSERT INTO sandbox_values (project_id, key_id, locale_id, value, is_deleted, updated_at)
      SELECT
        ns.project_id,
        tv.key_id,
        tv.locale_id,
        tv.value,
        false,
        now()
      FROM translation_values tv
      JOIN translation_keys tk ON tk.id = tv.key_id
      JOIN translation_namespaces ns ON ns.id = tk.namespace_id
      WHERE ns.project_id = $1
      ON CONFLICT (project_id, key_id, locale_id) DO NOTHING
      RETURNING id
    `,
      [project.id],
    );

    const copiedRows = Array.isArray(result) ? result.length : 0;

    await this.projectRepo.update(project.id, {
      sandboxInitializedAt: new Date(),
      sandboxHasChanges: false,
    });

    return { initialized: true, copiedRows };
  }

  // ─── Get sandbox status ───────────────────────────────────────────────────

  async getSandboxStatus(projectSlug: string): Promise<{
    initialized: boolean;
    initializedAt: Date | null;
    hasChanges: boolean;
    snapshotCount: number;
  }> {
    const project = await this.access.requireProject(projectSlug);
    const snapshotCount = await this.snapshotRepo.count({
      where: { projectId: project.id },
    });

    return {
      initialized: !!project.sandboxInitializedAt,
      initializedAt: project.sandboxInitializedAt,
      hasChanges: project.sandboxHasChanges,
      snapshotCount,
    };
  }

  // ─── Reset sandbox ────────────────────────────────────────────────────────

  /**
   * Discards all sandbox changes and re-copies from current production.
   */
  async resetSandbox(
    projectSlug: string,
    userId: string,
    role: UserRole,
  ): Promise<{ copiedRows: number }> {
    const project = await this.access.requireProject(projectSlug);

    this.access.assertOwnerOrAdmin(project, userId, role, 'reset sandbox');

    const result = await this.initSandbox(projectSlug, userId, role, true);
    return { copiedRows: result.copiedRows };
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
  ): Promise<{ autoTranslateEnabled: boolean }> {
    const project = await this.projectRepo.findOneBy({ slug });
    if (!project) throw new NotFoundException('Project not found');
    project.autoTranslateEnabled = enabled;
    await this.projectRepo.save(project);
    return { autoTranslateEnabled: enabled };
  }
}
