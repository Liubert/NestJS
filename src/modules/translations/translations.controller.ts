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
  Res,
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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BlockMcpGuard } from '../auth/block-mcp.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';
import { TranslationsService } from './translations.service.js';
import { SandboxService } from './sandbox.service.js';
import { AiTranslateService } from './ai-translate.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { AiTranslateDto } from './dto/ai-translate.dto.js';
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
import { PaginationDto } from '../../common/dto/pagination.dto.js';

@ApiTags('translations')
@Controller('translations')
export class TranslationsController {
  constructor(
    private readonly translationsService: TranslationsService,
    private readonly sandboxService: SandboxService,
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

  // ─── Public (Locize-compatible) ───────────────────────────────────────────

  @Get(':projectSlug/locales')
  @ApiOperation({ summary: 'Get all supported locales for a project' })
  async getLocales(
    @Param('projectSlug') projectSlug: string,
  ): Promise<string[]> {
    return this.translationsService.getLocales(projectSlug);
  }

  @Get(':projectSlug/namespaces')
  @ApiOperation({ summary: 'Get all namespaces for a project' })
  async getNamespaces(
    @Param('projectSlug') projectSlug: string,
  ): Promise<string[]> {
    return this.translationsService.getNamespaces(projectSlug);
  }

  @Get(':projectSlug/:namespace/:locale')
  @ApiOperation({
    summary:
      'Get translations for a namespace and locale (Locize-compatible). Pass ?env=sandbox for sandbox data.',
  })
  @ApiResponse({
    status: 200,
    description: 'Flat key-value translation object',
  })
  async getNamespace(
    @Param('projectSlug') projectSlug: string,
    @Param('namespace') namespace: string,
    @Param('locale') locale: string,
    @Query('env') env: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (env === 'sandbox') {
      // Sandbox view: returns sandbox values overlaid on production.
      // Intended for local dev testing without promoting to production.
      // NOT cached — sandbox data changes frequently.
      const translations = await this.sandboxService.getSandboxNamespace(
        projectSlug,
        namespace,
        locale,
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json(translations);
      return;
    }

    const translations = await this.translationsService.getNamespace(
      projectSlug,
      namespace,
      locale,
    );
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(translations);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
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
        defaultLocale: { type: 'string' },
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
    if (dto.projectSlug) {
      const project = await this.translationsService.getProjectBySlug(
        dto.projectSlug,
      );
      projectId = project.id;
    }
    return this.aiTranslateService.translate(dto.text, projectId);
  }

  @Post('ai-quality-check')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check translation quality using AI' })
  async checkQuality(@Body() dto: CheckQualityDto) {
    let projectId: string | undefined;
    if (dto.projectSlug) {
      const project = await this.translationsService.getProjectBySlug(
        dto.projectSlug,
      );
      projectId = project.id;
    }
    return this.aiTranslateService.checkQuality(
      dto.source,
      dto.translation,
      dto.locale,
      dto.mode,
      projectId,
      dto.context,
    );
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
