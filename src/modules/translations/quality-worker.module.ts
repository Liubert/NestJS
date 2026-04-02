import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { AiConfigEntity } from './entities/ai-config.entity.js';
import { AiUsageLogEntity } from './entities/ai-usage-log.entity.js';
import { QualityWorkerService } from './quality-worker.service.js';
import { AiTranslateService } from './ai-translate.service.js';
import { AiConfigService } from './ai-config.service.js';
import { AiUsageService } from './ai-usage.service.js';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      TranslationValueEntity,
      TranslationKeyEntity,
      LocaleEntity,
      AiConfigEntity,
      AiUsageLogEntity,
    ]),
  ],
  providers: [
    QualityWorkerService,
    AiTranslateService,
    AiConfigService,
    AiUsageService,
  ],
})
export class QualityWorkerModule {}
