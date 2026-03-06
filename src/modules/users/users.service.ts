import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateUserDto } from './dto/create-user.dto/create-user.dto';
import { UpdateUserDto } from './dto/create-user.dto/update-user.dto';
import { UserResponseDto } from './dto/create-user.dto/response-user.dto';
import { UserEntity } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  // DB calls are async (unlike in-memory array).
  async getAll(): Promise<UserResponseDto[]> {
    const users = await this.usersRepo.find();
    return users as UserResponseDto[];
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    // Create entity instance from DTO
    const entity = this.usersRepo.create(dto);

    // Save triggers INSERT in DB
    const saved = await this.usersRepo.save(entity);

    // Keeping the same return shape as before
    return saved as UserResponseDto;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const existing = await this.usersRepo.findOne({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const updated = this.usersRepo.merge(existing, dto);
    const saved = await this.usersRepo.save(updated);

    return saved as UserResponseDto;
  }

  async remove(id: string): Promise<{ status: string; id: string }> {
    const existing = await this.usersRepo.findOne({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    await this.usersRepo.remove(existing);

    return { status: 'deleted', id };
  }
}
