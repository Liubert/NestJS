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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { CreateNamespaceDto } from './dto/create-namespace.dto.js';
import { CreateLocaleDto } from './dto/create-locale.dto.js';
import { UpdateLocaleDto } from './dto/update-locale.dto.js';
import { UpdateNamespaceDto } from './dto/update-namespace.dto.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { PaginationDto } from '../../common/dto/pagination.dto.js';

@ApiTags('translations')
@Controller('translations')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // ─── Projects (protected) ─────────────────────────────────────────────────

  @Get('projects')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List projects accessible to the current user' })
  async listProjects(
    @Query() query: PaginationDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.projectsService.listProjects(
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
    return this.projectsService.createProject(dto, user.userId);
  }

  @Get('projects/:slug')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get project details (namespaces + locales)' })
  async getProject(
    @Param('slug') slug: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.projectsService.getProjectDetails(slug, user.userId, user.role);
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
    return this.projectsService.deleteProject(slug, user.userId, user.role);
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
    return this.projectsService.listMembers(slug, user.userId, user.role);
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
    return this.projectsService.addMember(slug, dto, user.userId, user.role);
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
    return this.projectsService.removeMember(
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
    return this.projectsService.createNamespace(
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
    return this.projectsService.createLocale(
      slug,
      dto.code,
      dto.isDefault,
      user.userId,
      user.role,
      dto.aliases,
      dto.localeSkill,
      dto.initTranslate ?? false,
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
    return this.projectsService.updateLocale(
      slug,
      code,
      dto.aliases ?? [],
      user.userId,
      user.role,
      dto.localeSkill,
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
    return this.projectsService.deleteLocale(
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
    return this.projectsService.updateNamespace(
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
    return this.projectsService.deleteNamespace(
      slug,
      ns,
      user.userId,
      user.role,
    );
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  @Patch('projects/:slug/settings')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Update project settings (auto-translate toggle, daily token limit)',
  })
  updateSettings(
    @Param('slug') slug: string,
    @Body()
    body: { autoTranslateEnabled?: boolean; aiTokenDailyLimit?: number | null },
    @CurrentUser() user: CurrentUserType,
  ) {
    return this.projectsService.updateProjectSettings(
      slug,
      body,
      user.userId,
      user.role,
    );
  }
}
