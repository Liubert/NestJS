import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto/create-user.dto';
import { UserResponseDto } from './dto/create-user.dto/response-user.dto';
import { UpdateUserDto } from './dto/create-user.dto/update-user.dto';
import { UsersService } from './users.service';

// @UseGuards(AuthHeaderGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async getAll(): Promise<UserResponseDto[]> {
    return this.usersService.getAll();
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
