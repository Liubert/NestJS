import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto/create-user.dto';

@Controller('users')
export class UsersController {
  @Get()
  getAll() {
    return { users: ['Alice', 'Bob'], total: 2 };
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    const newUser: any = {
      id: Date.now(),
      ...dto,
    };

    return { created: true, user: newUser };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return { status: 'deleted', id };
  }
}
