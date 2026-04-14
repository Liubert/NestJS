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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';
import { ProjectsService } from '../projects/projects.service.js';
import { ProjectAccessHelper } from '../projects/helpers/project-access.helper.js';
import { SandboxService } from './sandbox.service.js';
import { ListEntriesQueryDto } from '../translations/dto/list-entries-query.dto.js';
import { CreateEntryDto } from '../translations/dto/create-entry.dto.js';
import { UpdateEntryDto } from '../translations/dto/update-entry.dto.js';
import { BulkImportDto } from './dto/bulk-import.dto.js';
import { BulkDeleteDto } from './dto/bulk-delete.dto.js';
import { BulkQualityCheckDto } from './dto/bulk-quality-check.dto.js';
import { RenameKeyDto } from './dto/rename-key.dto.js';
import { AnalyzeEntriesDto } from '../translations/dto/analyze-entries.dto.js';
import { RetranslateDto } from '../translations/dto/retranslate.dto.js';

@ApiTags('sandbox')
@Controller('translations/projects/:slug/sandbox')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SandboxController {
  constructor(
    private readonly sandboxService: SandboxService,
    private readonly projectsService: ProjectsService,
    private readonly access: ProjectAccessHelper,
  ) {}

  // ─── Sandbox entry management ──────────────────────────────────────────────

  @Get('namespaces/:ns/entries')
  @ApiOperation({
    summary:
      'List sandbox entries for a namespace (sandbox view with diff overlay)',
  })
  listEntries(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Query() query: ListEntriesQueryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.listSandboxEntries(
      slug,
      ns,
      query,
      user.userId,
      user.role,
    );
  }

  @Post('namespaces/:ns/entries/analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Analyze a batch of planned entries for conflicts and duplicates before creation (preflight)',
  })
  analyzeEntries(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: AnalyzeEntriesDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.analyzeEntries(
      slug,
      ns,
      dto.entries,
      user.userId,
      user.role,
      dto.sourceLocale,
    );
  }

  @Post('namespaces/:ns/entries')
  @ApiOperation({
    summary:
      'Create a new translation key in sandbox (not visible in production until promoted)',
  })
  createEntry(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: CreateEntryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.createSandboxEntry(
      slug,
      ns,
      dto,
      user.userId,
      user.role,
    );
  }

  @Patch('namespaces/:ns/entries/:key')
  @ApiOperation({ summary: 'Update translation values for a key in sandbox' })
  updateEntry(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @Body() dto: UpdateEntryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.updateSandboxEntry(
      slug,
      ns,
      decodeURIComponent(key),
      dto,
      user.userId,
      user.role,
    );
  }

  @Post('namespaces/:ns/entries/:key/check-quality')
  @ApiOperation({
    summary:
      'Run AI quality check for all locales of a key in sandbox and persist results to sandbox',
  })
  checkEntryQuality(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.runSandboxQualityCheck(
      slug,
      ns,
      decodeURIComponent(key),
      user.userId,
      user.role,
    );
  }

  @Post('namespaces/:ns/entries/bulk-quality-check')
  @ApiOperation({ summary: 'Run AI quality check on multiple keys in sandbox' })
  bulkQualityCheck(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: BulkQualityCheckDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.bulkSandboxQualityCheck(
      slug,
      ns,
      dto.keys,
      user.userId,
      user.role,
    );
  }

  @Get('namespaces/:ns/attention')
  @ApiOperation({
    summary: 'Get sandbox translations needing quality attention',
  })
  getAttentionItems(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Query('limit') limit?: string,
    @Query('qualityLevels') qualityLevels?: string,
    @Query('includeUnchecked') includeUnchecked?: string,
    @CurrentUser() user?: CurrentUserType,
  ) {
    return this.sandboxService.getSandboxAttentionItems(
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

  @Post('namespaces/:ns/entries/:key/revert')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revert a specific key in sandbox to its production value',
  })
  revertKey(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.revertSandboxKey(
      slug,
      ns,
      decodeURIComponent(key),
      user.userId,
      user.role,
    );
  }

  @Delete('namespaces/:ns/entries/:key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete a translation key in sandbox (soft delete; not removed from production until promoted)',
  })
  deleteEntry(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.deleteSandboxEntry(
      slug,
      ns,
      decodeURIComponent(key),
      user.userId,
      user.role,
    );
  }

  @Post('namespaces/:ns/entries/bulk')
  @ApiOperation({
    summary: 'Bulk upsert multiple translation keys in sandbox',
  })
  async bulkUpsertEntries(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: BulkImportDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const project = await this.projectsService.getProjectBySlug(slug);
    await this.access.assertAccess(project, user.userId, user.role);
    const namespace = await this.projectsService.requireNamespace(
      project.id,
      ns,
    );
    return this.sandboxService.bulkUpsert(project, namespace, dto.entries);
  }

  @Post('namespaces/:ns/entries/bulk-delete')
  @ApiOperation({
    summary: 'Bulk delete multiple translation keys in sandbox',
  })
  async bulkDeleteEntries(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: BulkDeleteDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.bulkDelete(
      slug,
      ns,
      dto.keys,
      user.userId,
      user.role,
    );
  }

  @Post('namespaces/:ns/entries/:key/rename')
  @ApiOperation({ summary: 'Rename a translation key in sandbox' })
  async renameKey(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @Body() dto: RenameKeyDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const project = await this.projectsService.getProjectBySlug(slug);
    await this.access.assertAccess(project, user.userId, user.role);
    const namespace = await this.projectsService.requireNamespace(
      project.id,
      ns,
    );
    await this.sandboxService.renameKey(
      project,
      namespace,
      decodeURIComponent(key),
      dto.newKey,
    );
    return { oldKey: decodeURIComponent(key), newKey: dto.newKey };
  }

  @Post('namespaces/:ns/entries/:key/locales/:locale/mark-expected')
  @ApiOperation({
    summary: 'Mark a sandbox translation as manually accepted (expected)',
  })
  markExpected(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @Param('locale') locale: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.markSandboxExpected(
      slug,
      ns,
      decodeURIComponent(key),
      locale,
      user.userId,
      user.role,
    );
  }

  @Delete('namespaces/:ns/entries/:key/locales/:locale/mark-expected')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove manual acceptance from sandbox translation',
  })
  unmarkExpected(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Param('key') key: string,
    @Param('locale') locale: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.unmarkSandboxExpected(
      slug,
      ns,
      decodeURIComponent(key),
      locale,
      user.userId,
      user.role,
    );
  }

  // ─── Namespace-level operations ───────────────────────────────────────────

  @Post('namespaces/:ns/retranslate')
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

  @Post('namespaces/:ns/reset-quality')
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
}
