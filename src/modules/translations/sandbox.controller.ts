import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';
import { SandboxService } from './sandbox.service.js';

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
  @ApiOperation({ summary: 'Initialize sandbox (copy production to sandbox). force=true resets.' })
  init(
    @Param('slug') slug: string,
    @Body() dto: InitSandboxDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.initSandbox(slug, user.userId, user.role, dto.force ?? false);
  }

  @Get('diff')
  @ApiOperation({ summary: 'Get diff between sandbox and production' })
  diff(
    @Param('slug') slug: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.getDiff(slug, user.userId, user.role);
  }

  @Post('promote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Promote sandbox to production (takes snapshot before replacing)' })
  promote(
    @Param('slug') slug: string,
    @CurrentUser() user: CurrentUserType,
  ) {
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
    return this.sandboxService.revert(slug, dto.snapshotId, user.userId, user.role);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Discard sandbox changes and re-copy from current production' })
  reset(
    @Param('slug') slug: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.sandboxService.resetSandbox(slug, user.userId, user.role);
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'List production snapshots (for revert)' })
  listSnapshots(@Param('slug') slug: string) {
    return this.sandboxService.listSnapshots(slug);
  }
}
