import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { hashSha256 } from '../../common/utils/hash.util.js';
import { ProjectAccessHelper } from './helpers/project-access.helper.js';
import {
  expectedQualityFields,
  resetQualityFields,
  checkedQualityFields,
} from './helpers/quality-state.helper.js';
import {
  QUALITY_MODE_LANGUAGE,
  QUALITY_MODE_TRANSLATION,
} from './constants/quality.const.js';
import { TranslationValueEntity } from './entities/translation-value.entity.js';
import { LocaleEntity } from './entities/locale.entity.js';
import { AiTranslateService } from './ai-translate.service.js';
import { UserRole } from '../users/types/user-role.enum.js';
import type { QualityInfo } from './types/entry.types.js';

@Injectable()
export class TranslationQualityService {
  constructor(
    @InjectRepository(TranslationValueEntity)
    private readonly valueRepo: Repository<TranslationValueEntity>,
    @InjectRepository(LocaleEntity)
    private readonly localeRepo: Repository<LocaleEntity>,
    private readonly aiTranslateService: AiTranslateService,
    private readonly access: ProjectAccessHelper,
  ) {}

  async resetQualityStateIfChanged(
    keyId: string,
    localeId: string,
    value: string,
  ): Promise<void> {
    const hash = hashSha256(value);
    await this.valueRepo
      .createQueryBuilder()
      .update()
      .set({
        ...resetQualityFields(),
        qualityContentHash: hash,
      })
      .where(
        'key_id = :keyId AND locale_id = :localeId AND quality_review_state != :expectedState AND (quality_content_hash IS NULL OR quality_content_hash != :hash)',
        { keyId, localeId, hash, expectedState: 'expected' },
      )
      .execute();
  }

  async persistQualityResult(
    keyId: string,
    localeId: string,
    result: {
      score: number;
      level: 'green' | 'yellow' | 'red';
      comment: string;
    },
  ): Promise<void> {
    await this.valueRepo.update(
      { keyId, localeId },
      checkedQualityFields(result),
    );
  }

  async runQualityCheck(
    projectSlug: string,
    nsSlug: string,
    key: string,
    userId: string,
    userRole: UserRole,
  ): Promise<Record<string, QualityInfo | null>> {
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, userRole);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    const keyEntity = await this.access.requireKey(ns.id, key);

    const locales = await this.localeRepo.findBy({ projectId: project.id });
    const defaultLocale = locales.find((l) => l.isDefault);

    let source: string | undefined;
    if (defaultLocale) {
      const sourceValue = await this.valueRepo.findOne({
        where: { keyId: keyEntity.id, localeId: defaultLocale.id },
      });
      source = sourceValue?.value ?? undefined;
    }

    const results: Record<string, QualityInfo | null> = {};

    await Promise.allSettled(
      locales.map(async (locale) => {
        const valueEntity = await this.valueRepo.findOne({
          where: { keyId: keyEntity.id, localeId: locale.id },
        });
        // Skip expected (manually accepted) translations
        if (valueEntity?.qualityReviewState === 'expected') {
          results[locale.code] = {
            reviewState: 'expected',
            score: 100,
            level: 'expected',
            comment: null,
            checkedAt: valueEntity.qualityCheckedAt?.toISOString() ?? null,
          };
          return;
        }
        const translation = valueEntity?.value;
        if (!translation) {
          results[locale.code] = null;
          return;
        }
        try {
          // Default locale has no source to compare against — check language quality only
          const mode = locale.isDefault
            ? QUALITY_MODE_LANGUAGE
            : source
              ? QUALITY_MODE_TRANSLATION
              : QUALITY_MODE_LANGUAGE;
          const result = await this.aiTranslateService.checkQuality(
            locale.isDefault ? translation : (source ?? translation),
            translation,
            locale.code,
            mode,
            project.id,
          );
          await this.persistQualityResult(keyEntity.id, locale.id, result);
          results[locale.code] = {
            reviewState: 'checked',
            score: result.score,
            level: result.level,
            comment: result.comment,
            checkedAt: new Date().toISOString(),
          };
        } catch {
          results[locale.code] = null;
        }
      }),
    );

    return results;
  }

  async markAsExpected(
    projectSlug: string,
    nsSlug: string,
    key: string,
    localeCode: string,
    userId: string,
    userRole: UserRole,
  ): Promise<QualityInfo> {
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, userRole);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    const keyEntity = await this.access.requireKey(ns.id, key);

    const locale = await this.access.requireLocale(project.id, localeCode);

    const valueEntity = await this.valueRepo.findOne({
      where: { keyId: keyEntity.id, localeId: locale.id },
    });
    if (!valueEntity || !valueEntity.value) {
      throw new BadRequestException(
        `No value to mark as expected for ${localeCode}`,
      );
    }

    const hash = hashSha256(valueEntity.value);
    const fields = expectedQualityFields();
    await this.valueRepo.update(
      { keyId: keyEntity.id, localeId: locale.id },
      { ...fields, qualityContentHash: hash },
    );

    return {
      reviewState: 'expected',
      score: 100,
      level: 'expected',
      comment: null,
      checkedAt: fields.qualityCheckedAt!.toISOString(),
    };
  }

  async unmarkExpected(
    projectSlug: string,
    nsSlug: string,
    key: string,
    localeCode: string,
    userId: string,
    userRole: UserRole,
  ): Promise<QualityInfo> {
    const project = await this.access.requireProject(projectSlug);
    await this.access.assertAccess(project, userId, userRole);

    const ns = await this.access.requireNamespace(project.id, nsSlug);

    const keyEntity = await this.access.requireKey(ns.id, key);

    const locale = await this.access.requireLocale(project.id, localeCode);

    await this.valueRepo.update(
      { keyId: keyEntity.id, localeId: locale.id },
      { ...resetQualityFields(), qualityContentHash: null },
    );

    return {
      reviewState: 'not_checked',
      score: null,
      level: null,
      comment: null,
      checkedAt: null,
    };
  }
}
