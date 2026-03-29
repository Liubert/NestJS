import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/role.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { UserRole } from '../users/types/user-role.enum.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';
import { McpPromptsService } from './mcp-prompts.service.js';

class UpdatePromptDto {
  @IsString()
  @IsNotEmpty()
  content!: string;
}

@ApiTags('mcp-prompts')
@Controller('mcp-prompts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class McpPromptsController {
  constructor(private readonly mcpPromptsService: McpPromptsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all known prompts with current override state',
  })
  getAll() {
    return this.mcpPromptsService.getAll();
  }

  @Get(':key')
  @ApiOperation({
    summary: 'Get latest DB override for a prompt key (used by MCP server)',
  })
  async getLatest(@Param('key') key: string) {
    if (!this.mcpPromptsService.isKnownKey(key)) {
      throw new NotFoundException(`Unknown prompt key: "${key}"`);
    }

    const entry = await this.mcpPromptsService.getLatest(key);
    if (!entry) {
      throw new NotFoundException(`No DB override for prompt key: "${key}"`);
    }

    return entry;
  }

  @Put(':key')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create a new version of a prompt override (admin only)',
  })
  async update(
    @Param('key') key: string,
    @Body() dto: UpdatePromptDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    if (!this.mcpPromptsService.isKnownKey(key)) {
      throw new NotFoundException(`Unknown prompt key: "${key}"`);
    }

    return this.mcpPromptsService.createVersion(key, dto.content, user.userId);
  }

  @Get(':key/history')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get version history for a prompt key (admin only)',
  })
  getHistory(@Param('key') key: string) {
    if (!this.mcpPromptsService.isKnownKey(key)) {
      throw new NotFoundException(`Unknown prompt key: "${key}"`);
    }

    return this.mcpPromptsService.getHistory(key);
  }

  @Post(':key/restore/:version')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Restore a previous version by creating a new version with its content (admin only)',
  })
  restore(
    @Param('key') key: string,
    @Param('version') version: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    if (!this.mcpPromptsService.isKnownKey(key)) {
      throw new NotFoundException(`Unknown prompt key: "${key}"`);
    }

    return this.mcpPromptsService.restoreVersion(
      key,
      parseInt(version, 10),
      user.userId,
    );
  }

  @Post(':key/reset')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Delete all DB overrides for a prompt key, reverting to code default (admin only)',
  })
  async reset(@Param('key') key: string) {
    if (!this.mcpPromptsService.isKnownKey(key)) {
      throw new NotFoundException(`Unknown prompt key: "${key}"`);
    }

    await this.mcpPromptsService.resetOverrides(key);
  }
}
