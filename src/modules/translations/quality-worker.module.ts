import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module.js';
import { SandboxValueEntity } from './entities/sandbox-value.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { ProjectEntity } from './entities/project.entity.js';
import { QualityWorkerService } from './quality-worker.service.js';
import { AutoTranslateWorkerService } from './auto-translate-worker.service.js';

@Module({
  imports: [
    AiModule,
    TypeOrmModule.forFeature([
      SandboxValueEntity,
      TranslationKeyEntity,
      LocaleEntity,
      ProjectEntity,
    ]),
  ],
  providers: [QualityWorkerService, AutoTranslateWorkerService],
  exports: [QualityWorkerService, AutoTranslateWorkerService],
})
export class QualityWorkerModule {}
