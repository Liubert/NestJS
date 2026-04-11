import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { SandboxValueEntity } from './entities/sandbox-value.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { ProjectEntity } from './entities/project.entity.js';
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
