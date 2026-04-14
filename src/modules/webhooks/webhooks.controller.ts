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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserType } from '../users/types/current-user.type.js';
import { ProjectsService } from '../projects/projects.service.js';
import { WebhooksService } from './webhooks.service.js';
import { CreateWebhookDto } from './dto/create-webhook.dto.js';
import { UpdateWebhookDto } from './dto/update-webhook.dto.js';

@ApiTags('webhooks')
@Controller('translations/projects/:slug/webhooks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List webhooks for a project' })
  async list(
    @Param('slug') slug: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    const project = await this.projectsService.getProjectDetails(
      slug,
      user.userId,
      user.role,
    );
    return this.webhooksService.findAllForProject(project.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a webhook for a project' })
  async create(
    @Param('slug') slug: string,
    @Body() dto: CreateWebhookDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const project = await this.projectsService.getProjectDetails(
      slug,
      user.userId,
      user.role,
    );
    return this.webhooksService.create(project.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a webhook' })
  async update(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
    @CurrentUser() user: CurrentUserType,
  ) {
    const project = await this.projectsService.getProjectDetails(
      slug,
      user.userId,
      user.role,
    );
    return this.webhooksService.update(id, project.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a webhook' })
  async remove(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserType,
  ) {
    const project = await this.projectsService.getProjectDetails(
      slug,
      user.userId,
      user.role,
    );
    return this.webhooksService.remove(id, project.id);
  }
}
