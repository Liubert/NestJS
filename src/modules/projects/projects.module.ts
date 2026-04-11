import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { ProjectAccessHelper } from './helpers/project-access.helper.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { NamespaceEntity } from '../translations/entities/namespace.entity.js';
import { LocaleEntity } from '../translations/entities/locale.entity.js';
import { TranslationKeyEntity } from '../translations/entities/translation-key.entity.js';
import { ProjectMemberEntity } from '../translations/entities/project-member.entity.js';
import { UserEntity } from '../users/user.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      NamespaceEntity,
      LocaleEntity,
      TranslationKeyEntity,
      ProjectMemberEntity,
      UserEntity,
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectAccessHelper, ProjectsService],
  exports: [ProjectAccessHelper, ProjectsService],
})
export class ProjectsModule {}
