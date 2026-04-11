import {
  Body,
  Controller,
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
import { PromotionService } from './promotion.service.js';
import { LifecycleService } from './lifecycle.service.js';
import { SelectivePromoteDto } from './dto/selective-promote.dto.js';
import { DiffQueryDto } from './dto/diff-query.dto.js';

class RevertDto {
  @IsUUID()
  snapshotId!: string;
}

@ApiTags('sandbox')
@Controller('translations/projects/:slug/sandbox')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProductionController {
  constructor(
    private readonly promotionService: PromotionService,
    private readonly lifecycleService: LifecycleService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get sandbox status for a project' })
  status(@Param('slug') slug: string) {
    return this.lifecycleService.getSandboxStatus(slug);
  }

  @Get('diff')
  @ApiOperation({ summary: 'Get diff between sandbox and production' })
  diff(
    @Param('slug') slug: string,
    @Query() query: DiffQueryDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.promotionService.getDiff(
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
    return this.promotionService.promote(slug, user.userId, user.role);
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
    return this.promotionService.promoteSelective(
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
    return this.promotionService.revert(
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
    return this.lifecycleService.resetSandbox(slug, user.userId, user.role);
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'List production snapshots (for revert)' })
  listSnapshots(@Param('slug') slug: string) {
    return this.lifecycleService.listSnapshots(slug);
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
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.lifecycleService.updateProjectSettings(
      slug,
      body,
      user.userId,
      user.role,
    );
  }
}
