import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto/create-user.dto';
import { UpdateUserDto } from './dto/create-user.dto/update-user.dto';
import { UserResponseDto } from './dto/create-user.dto/response-user.dto';

@Injectable()
export class UsersService {
  private users: UserResponseDto[] = [
    {
      id: '1',
      firstName: 'Test user',
      lastName: 'Liu',
      email: '123@gmail.com',
    },
    {
      id: '2',
      firstName: 'Test user2',
      lastName: 'Liu2',
      email: '1232@gmail.com',
    },
  ];

  getAll(): UserResponseDto[] {
    return this.users;
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const newUser: UserResponseDto = {
      id: Date.now().toString(),
      ...dto,
    } as UserResponseDto;
    this.users.push(newUser);
    await new Promise((r) => setTimeout(r, 1000));
    return newUser;
  }

  update(id: string, dto: UpdateUserDto): UserResponseDto {
    const index = this.users.findIndex((u) => u.id === id);

    if (index === -1) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const updated: UserResponseDto = {
      ...this.users[index],
      ...dto,
      id,
    } as UserResponseDto;

    this.users[index] = updated;
    return updated;
  }

  remove(id: string): { status: string; id: string } {
    const index = this.users.findIndex((u) => u.id === id);

    if (index === -1) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    this.users.splice(index, 1);

    return { status: 'deleted', id };
  }
}
