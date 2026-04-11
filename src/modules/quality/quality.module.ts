import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { SandboxValueEntity } from '../translations/entities/sandbox-value.entity.js';
import { TranslationKeyEntity } from '../translations/entities/translation-key.entity.js';
import { TranslationValueEntity } from '../translations/entities/translation-value.entity.js';
import { LocaleEntity } from '../translations/entities/locale.entity.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { QualityWorkerService } from './quality-worker.service.js';
import { AutoTranslateWorkerService } from './auto-translate-worker.service.js';
import { TranslationQualityService } from './translation-quality.service.js';

@Module({
  imports: [
    AiModule,
    ProjectsModule,
    TypeOrmModule.forFeature([
      SandboxValueEntity,
      TranslationKeyEntity,
      TranslationValueEntity,
      LocaleEntity,
      ProjectEntity,
    ]),
  ],
  providers: [
    QualityWorkerService,
    AutoTranslateWorkerService,
    TranslationQualityService,
  ],
  exports: [
    QualityWorkerService,
    AutoTranslateWorkerService,
    TranslationQualityService,
  ],
})
export class QualityWorkerModule {}
