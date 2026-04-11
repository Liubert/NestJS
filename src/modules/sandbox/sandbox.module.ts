import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SandboxService } from './sandbox.service.js';
import { SandboxPromotionService } from './sandbox-promotion.service.js';
import { SandboxLifecycleService } from './sandbox-lifecycle.service.js';
import { SandboxController } from './sandbox.controller.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { QualityWorkerModule } from '../translations/quality-worker.module.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { NamespaceEntity } from '../translations/entities/namespace.entity.js';
import { LocaleEntity } from '../translations/entities/locale.entity.js';
import { TranslationKeyEntity } from '../translations/entities/translation-key.entity.js';
import { TranslationValueEntity } from '../translations/entities/translation-value.entity.js';
import { SandboxValueEntity } from '../translations/entities/sandbox-value.entity.js';
import { ProductionSnapshotEntity } from '../translations/entities/production-snapshot.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      NamespaceEntity,
      LocaleEntity,
      TranslationKeyEntity,
      TranslationValueEntity,
      SandboxValueEntity,
      ProductionSnapshotEntity,
    ]),
    ProjectsModule,
    QualityWorkerModule,
  ],
  controllers: [SandboxController],
  providers: [SandboxService, SandboxPromotionService, SandboxLifecycleService],
  exports: [SandboxService, SandboxPromotionService, SandboxLifecycleService],
})
export class SandboxModule {}
