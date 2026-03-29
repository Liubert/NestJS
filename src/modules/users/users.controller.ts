import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
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
import { FilesService } from '../files/files.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { CurrentUserType } from './types/current-user.type.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly filesService: FilesService,
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

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a user (admin only). Sets mustChangePassword = true.',
  })
  async adminCreate(@Body() dto: AdminCreateUserDto) {
    return this.usersService.adminCreate(dto);
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

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a user (admin only)' })
  async remove(
    @Param('id') id: string,
  ): Promise<{ status: string; id: string }> {
    return this.usersService.remove(id);
  }
}
