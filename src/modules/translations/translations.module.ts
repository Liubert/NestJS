import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TranslationsController } from './translations.controller.js';
import { PublicTranslationsController } from './public-translations.controller.js';
import { TranslationsService } from './translations.service.js';
import { QualityWorkerModule } from './quality-worker.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { AiModule } from '../ai/ai.module.js';
import { SandboxModule } from '../sandbox/sandbox.module.js';
import { ProjectEntity } from './entities/project.entity.js';
import { NamespaceEntity } from './entities/namespace.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import { ProjectMemberEntity } from './entities/project-member.entity.js';
import { SandboxValueEntity } from './entities/sandbox-value.entity.js';
import { ProductionSnapshotEntity } from './entities/production-snapshot.entity.js';
import { WebhooksModule } from '../webhooks/webhooks.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      NamespaceEntity,
      LocaleEntity,
      TranslationKeyEntity,
      TranslationValueEntity,
      ProjectMemberEntity,
      SandboxValueEntity,
      ProductionSnapshotEntity,
    ]),
    forwardRef(() => WebhooksModule),
    QualityWorkerModule,
    ProjectsModule,
    AiModule,
    SandboxModule,
  ],
  controllers: [
    TranslationsController,
    // PublicTranslationsController MUST be last — its wildcard routes
    // would otherwise intercept /projects/:slug/webhooks etc.
    PublicTranslationsController,
  ],
  providers: [TranslationsService],
  exports: [TranslationsService],
})
export class TranslationsModule {}
