import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';
import { TranslationsService } from './translations.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { AiTranslateService } from '../ai/ai-translate.service.js';
import { AiUsageService } from '../ai/ai-usage.service.js';
import { SandboxService } from './sandbox.service.js';
import { QualityWorkerService } from './quality-worker.service.js';
import { AiTranslateDto } from '../ai/dto/ai-translate.dto.js';
import { BulkAiTranslateDto } from '../ai/dto/bulk-ai-translate.dto.js';
import { BulkTranslateAndSaveDto } from '../ai/dto/bulk-translate-and-save.dto.js';
import { CheckQualityDto } from '../ai/dto/check-quality.dto.js';
import { ImportTranslationsDto } from './dto/import-translations.dto.js';
import { ListEntriesQueryDto } from './dto/list-entries-query.dto.js';
import { BulkQualityCheckAiDto } from '../ai/dto/bulk-quality-check-ai.dto.js';
import { PreviewPromptDto } from '../ai/dto/preview-prompt.dto.js';
import { RetranslateDto } from './dto/retranslate.dto.js';

@ApiTags('translations')
@Controller('translations')
export class TranslationsController {
  constructor(
    private readonly translationsService: TranslationsService,
    private readonly projectsService: ProjectsService,
    private readonly aiTranslateService: AiTranslateService,
    private readonly aiUsageService: AiUsageService,
    private readonly sandboxService: SandboxService,
    private readonly qualityWorkerService: QualityWorkerService,
  ) {}

  // ─── AI Usage (must be before wildcard routes) ────────────────────────────

  @Get('projects/:slug/ai-usage')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI token usage for a project' })
  async getAiUsage(
    @Param('slug') slug: string,
    @CurrentUser() _user: CurrentUserType,
  ) {
    const project = await this.projectsService.getProjectBySlug(slug);
    return this.aiUsageService.getProjectUsage(project.id);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import translations from a ZIP file' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'projectSlug'],
      properties: {
        file: { type: 'string', format: 'binary' },
        projectSlug: { type: 'string' },
        projectName: { type: 'string' },
      },
    },
  })
  async importTranslations(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportTranslationsDto,
  ) {
    if (!file) return { error: 'No file uploaded' };
    return this.translationsService.importFromZip(file.buffer, dto);
  }

  // ─── AI (protected) ───────────────────────────────────────────────────────

  @Post('ai-translate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'AI-generate translations' })
  async aiTranslate(@Body() dto: AiTranslateDto): Promise<{
    translations: Record<string, string>;
    contextNeed: string;
    contextReason: string | null;
  }> {
    let projectId: string | undefined;
    let localeGuidance: Record<string, string> | undefined;
    if (dto.projectSlug) {
      const project = await this.projectsService.getProjectBySlug(
        dto.projectSlug,
      );
      projectId = project.id;
      const locales = await this.projectsService.getProjectLocales(
        dto.projectSlug,
      );
      const guidance = locales.reduce<Record<string, string>>((acc, l) => {
        if (l.localeSkill) acc[l.code] = l.localeSkill;
        return acc;
      }, {});
      if (Object.keys(guidance).length) localeGuidance = guidance;
    }
    return this.aiTranslateService.translate(
      dto.text,
      projectId,
      dto.context,
      dto.targetLocales,
      localeGuidance,
    );
  }

  @Post('ai-translate/bulk')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk AI-translate multiple keys' })
  async bulkAiTranslate(
    @Body() dto: BulkAiTranslateDto,
  ): Promise<Record<string, Record<string, string>>> {
    let projectId: string | undefined;
    let localeGuidance: Record<string, string> | undefined;
    let targetLocales: string[] | undefined = dto.targetLocales;

    if (dto.projectSlug) {
      const project = await this.projectsService.getProjectBySlug(
        dto.projectSlug,
      );
      projectId = project.id;
      const locales = await this.projectsService.getProjectLocales(
        dto.projectSlug,
      );
      const guidance = locales.reduce<Record<string, string>>((acc, l) => {
        if (l.localeSkill) acc[l.code] = l.localeSkill;
        return acc;
      }, {});
      if (Object.keys(guidance).length) localeGuidance = guidance;

      if (dto.targetLocales && dto.targetLocales.length > 0) {
        const projectLocaleCodes = new Set(
          locales.filter((l) => !l.isDefault).map((l) => l.code),
        );
        targetLocales = dto.targetLocales.filter((code) =>
          projectLocaleCodes.has(code),
        );
      } else if (!dto.targetLocales) {
        targetLocales = locales.filter((l) => !l.isDefault).map((l) => l.code);
      }
    }

    const entriesWithLocales = dto.entries.map((e) => ({
      ...e,
      targetLocales,
    }));
    const { results } = await this.aiTranslateService.bulkTranslate(
      entriesWithLocales,
      projectId,
      localeGuidance,
    );
    return results;
  }

  @Post('ai-translate/bulk-and-save')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Translate multiple keys, save to sandbox, and optionally run quality check — all in one step',
  })
  async bulkTranslateAndSave(@Body() dto: BulkTranslateAndSaveDto) {
    const project = await this.projectsService.getProjectBySlug(
      dto.projectSlug,
    );
    const namespace = await this.projectsService.requireNamespace(
      project.id,
      dto.namespace,
    );

    const locales = await this.projectsService.getProjectLocales(
      dto.projectSlug,
    );
    const localeGuidance = locales.reduce<Record<string, string>>((acc, l) => {
      if (l.localeSkill) acc[l.code] = l.localeSkill;
      return acc;
    }, {});
    const guidanceParam = Object.keys(localeGuidance).length
      ? localeGuidance
      : undefined;

    let targetLocales: string[] | undefined = dto.targetLocales;
    if (dto.targetLocales && dto.targetLocales.length > 0) {
      const projectLocaleCodes = new Set(
        locales.filter((l) => !l.isDefault).map((l) => l.code),
      );
      targetLocales = dto.targetLocales.filter((code) =>
        projectLocaleCodes.has(code),
      );
    } else if (!dto.targetLocales) {
      targetLocales = locales.filter((l) => !l.isDefault).map((l) => l.code);
    }

    const commentMap = await this.sandboxService.getQualityCommentsForKeys(
      project.id,
      namespace.id,
      dto.entries.map((e) => e.key),
    );

    const entriesWithLocales = dto.entries.map((e) => ({
      ...e,
      targetLocales,
      previousComment: commentMap.get(e.key) ?? undefined,
    }));
    const { results: translations } =
      await this.aiTranslateService.bulkTranslate(
        entriesWithLocales,
        project.id,
        guidanceParam,
      );

    const sandboxEntries = dto.entries
      .filter((e) => translations[e.key])
      .map((e) => ({
        key: e.key,
        values: translations[e.key],
        context: e.context,
      }));

    const saved = await this.sandboxService.bulkUpsert(
      project,
      namespace,
      sandboxEntries,
    );

    if (dto.skipQuality === true) {
      void this.qualityWorkerService.triggerNow();
      return {
        translations,
        saved,
        qualityStatus: 'queued' as const,
      };
    }

    const qualityItems = dto.entries
      .filter((e) => translations[e.key])
      .map((e) => ({
        key: e.key,
        source: e.text,
        context: e.context ?? null,
        translations: translations[e.key],
      }));

    const qualityResult = await this.aiTranslateService.bulkCheckQuality(
      qualityItems,
      5,
      15_000,
      project.id,
      guidanceParam,
    );

    await this.sandboxService.persistQualityResults(
      project.id,
      dto.namespace,
      qualityResult.results,
    );

    return {
      translations,
      quality: qualityResult.results,
      saved,
    };
  }

  @Post('ai-quality-check')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check translation quality using AI' })
  async checkQuality(@Body() dto: CheckQualityDto) {
    let projectId: string | undefined;
    let localeGuidanceStr: string | undefined;
    if (dto.projectSlug) {
      const project = await this.projectsService.getProjectBySlug(
        dto.projectSlug,
      );
      projectId = project.id;
      const locales = await this.projectsService.getProjectLocales(
        dto.projectSlug,
      );
      const matched = locales.find(
        (l) => l.code === dto.locale && l.localeSkill,
      );
      if (matched) localeGuidanceStr = matched.localeSkill!;
    }
    return this.aiTranslateService.checkQuality(
      dto.source,
      dto.translation,
      dto.locale,
      dto.mode,
      projectId,
      dto.context,
      localeGuidanceStr,
    );
  }

  @Post('ai-quality-check/bulk')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bulk AI quality check for multiple locales' })
  async bulkCheckQualityAi(
    @Body() dto: BulkQualityCheckAiDto,
  ): Promise<
    Record<string, { score: number; level: string; comment: string }>
  > {
    let projectId: string | undefined;
    let localeGuidance: Record<string, string> | undefined;
    if (dto.projectSlug) {
      const project = await this.projectsService.getProjectBySlug(
        dto.projectSlug,
      );
      projectId = project.id;
      const locales = await this.projectsService.getProjectLocales(
        dto.projectSlug,
      );
      const guidance = locales.reduce<Record<string, string>>((acc, l) => {
        if (l.localeSkill) acc[l.code] = l.localeSkill;
        return acc;
      }, {});
      if (Object.keys(guidance).length) localeGuidance = guidance;
    }
    const items = [
      {
        key: 'input',
        source: dto.source,
        context: dto.context ?? null,
        translations: dto.translations,
      },
    ];
    const bulkResult = await this.aiTranslateService.bulkCheckQuality(
      items,
      undefined,
      undefined,
      projectId,
      localeGuidance,
    );
    return bulkResult.results['input'] ?? {};
  }

  @Post('ai-preview-prompt')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Preview constructed prompt without calling Gemini',
  })
  async previewPrompt(
    @Body() dto: PreviewPromptDto,
  ): Promise<{ prompt: string }> {
    let prompt: string;
    if (dto.type === 'translate') {
      const targetLocales =
        dto.targetLocales && Object.keys(dto.targetLocales).length > 0
          ? dto.targetLocales
          : { uk: 'Ukrainian' };
      prompt = await this.aiTranslateService.buildTranslatePrompt(
        dto.text,
        targetLocales,
        dto.localeSkill,
        dto.context,
      );
    } else {
      prompt = await this.aiTranslateService.buildQualityPrompt(
        dto.text,
        dto.translation ?? '',
        dto.locale ?? 'uk',
        dto.mode ?? 'translation_quality',
        dto.context,
        dto.localeSkill?.[dto.locale ?? 'uk'],
      );
    }
    return { prompt };
  }

  // ─── Namespace bulk operations ────────────────────────────────────────────

  @Post('projects/:slug/namespaces/:ns/retranslate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Delete sandbox translations and trigger re-translation. Scope: namespace (no body), locale ({ locale }), or key+locale ({ key, locale })',
  })
  async retranslate(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: RetranslateDto,
    @CurrentUser() user: CurrentUserType,
  ): Promise<{ deleted: number }> {
    return this.sandboxService.retranslate(
      slug,
      ns,
      dto,
      user.userId,
      user.role,
    );
  }

  @Post('projects/:slug/namespaces/:ns/reset-quality')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Reset all quality scores in a namespace — quality worker will re-evaluate',
  })
  async resetNamespaceQuality(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<{ reset: number }> {
    return this.sandboxService.resetNamespaceQuality(
      slug,
      ns,
      user.userId,
      user.role,
    );
  }

  // ─── Entries (protected) ──────────────────────────────────────────────────

  @Get('projects/:slug/namespaces/:ns/entries')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List translation entries with search and pagination',
  })
  async listEntries(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Query() query: ListEntriesQueryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.listEntries(
      slug,
      ns,
      query,
      user.userId,
      user.role,
    );
  }
}
