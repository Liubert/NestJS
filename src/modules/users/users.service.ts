import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import bcrypt from 'bcryptjs';

import { CreateUserDto } from './dto/create-user.dto/create-user.dto';
import { UpdateUserDto } from './dto/create-user.dto/update-user.dto';
import { UserResponseDto } from './dto/create-user.dto/response-user.dto';
import { UserEntity } from './user.entity';
import { FilesService } from '../files/files.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly filesService: FilesService,
  ) {}

  async getAll(): Promise<UserResponseDto[]> {
    const users = await this.usersRepo.find();

    return users;
  }

  async setMyAvatar(userId: string, fileId: string) {
    // Ensure file exists + belongs to user + is READY
    const url = await this.filesService.getViewUrl(userId, fileId); // will throw if чужий/нема

    // Optional: ensure file is READY (краще окремим методом в FilesService)
    // For now: at least ownership check is done by getViewUrl.

    await this.usersRepo.update(userId, { avatarFileId: fileId });

    return { avatarFileId: fileId, avatarUrl: url };
  }

  async getMe(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const avatarUrl = user.avatarFileId
      ? await this.filesService.getViewUrl(userId, user.avatarFileId)
      : null;

    return {
      ...user,
      avatarUrl: avatarUrl,
    };
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  async updateAvatarFileId(userId: string, fileId: string) {
    await this.usersRepo.update(userId, {
      avatarFileId: fileId,
    });
  }

  async findByEmailWithSensitiveData(
    email: string,
  ): Promise<UserEntity | null> {
    return this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email })
      .getOne();
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    const passwordHash: string = await bcrypt.hash(dto.password, 10);

    const entity = this.usersRepo.create({
      passwordHash,
      ...dto,
    });
    const saved: UserEntity = await this.usersRepo.save(entity);

    return saved;
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const existing = await this.usersRepo.findOne({ where: { id } });

    if (!existing) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    const updated = this.usersRepo.merge(existing, dto);
    const saved = await this.usersRepo.save(updated);

    return saved;
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
