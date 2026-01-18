import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto/create-user.dto';
import { UserResponseDto } from './dto/create-user.dto/response-user.dto';
import { UpdateUserDto } from './dto/create-user.dto/update-user.dto';
import { AuthHeaderGuard } from '../common/guards/auth-header.guard';
import { UsersService } from './users.service';

@UseGuards(AuthHeaderGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getAll(): UserResponseDto[] {
    return this.usersService.getAll();
  }

  @Post()
  create(@Body() user: CreateUserDto): Promise<UserResponseDto> {
    return this.usersService.create(user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() user: UpdateUserDto,
  ): UserResponseDto {
    return this.usersService.update(id, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
