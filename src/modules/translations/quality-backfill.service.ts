import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import { QualityQueueService } from './quality-queue.service.js';

const BACKFILL_INTERVAL_MS = 30_000;
const BATCH_SIZE = 5;
const MAX_KEYS_PER_CYCLE = 50;

@Injectable()
export class QualityBackfillService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(QualityBackfillService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(TranslationValueEntity)
    private readonly valueRepo: Repository<TranslationValueEntity>,
    private readonly dataSource: DataSource,
    private readonly qualityQueue: QualityQueueService,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.backfill();
    }, BACKFILL_INTERVAL_MS);
    this.logger.log('Quality backfill scheduler started');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async backfill(): Promise<void> {
    try {
      // Find distinct (project_id, key_id) pairs where any locale is not_checked or failed
      const rows = await this.dataSource.query<
        { project_id: string; key_id: string }[]
      >(
        `SELECT DISTINCT ns.project_id, tv.key_id
         FROM translation_values tv
         JOIN translation_keys tk ON tk.id = tv.key_id
         JOIN translation_namespaces ns ON ns.id = tk.namespace_id
         WHERE tv.quality_review_state IN ('not_checked', 'failed')
           AND tv.value IS NOT NULL
         LIMIT $1`,
        [MAX_KEYS_PER_CYCLE],
      );

      if (!rows.length) return;

      // Group by project
      const byProject = new Map<string, string[]>();
      for (const row of rows) {
        if (!byProject.has(row.project_id)) byProject.set(row.project_id, []);
        byProject.get(row.project_id)!.push(row.key_id);
      }

      let totalQueued = 0;
      let totalBatches = 0;

      for (const [projectId, projectKeyIds] of byProject) {
        // Mark as queued (only rows currently not_checked or failed)
        await this.valueRepo
          .createQueryBuilder()
          .update()
          .set({ qualityReviewState: 'queued' })
          .where(
            'key_id IN (:...keyIds) AND quality_review_state IN (:...states)',
            { keyIds: projectKeyIds, states: ['not_checked', 'failed'] },
          )
          .execute();

        // Publish in batches of BATCH_SIZE
        for (let i = 0; i < projectKeyIds.length; i += BATCH_SIZE) {
          const batch = projectKeyIds.slice(i, i + BATCH_SIZE);
          await this.qualityQueue.publishBatch(projectId, batch);
          totalBatches++;
        }

        totalQueued += projectKeyIds.length;
      }

      this.logger.log(
        `Backfill: queued ${totalQueued} keys across ${totalBatches} batches`,
      );
    } catch (e: unknown) {
      this.logger.error(
        `Backfill error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
