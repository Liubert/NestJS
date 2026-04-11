import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TranslationsController } from './translations.controller.js';
import { PublicTranslationsController } from './public-translations.controller.js';
import { TranslationsService } from './translations.service.js';
import { AiTranslateService } from './ai-translate.service.js';
import { AiConfigService } from './ai-config.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { AiConfigController } from './ai-config.controller.js';
import { SandboxService } from './sandbox.service.js';
import { SandboxPromotionService } from './sandbox-promotion.service.js';
import { SandboxLifecycleService } from './sandbox-lifecycle.service.js';
import { SandboxController } from './sandbox.controller.js';
import { ProjectAccessHelper } from './helpers/project-access.helper.js';
import { TranslationProjectsService } from './translation-projects.service.js';
import { TranslationQualityService } from './translation-quality.service.js';
import { QualityWorkerModule } from './quality-worker.module.js';
import { ProjectEntity } from './entities/project.entity.js';
import { NamespaceEntity } from './entities/namespace.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import { ProjectMemberEntity } from './entities/project-member.entity.js';
import { SandboxValueEntity } from './entities/sandbox-value.entity.js';
import { ProductionSnapshotEntity } from './entities/production-snapshot.entity.js';
import { AiConfigEntity } from './entities/ai-config.entity.js';
import { AiUsageLogEntity } from './entities/ai-usage-log.entity.js';
import { UserEntity } from '../users/user.entity.js';
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
      AiConfigEntity,
      AiUsageLogEntity,
      UserEntity,
    ]),
    forwardRef(() => WebhooksModule),
    QualityWorkerModule,
  ],
  controllers: [
    TranslationsController,
    SandboxController,
    AiConfigController,
    // PublicTranslationsController MUST be last — its wildcard routes
    // would otherwise intercept /projects/:slug/webhooks etc.
    PublicTranslationsController,
  ],
  providers: [
    ProjectAccessHelper,
    TranslationProjectsService,
    TranslationQualityService,
    TranslationsService,
    AiTranslateService,
    AiConfigService,
    AiUsageService,
    SandboxService,
    SandboxPromotionService,
    SandboxLifecycleService,
  ],
  exports: [
    ProjectAccessHelper,
    TranslationsService,
    SandboxService,
    SandboxPromotionService,
    SandboxLifecycleService,
    AiConfigService,
    AiUsageService,
  ],
})
export class TranslationsModule {}
