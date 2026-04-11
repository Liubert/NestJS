import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import bcrypt from 'bcryptjs';

import { AdminCreateUserDto } from './dto/admin-create-user.dto.js';
import { UpdateUserDto } from './dto/create-user.dto/update-user.dto.js';
import { UserResponseDto } from './dto/create-user.dto/response-user.dto.js';
import { UserEntity } from './user.entity.js';
import { UserRole } from './types/user-role.enum.js';
import { FilesService } from '../files/files.service.js';
import { FileRecordEntity } from '../files/file-record.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly filesService: FilesService,
    @InjectRepository(FileRecordEntity)
    private readonly fileRepo: Repository<FileRecordEntity>,
  ) {}

  async getAll(): Promise<UserEntity[]> {
    return this.usersRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getMe(userId: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    let avatarUrl: string | null = null;
    if (user.avatarFileId) {
      const file = await this.fileRepo.findOne({
        where: { id: user.avatarFileId },
      });
      avatarUrl = file ? await this.filesService.getViewUrl(file) : null;
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      avatarFileId: user.avatarFileId ?? null,
      avatarUrl,
      mustChangePassword: user.mustChangePassword,
      createdAt: user.createdAt,
    };
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.usersRepo.findOne({ where: { email } });
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

  async findByIdWithSensitiveData(id: string): Promise<UserEntity | null> {
    return this.usersRepo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
  }

  async updateAvatarFileId(userId: string, fileId: string) {
    await this.usersRepo.update(userId, { avatarFileId: fileId });
  }

  // ─── Admin: create user ──────────────────────────────────────────────────
  async adminCreate(dto: AdminCreateUserDto): Promise<UserEntity> {
    const existing = await this.usersRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException(
        `User with email "${dto.email}" already exists`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const entity = this.usersRepo.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName ?? dto.email.split('@')[0],
      lastName: dto.lastName ?? null,
      role: dto.role ?? UserRole.USER,
      mustChangePassword: true,
    });

    const saved = await this.usersRepo.save(entity);
    // Re-fetch from DB so the returned object never contains the in-memory passwordHash.
    return (await this.usersRepo.findOne({ where: { id: saved.id } }))!;
  }

  // ─── Update (self or admin) ───────────────────────────────────────────────
  async update(
    id: string,
    dto: UpdateUserDto,
    requesterId: string,
    requesterRole: UserRole,
  ): Promise<UserResponseDto> {
    if (requesterId !== id && requesterRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Cannot modify another user');
    }

    const existing = await this.usersRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    const updated = this.usersRepo.merge(existing, dto);
    return this.usersRepo.save(updated);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────
  async remove(id: string): Promise<{ status: string; id: string }> {
    const existing = await this.usersRepo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    await this.usersRepo.remove(existing);
    return { status: 'deleted', id };
  }

  // ─── Password management ──────────────────────────────────────────────────
  async updatePassword(
    userId: string,
    newHash: string,
    mustChangePassword = false,
  ): Promise<void> {
    await this.usersRepo.update(userId, {
      passwordHash: newHash,
      mustChangePassword,
    });
  }
}
