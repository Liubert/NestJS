import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TranslationsController } from './translations.controller.js';
import { TranslationsService } from './translations.service.js';
import { AiTranslateService } from './ai-translate.service.js';
import { ProjectEntity } from './entities/project.entity.js';
import { NamespaceEntity } from './entities/namespace.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { TranslationKeyEntity } from './entities/translation-key.entity.js';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import { ProjectMemberEntity } from './entities/project-member.entity.js';
import { UserEntity } from '../users/user.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      NamespaceEntity,
      LocaleEntity,
      TranslationKeyEntity,
      TranslationValueEntity,
      ProjectMemberEntity,
      UserEntity,
    ]),
  ],
  controllers: [TranslationsController],
  providers: [TranslationsService, AiTranslateService],
  exports: [TranslationsService],
})
export class TranslationsModule {}
