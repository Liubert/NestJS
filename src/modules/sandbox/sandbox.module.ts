import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SandboxService } from './sandbox.service.js';
import { SandboxController } from './sandbox.controller.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { ProductionModule } from '../production/production.module.js';
import { QualityModule } from '../quality/quality.module.js';
import { AiModule } from '../ai/ai.module.js';
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
    ProductionModule,
    QualityModule,
    AiModule,
  ],
  controllers: [SandboxController],
  providers: [SandboxService],
  exports: [SandboxService],
})
export class SandboxModule {}
