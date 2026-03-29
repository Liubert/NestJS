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
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';
import { SandboxService } from './sandbox.service.js';
import { ListEntriesQueryDto } from './dto/list-entries-query.dto.js';
import { CreateEntryDto } from './dto/create-entry.dto.js';
import { UpdateEntryDto } from './dto/update-entry.dto.js';

class InitSandboxDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

class RevertDto {
  @IsUUID()
  snapshotId!: string;
}

@ApiTags('sandbox')
@Controller('translations/projects/:slug/sandbox')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SandboxController {
  constructor(private readonly sandboxService: SandboxService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get sandbox status for a project' })
  status(@Param('slug') slug: string) {
    return this.sandboxService.getSandboxStatus(slug);
  }

  @Post('init')
  @ApiOperation({
    summary:
      'Initialize sandbox (copy production to sandbox). force=true resets.',
  })
  init(
    @Param('slug') slug: string,
    @Body() dto: InitSandboxDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.initSandbox(
      slug,
      user.userId,
      user.role,
      dto.force ?? false,
    );
  }

  @Get('diff')
  @ApiOperation({ summary: 'Get diff between sandbox and production' })
  diff(@Param('slug') slug: string, @CurrentUser() user: CurrentUserType) {
    return this.sandboxService.getDiff(slug, user.userId, user.role);
  }

  @Post('promote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Promote sandbox to production (takes snapshot before replacing)',
  })
  promote(@Param('slug') slug: string, @CurrentUser() user: CurrentUserType) {
    return this.sandboxService.promote(slug, user.userId, user.role);
  }

  @Post('revert')
  @HttpCode(HttpStatus.OK)
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
}
