import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PromotionService } from './promotion.service.js';
import { LifecycleService } from './lifecycle.service.js';
import { ProductionController } from './production.controller.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { ProjectEntity } from '../translations/entities/project.entity.js';
import { NamespaceEntity } from '../translations/entities/namespace.entity.js';
import { LocaleEntity } from '../translations/entities/locale.entity.js';
import { TranslationKeyEntity } from '../translations/entities/translation-key.entity.js';
import { TranslationValueEntity } from '../translations/entities/translation-value.entity.js';
import { SandboxValueEntity } from '../translations/entities/sandbox-value.entity.js';
import { ProductionSnapshotEntity } from '../translations/entities/production-snapshot.entity.js';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      NamespaceEntity,
      LocaleEntity,
      TranslationKeyEntity,
      TranslationValueEntity,
      SandboxValueEntity,
      ProductionSnapshotEntity,
    ]),
    ProjectsModule,
  ],
  controllers: [ProductionController],
  providers: [PromotionService, LifecycleService],
  exports: [PromotionService, LifecycleService],
})
export class ProductionModule {}
