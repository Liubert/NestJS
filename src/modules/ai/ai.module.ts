import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AiConfigController } from './ai-config.controller.js';
import { AiTranslateService } from './ai-translate.service.js';
import { AiConfigService } from './ai-config.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { AiConfigEntity } from '../translations/entities/ai-config.entity.js';
import { AiUsageLogEntity } from '../translations/entities/ai-usage-log.entity.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([AiConfigEntity, AiUsageLogEntity, ProjectEntity]),
  ],
  controllers: [AiConfigController],
  providers: [AiTranslateService, AiConfigService, AiUsageService],
  exports: [AiTranslateService, AiConfigService, AiUsageService],
})
export class AiModule {}
