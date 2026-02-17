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
import { CreateUserDto } from './dto/create-user.dto/create-user.dto';
import { UserResponseDto } from './dto/create-user.dto/response-user.dto';
import { UpdateUserDto } from './dto/create-user.dto/update-user.dto';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/role.decorator';
import { UserRole } from './types/user-role.enum';
import { FilesService } from '../files/files.service';
import { CurrentUser } from '../auth/current-user.decorator';

// @UseGuards(AuthHeaderGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly filesService: FilesService,
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  async getAll(): Promise<UserResponseDto[]> {
    return this.usersService.getAll();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: { userId: string }) {
    const entity = await this.usersService.getMe(user.userId);
    if (!entity) throw new NotFoundException('User not found');

    return entity;
  }

  @Post('me/avatar')
  async setAvatar(
    @CurrentUser() user: { userId: string },
    @Body() body: { fileId: string },
  ) {
    return this.usersService.setMyAvatar(user.userId, body.fileId);
  }

  @Post()
  async create(@Body() user: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(user);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() user: UpdateUserDto,
  ): Promise<UserResponseDto> {
    return this.usersService.update(id, user);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
  ): Promise<{ status: string; id: string }> {
    return this.usersService.remove(id);
  }
}
