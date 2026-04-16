import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { SseModule } from '../sse/sse.module.js';
import { SandboxValueEntity } from '../translations/entities/sandbox-value.entity.js';
import { TranslationKeyEntity } from '../translations/entities/translation-key.entity.js';
import { TranslationValueEntity } from '../translations/entities/translation-value.entity.js';
import { LocaleEntity } from '../translations/entities/locale.entity.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { AutoTranslateWorkerService } from './auto-translate-worker.service.js';
import { TranslationQualityService } from './translation-quality.service.js';

/**
 * Core quality module for API process.
 * Contains TranslationQualityService (sync API quality checks)
 * and AutoTranslateWorkerService (still used by sandbox triggers — to be decoupled later).
 *
 * QualityWorkerService is NOT here — it runs only in the standalone worker process.
 */
@Module({
  imports: [
    AiModule,
    ProjectsModule,
    SseModule,
    TypeOrmModule.forFeature([
      SandboxValueEntity,
      TranslationKeyEntity,
      TranslationValueEntity,
      LocaleEntity,
      ProjectEntity,
    ]),
  ],
  providers: [AutoTranslateWorkerService, TranslationQualityService],
  exports: [AutoTranslateWorkerService, TranslationQualityService],
})
export class QualityModule {}
