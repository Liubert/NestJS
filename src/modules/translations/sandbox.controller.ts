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
import { IsUUID } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BlockMcpGuard } from '../auth/block-mcp.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';
import { TranslationsService } from './translations.service.js';
import { SandboxService } from './sandbox.service.js';
import { ListEntriesQueryDto } from './dto/list-entries-query.dto.js';
import { CreateEntryDto } from './dto/create-entry.dto.js';
import { UpdateEntryDto } from './dto/update-entry.dto.js';
import { BulkImportDto } from './dto/bulk-import.dto.js';
import { BulkDeleteDto } from './dto/bulk-delete.dto.js';

import { BulkRevertDto } from './dto/bulk-revert.dto.js';
import { BulkQualityCheckDto } from './dto/bulk-quality-check.dto.js';
import { RenameKeyDto } from './dto/rename-key.dto.js';
import { SelectivePromoteDto } from './dto/selective-promote.dto.js';
import { AnalyzeEntriesDto } from './dto/analyze-entries.dto.js';
import { DiffQueryDto } from './dto/diff-query.dto.js';

class RevertDto {
  @IsUUID()
  snapshotId!: string;
}

@ApiTags('sandbox')
@Controller('translations/projects/:slug/sandbox')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SandboxController {
  constructor(
    private readonly sandboxService: SandboxService,
    private readonly translationsService: TranslationsService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get sandbox status for a project' })
  status(@Param('slug') slug: string) {
    return this.sandboxService.getSandboxStatus(slug);
  }

  @Get('diff')
  @ApiOperation({ summary: 'Get diff between sandbox and production' })
  diff(
    @Param('slug') slug: string,
    @Query() query: DiffQueryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.getDiff(
      slug,
      user.userId,
      user.role,
      query.page,
      query.limit,
      {
        namespace: query.namespace,
        locale: query.locale,
        status: query.status,
      },
    );
  }

  @Post('promote')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BlockMcpGuard)
  @ApiOperation({
    summary: 'Promote sandbox to production (takes snapshot before replacing)',
  })
  promote(@Param('slug') slug: string, @CurrentUser() user: CurrentUserType) {
    return this.sandboxService.promote(slug, user.userId, user.role);
  }

  @Post('promote-selective')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BlockMcpGuard)
  @ApiOperation({
    summary: 'Promote only selected keys from sandbox to production',
  })
  promoteSelective(
    @Param('slug') slug: string,
    @Body() dto: SelectivePromoteDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.promoteSelective(
      slug,
      dto.keys,
      user.userId,
      user.role,
    );
  }

  @Post('revert')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BlockMcpGuard)
  @ApiOperation({ summary: 'Revert production to a previous snapshot' })
  revert(
    @Param('slug') slug: string,
    @Body() dto: RevertDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.revert(
      slug,
      dto.snapshotId,
      user.userId,
      user.role,
    );
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Discard sandbox changes and re-copy from current production',
  })
  reset(@Param('slug') slug: string, @CurrentUser() user: CurrentUserType) {
    return this.sandboxService.resetSandbox(slug, user.userId, user.role);
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'List production snapshots (for revert)' })
  listSnapshots(@Param('slug') slug: string) {
    return this.sandboxService.listSnapshots(slug);
  }

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
    @CurrentUser() _user: CurrentUserType,
  ) {
    const project = await this.translationsService.getProjectBySlug(slug);
    const namespace = await this.translationsService.requireNamespace(
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

  @Post('namespaces/:ns/entries/bulk-revert')
  @ApiOperation({
    summary: 'Revert multiple sandbox keys to their production values',
  })
  async bulkRevertEntries(
    @Param('slug') slug: string,
    @Param('ns') ns: string,
    @Body() dto: BulkRevertDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.bulkRevert(
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
    @CurrentUser() _user: CurrentUserType,
  ) {
    const project = await this.translationsService.getProjectBySlug(slug);
    const namespace = await this.translationsService.requireNamespace(
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

  @Patch('settings')
  @ApiOperation({
    summary:
      'Update project sandbox settings (auto-translate toggle, daily token limit)',
  })
  updateSettings(
    @Param('slug') slug: string,
    @Body()
    body: { autoTranslateEnabled?: boolean; aiTokenDailyLimit?: number | null },
  ) {
    return this.sandboxService.updateProjectSettings(slug, body);
  }
}
