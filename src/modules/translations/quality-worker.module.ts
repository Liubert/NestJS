import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { NamespaceEntity } from './entities/namespace.entity.js';
import { ProjectEntity } from './entities/project.entity.js';
import { ProjectMemberEntity } from './entities/project-member.entity.js';
import { SandboxValueEntity } from './entities/sandbox-value.entity.js';
import { ProductionSnapshotEntity } from './entities/production-snapshot.entity.js';
import { AiConfigEntity } from './entities/ai-config.entity.js';
import { UserEntity } from '../users/user.entity.js';
import { QualityQueueService } from './quality-queue.service.js';
import { QualityWorkerService } from './quality-worker.service.js';
import { QualityBackfillService } from './quality-backfill.service.js';
import { AiTranslateService } from './ai-translate.service.js';
import { AiConfigService } from './ai-config.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { AiUsageLogEntity } from './entities/ai-usage-log.entity.js';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      TranslationValueEntity,
      TranslationKeyEntity,
      LocaleEntity,
      NamespaceEntity,
      ProjectEntity,
      ProjectMemberEntity,
      SandboxValueEntity,
      ProductionSnapshotEntity,
      AiConfigEntity,
      AiUsageLogEntity,
      UserEntity,
    ]),
  ],
  providers: [
    QualityQueueService,
    QualityWorkerService,
    QualityBackfillService,
    AiTranslateService,
    AiConfigService,
    AiUsageService,
  ],
})
export class QualityWorkerModule {}
