import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BlockMcpGuard } from '../auth/block-mcp.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';
import { TranslationsService } from './translations.service.js';
import { AiTranslateService } from './ai-translate.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { AiTranslateDto } from './dto/ai-translate.dto.js';
import { BulkAiTranslateDto } from './dto/bulk-ai-translate.dto.js';
import { CheckQualityDto } from './dto/check-quality.dto.js';
import { ImportTranslationsDto } from './dto/import-translations.dto.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { CreateNamespaceDto } from './dto/create-namespace.dto.js';
import { CreateLocaleDto } from './dto/create-locale.dto.js';
import { UpdateLocaleDto } from './dto/update-locale.dto.js';
import { UpdateNamespaceDto } from './dto/update-namespace.dto.js';
import { CreateEntryDto } from './dto/create-entry.dto.js';
import { UpdateEntryDto } from './dto/update-entry.dto.js';
import { ListEntriesQueryDto } from './dto/list-entries-query.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { BulkQualityCheckDto } from './dto/bulk-quality-check.dto.js';
import { BulkQualityCheckAiDto } from './dto/bulk-quality-check-ai.dto.js';
import { BulkMarkExpectedDto } from './dto/bulk-mark-expected.dto.js';
import { BulkContextUpdateDto } from './dto/bulk-context.dto.js';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

@ApiTags('translations')
@Controller('translations')
export class TranslationsController {
  constructor(
    private readonly translationsService: TranslationsService,
    private readonly aiTranslateService: AiTranslateService,
    private readonly aiUsageService: AiUsageService,
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
    const project = await this.translationsService.getProjectBySlug(slug);
    return this.aiUsageService.getProjectUsage(project.id);
  }

  // Public (Locize-compatible) routes moved to PublicTranslationsController
  // to avoid wildcard route conflicts with webhooks/sandbox controllers.

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
  async aiTranslate(
    @Body() dto: AiTranslateDto,
  ): Promise<Record<string, string>> {
    let projectId: string | undefined;
    let localeGuidance: Record<string, string> | undefined;
    if (dto.projectSlug) {
      const project = await this.translationsService.getProjectBySlug(
        dto.projectSlug,
      );
      projectId = project.id;
      const locales = await this.translationsService.getProjectLocales(
        dto.projectSlug,
      );
      const guidance = locales.reduce<Record<string, string>>((acc, l) => {
        if (l.guidance) acc[l.code] = l.guidance;
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
      const project = await this.translationsService.getProjectBySlug(
        dto.projectSlug,
      );
      projectId = project.id;
      const locales = await this.translationsService.getProjectLocales(
        dto.projectSlug,
      );
      const guidance = locales.reduce<Record<string, string>>((acc, l) => {
        if (l.guidance) acc[l.code] = l.guidance;
        return acc;
      }, {});
      if (Object.keys(guidance).length) localeGuidance = guidance;

      // Filter targetLocales to only include codes that exist in the project (excluding default)
      if (dto.targetLocales && dto.targetLocales.length > 0) {
        const projectLocaleCodes = new Set(
          locales.filter((l) => !l.isDefault).map((l) => l.code),
        );
        targetLocales = dto.targetLocales.filter((code) =>
          projectLocaleCodes.has(code),
        );
      } else if (!dto.targetLocales) {
        // No targetLocales provided — use all non-default project locales
        targetLocales = locales.filter((l) => !l.isDefault).map((l) => l.code);
      }
    }

    return this.aiTranslateService.bulkTranslate(
      dto.entries,
      projectId,
      targetLocales,
      localeGuidance,
    );
  }

  @Post('ai-quality-check')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check translation quality using AI' })
  async checkQuality(@Body() dto: CheckQualityDto) {
    let projectId: string | undefined;
    let localeGuidanceStr: string | undefined;
    if (dto.projectSlug) {
      const project = await this.translationsService.getProjectBySlug(
        dto.projectSlug,
      );
      projectId = project.id;
      const locales = await this.translationsService.getProjectLocales(
        dto.projectSlug,
      );
      const matched = locales.find((l) => l.code === dto.locale && l.guidance);
      if (matched) localeGuidanceStr = matched.guidance!;
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
      const project = await this.translationsService.getProjectBySlug(
        dto.projectSlug,
      );
      projectId = project.id;
      const locales = await this.translationsService.getProjectLocales(
        dto.projectSlug,
      );
      const guidance = locales.reduce<Record<string, string>>((acc, l) => {
        if (l.guidance) acc[l.code] = l.guidance;
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

  // ─── Projects (protected) ─────────────────────────────────────────────────

  @Get('projects')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List projects accessible to the current user' })
  async listProjects(
    @Query() query: PaginationDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.listProjects(
      query.page,
      query.limit,
      user.userId,
      user.role,
    );
  }

  @Post('projects')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new project' })
  async createProject(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.createProject(dto, user.userId);
  }

  @Get('projects/:slug')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get project details (namespaces + locales)' })
  async getProject(
    @Param('slug') slug: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.getProjectDetails(
      slug,
      user.userId,
      user.role,
    );
  }

  @Delete('projects/:slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a project (owner or admin only)' })
  async deleteProject(
    @Param('slug') slug: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<void> {
    return this.translationsService.deleteProject(slug, user.userId, user.role);
  }

  // ─── Members (protected) ──────────────────────────────────────────────────

  @Get('projects/:slug/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List project members' })
  async listMembers(
    @Param('slug') slug: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.listMembers(slug, user.userId, user.role);
  }

  @Post('projects/:slug/members')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a user to a project (owner or admin)' })
  @ApiParam({ name: 'slug', example: 'travis' })
  async addMember(
    @Param('slug') slug: string,
    @Body() dto: AddMemberDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.addMember(
      slug,
      dto,
      user.userId,
      user.role,
    );
  }

  @Delete('projects/:slug/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a user from a project (owner or admin)' })
  async removeMember(
    @Param('slug') slug: string,
    @Param('userId') targetUserId: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<void> {
    return this.translationsService.removeMember(
      slug,
      targetUserId,
      user.userId,
      user.role,
    );
  }

  // ─── Namespaces (protected) ───────────────────────────────────────────────

  @Post('projects/:slug/namespaces')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new namespace in a project' })
  async createNamespace(
    @Param('slug') slug: string,
    @Body() dto: CreateNamespaceDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.createNamespace(
      slug,
      dto,
      user.userId,
      user.role,
    );
  }

  @Post('projects/:slug/locales')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a locale to a project' })
  async createLocale(
    @Param('slug') slug: string,
    @Body() dto: CreateLocaleDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.createLocale(
      slug,
      dto.code,
      dto.isDefault,
      user.userId,
      user.role,
      dto.aliases,
      dto.guidance,
    );
  }

  @Patch('projects/:slug/locales/:code')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update locale aliases' })
  async updateLocale(
    @Param('slug') slug: string,
    @Param('code') code: string,
    @Body() dto: UpdateLocaleDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.updateLocale(
      slug,
      code,
      dto.aliases ?? [],
      user.userId,
      user.role,
      dto.guidance,
    );
  }

  @Delete('projects/:slug/locales/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a locale from a project' })
  async deleteLocale(
    @Param('slug') slug: string,
    @Param('code') code: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<void> {
    return this.translationsService.deleteLocale(
      slug,
      code,
      user.userId,
      user.role,
    );
  }

  @Patch('projects/:slug/namespaces/:ns')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rename a namespace' })
  async updateNamespace(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: UpdateNamespaceDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.updateNamespace(
      slug,
      ns,
      dto.slug,
      user.userId,
      user.role,
    );
  }

  @Delete('projects/:slug/namespaces/:ns')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a namespace (cascades to all keys and values)',
  })
  async deleteNamespace(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<void> {
    return this.translationsService.deleteNamespace(
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

  @Post('projects/:slug/namespaces/:ns/entries')
  @UseGuards(JwtAuthGuard, BlockMcpGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new translation key' })
  async createEntry(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: CreateEntryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.createEntry(
      slug,
      ns,
      dto,
      user.userId,
      user.role,
    );
  }

  @Post('projects/:slug/namespaces/:ns/entries/bulk-quality-check')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Run AI quality check on multiple keys' })
  async bulkQualityCheck(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: BulkQualityCheckDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.bulkQualityCheck(
      slug,
      ns,
      dto.keys,
      user.userId,
      user.role,
    );
  }

  @Post('projects/:slug/namespaces/:ns/entries/bulk-mark-expected')
  @UseGuards(JwtAuthGuard, BlockMcpGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark multiple keys as expected' })
  async bulkMarkExpected(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: BulkMarkExpectedDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.bulkMarkExpected(
      slug,
      ns,
      dto.keys,
      dto.locale,
      user.userId,
      user.role,
    );
  }

  @Patch('projects/:slug/namespaces/:ns/entries/bulk-context')
  @UseGuards(JwtAuthGuard, BlockMcpGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update context for multiple keys' })
  async bulkUpdateContext(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: BulkContextUpdateDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.bulkUpdateContext(
      slug,
      ns,
      dto.updates,
      user.userId,
      user.role,
    );
  }

  @Patch('projects/:slug/namespaces/:ns/entries/:key')
  @UseGuards(JwtAuthGuard, BlockMcpGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update translation values for a key' })
  async updateEntry(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @Body() dto: UpdateEntryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.updateEntry(
      slug,
      ns,
      key,
      dto,
      user.userId,
      user.role,
    );
  }

  @Get('projects/:slug/namespaces/:ns/attention')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get translations needing quality attention' })
  async getAttentionItems(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Query('limit') limit?: string,
    @Query('qualityLevels') qualityLevels?: string,
    @Query('includeUnchecked') includeUnchecked?: string,
    @CurrentUser() user?: CurrentUserType,
  ) {
    return this.translationsService.getAttentionItems(
      slug,
      ns,
      {
        limit: limit ? parseInt(limit, 10) : 50,
        qualityLevels: qualityLevels?.split(',') ?? ['yellow', 'red'],
        includeUnchecked: includeUnchecked === 'true',
      },
      user!.userId,
      user!.role,
    );
  }

  @Post('projects/:slug/namespaces/:ns/entries/:key/check-quality')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Run AI quality check for all locales of a key and persist results',
  })
  async checkEntryQuality(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.runQualityCheck(
      slug,
      ns,
      key,
      user.userId,
      user.role,
    );
  }

  @Post(
    'projects/:slug/namespaces/:ns/entries/:key/locales/:locale/mark-expected',
  )
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mark a translation as manually accepted (expected)',
  })
  async markExpected(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @Param('locale') locale: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.markAsExpected(
      slug,
      ns,
      key,
      locale,
      user.userId,
      user.role,
    );
  }

  @Delete(
    'projects/:slug/namespaces/:ns/entries/:key/locales/:locale/mark-expected',
  )
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Remove manual acceptance (unmark expected)',
  })
  async unmarkExpected(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @Param('locale') locale: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.translationsService.unmarkExpected(
      slug,
      ns,
      key,
      locale,
      user.userId,
      user.role,
    );
  }

  @Delete('projects/:slug/namespaces/:ns/entries/:key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, BlockMcpGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a translation key and all its values' })
  async deleteEntry(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @CurrentUser() user: CurrentUserType,
  ): Promise<void> {
    return this.translationsService.deleteEntry(
      slug,
      ns,
      key,
      user.userId,
      user.role,
    );
  }
}
