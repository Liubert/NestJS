import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminCreateUserDto } from './dto/admin-create-user.dto.js';
import { UserResponseDto } from './dto/create-user.dto/response-user.dto.js';
import { UpdateUserDto } from './dto/create-user.dto/update-user.dto.js';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/role.decorator.js';
import { UserRole } from './types/user-role.enum.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AuditLogService } from '../../common/audit/audit-log.service.js';
import type { RequestWithMetadata } from '../../common/middleware/logger.middleware.js';
import type { CurrentUserType } from './types/current-user.type.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all users (admin only)' })
  async getAll() {
    return this.usersService.getAll();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async me(@CurrentUser() user: CurrentUserType) {
    const entity = await this.usersService.getMe(user.userId);
    if (!entity) throw new NotFoundException('User not found');
    return entity;
  }

  // Audit: admin user creation — tracks who created which account
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a user (admin only). Sets mustChangePassword = true.',
  })
  async adminCreate(
    @Body() dto: AdminCreateUserDto,
    @CurrentUser() actor: CurrentUserType,
    @Req() req: RequestWithMetadata,
  ) {
    const created = await this.usersService.adminCreate(dto);
    this.audit.log({
      action: 'user.admin_created',
      actorId: actor.userId,
      actorRole: actor.role,
      targetType: 'user',
      targetId: created.id,
      outcome: 'success',
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'],
    });
    return created;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user (self or admin)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: CurrentUserType,
  ): Promise<UserResponseDto> {
    return this.usersService.update(
      id,
      dto,
      currentUser.userId,
      currentUser.role,
    );
  }

  // Audit: user deletion — irreversible action, always logged
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a user (admin only)' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() actor: CurrentUserType,
    @Req() req: RequestWithMetadata,
  ): Promise<{ status: string; id: string }> {
    const result = await this.usersService.remove(id);
    this.audit.log({
      action: 'user.deleted',
      actorId: actor.userId,
      actorRole: actor.role,
      targetType: 'user',
      targetId: id,
      outcome: 'success',
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
      ip: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'],
    });
    return result;
  }
}
