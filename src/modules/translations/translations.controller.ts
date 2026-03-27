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
import { TranslationsService } from './translations.service.js';
import { AiTranslateService } from './ai-translate.service.js';
import { AiTranslateDto } from './dto/ai-translate.dto.js';
import { CheckQualityDto } from './dto/check-quality.dto.js';
import { ImportTranslationsDto } from './dto/import-translations.dto.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { CreateNamespaceDto } from './dto/create-namespace.dto.js';
import { CreateLocaleDto } from './dto/create-locale.dto.js';
import { CreateEntryDto } from './dto/create-entry.dto.js';
import { UpdateEntryDto } from './dto/update-entry.dto.js';
import { ListEntriesQueryDto } from './dto/list-entries-query.dto.js';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

@ApiTags('translations')
@Controller('translations')
export class TranslationsController {
  constructor(
    private readonly translationsService: TranslationsService,
    private readonly aiTranslateService: AiTranslateService,
  ) {}

  // ─── Public (Locize-compatible) ───────────────────────────────────────────

  @Get(':projectSlug/locales')
  @ApiOperation({ summary: 'Get all supported locales for a project' })
  @ApiParam({ name: 'projectSlug', example: 'travis' })
  async getLocales(
    @Param('projectSlug') projectSlug: string,
  ): Promise<string[]> {
    return this.translationsService.getLocales(projectSlug);
  }

  @Get(':projectSlug/namespaces')
  @ApiOperation({ summary: 'Get all namespaces for a project' })
  @ApiParam({ name: 'projectSlug', example: 'travis' })
  async getNamespaces(
    @Param('projectSlug') projectSlug: string,
  ): Promise<string[]> {
    return this.translationsService.getNamespaces(projectSlug);
  }

  @Get(':projectSlug/:namespace/:locale')
  @ApiOperation({
    summary: 'Get translations for a namespace and locale (Locize-compatible)',
  })
  @ApiParam({ name: 'projectSlug', example: 'travis' })
  @ApiParam({ name: 'namespace', example: 'backoffice-translations' })
  @ApiParam({ name: 'locale', example: 'en' })
  @ApiResponse({
    status: 200,
    description: 'Flat key-value translation object',
  })
  async getNamespace(
    @Param('projectSlug') projectSlug: string,
    @Param('namespace') namespace: string,
    @Param('locale') locale: string,
    @Res() res: Response,
  ): Promise<void> {
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
        projectSlug: { type: 'string', example: 'travis' },
        projectName: { type: 'string', example: 'TRAVIS' },
        defaultLocale: { type: 'string', example: 'en' },
      },
    },
  })
  async importTranslations(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportTranslationsDto,
  ) {
    if (!file) {
      return { error: 'No file uploaded' };
    }
    return this.translationsService.importFromZip(file.buffer, dto);
  }

  // ─── AI Translation helper (protected) ───────────────────────────────────

  @Post('ai-translate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'AI-generate translations for Ukrainian, Norwegian, Swedish, Danish',
  })
  @ApiResponse({
    status: 200,
    description: 'Translated values keyed by locale code',
    schema: {
      example: { uk: '...', 'nb-NO': '...', sv: '...', 'da-DK': '...' },
    },
  })
  async aiTranslate(
    @Body() dto: AiTranslateDto,
  ): Promise<Record<string, string>> {
    return this.aiTranslateService.translate(dto.text);
  }

  @Post('ai-quality-check')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check translation quality using AI' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        score: 7,
        level: 'average',
        comment: 'Wording sounds unnatural for UI context.',
      },
    },
  })
  async checkQuality(@Body() dto: CheckQualityDto) {
    return this.aiTranslateService.checkQuality(
      dto.source,
      dto.translation,
      dto.locale,
      dto.mode,
    );
  }

  // ─── Projects (protected) ─────────────────────────────────────────────────

  @Get('projects')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all projects' })
  async listProjects(@Query() query: PaginationDto) {
    return this.translationsService.listProjects(query.page, query.limit);
  }

  @Post('projects')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new project' })
  async createProject(@Body() dto: CreateProjectDto) {
    return this.translationsService.createProject(dto);
  }

  @Get('projects/:slug')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get project details (namespaces + locales)' })
  @ApiParam({ name: 'slug', example: 'travis' })
  async getProject(@Param('slug') slug: string) {
    return this.translationsService.getProjectDetails(slug);
  }

  @Delete('projects/:slug')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a project (cascades to all data)' })
  @ApiParam({ name: 'slug', example: 'travis' })
  async deleteProject(@Param('slug') slug: string): Promise<void> {
    return this.translationsService.deleteProject(slug);
  }

  // ─── Namespaces (protected) ───────────────────────────────────────────────

  @Post('projects/:slug/namespaces')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new namespace in a project' })
  @ApiParam({ name: 'slug', example: 'travis' })
  async createNamespace(
    @Param('slug') slug: string,
    @Body() dto: CreateNamespaceDto,
  ) {
    return this.translationsService.createNamespace(slug, dto);
  }

  @Post('projects/:slug/locales')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a locale to a project' })
  @ApiParam({ name: 'slug', example: 'travis' })
  async createLocale(
    @Param('slug') slug: string,
    @Body() dto: CreateLocaleDto,
  ) {
    return this.translationsService.createLocale(slug, dto.code, dto.isDefault);
  }

  @Delete('projects/:slug/locales/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a locale from a project' })
  @ApiParam({ name: 'slug', example: 'travis' })
  @ApiParam({ name: 'code', example: 'uk' })
  async deleteLocale(
    @Param('slug') slug: string,
    @Param('code') code: string,
  ): Promise<void> {
    return this.translationsService.deleteLocale(slug, code);
  }

  @Delete('projects/:slug/namespaces/:ns')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a namespace (cascades to all keys and values)',
  })
  @ApiParam({ name: 'slug', example: 'travis' })
  @ApiParam({ name: 'ns', example: 'backoffice-translations' })
  async deleteNamespace(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
  ): Promise<void> {
    return this.translationsService.deleteNamespace(slug, ns);
  }

  // ─── Entries (protected) ──────────────────────────────────────────────────

  @Get('projects/:slug/namespaces/:ns/entries')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List translation entries with search and pagination',
  })
  @ApiParam({ name: 'slug', example: 'travis' })
  @ApiParam({ name: 'ns', example: 'backoffice-translations' })
  async listEntries(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Query() query: ListEntriesQueryDto,
  ) {
    return this.translationsService.listEntries(slug, ns, query);
  }

  @Post('projects/:slug/namespaces/:ns/entries')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a new translation key with optional initial values',
  })
  @ApiParam({ name: 'slug', example: 'travis' })
  @ApiParam({ name: 'ns', example: 'backoffice-translations' })
  async createEntry(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: CreateEntryDto,
  ) {
    return this.translationsService.createEntry(slug, ns, dto);
  }

  @Patch('projects/:slug/namespaces/:ns/entries/:key')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update translation values for a key' })
  @ApiParam({ name: 'slug', example: 'travis' })
  @ApiParam({ name: 'ns', example: 'backoffice-translations' })
  @ApiParam({ name: 'key', example: 'accessControl' })
  async updateEntry(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @Body() dto: UpdateEntryDto,
  ) {
    return this.translationsService.updateEntry(slug, ns, key, dto);
  }

  @Delete('projects/:slug/namespaces/:ns/entries/:key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a translation key and all its values' })
  @ApiParam({ name: 'slug', example: 'travis' })
  @ApiParam({ name: 'ns', example: 'backoffice-translations' })
  @ApiParam({ name: 'key', example: 'accessControl' })
  async deleteEntry(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
  ): Promise<void> {
    return this.translationsService.deleteEntry(slug, ns, key);
  }
}
