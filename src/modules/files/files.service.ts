import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { UserEntity } from '../users/user.entity';
import { FileVisibility, PresignUploadDto } from './dto/presign.dto';
import { FileRecordEntity, FileStatus } from './file-record.entity';
import { CompleteUploadDto } from './dto/complete.dto';
import { S3StorageService } from './storage/s3-storage.service';
import { CurrentUserType } from '../users/types/current-user.type';

const S3_PRESIGNED_GET_TTL_SECONDS = 3600;

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileRecordEntity)
    private readonly fileRepo: Repository<FileRecordEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
    private readonly s3Storage: S3StorageService,
  ) {}

  async findFileRecordsByIds(ids: string[]): Promise<FileRecordEntity[]> {
    if (!ids.length) return [];

    return this.fileRepo.find({
      where: { id: In(ids) },
    });
  }

  async presignUpload(currentUser: CurrentUserType, input: PresignUploadDto) {
    const { key, normalizedContentType } = this.buildKeyForAvatar(
      currentUser.userId,
      input.contentType,
    );

    const file = this.fileRepo.create({
      ownerId: currentUser.userId,
      entityId: null,
      key,
      contentType: normalizedContentType,
      size: 0,
      status: FileStatus.PENDING,
      visibility: FileVisibility.PRIVATE,
    });

    await this.fileRepo.save(file);

    const uploadUrl = await this.s3Storage.presignPut(
      file.key,
      file.contentType,
    );

    return {
      fileId: file.id,
      key: file.key,
      uploadUrl,
      contentType: file.contentType,
    };
  }

  async completeUpload(currentUser: CurrentUserType, input: CompleteUploadDto) {
    const file = await this.fileRepo.findOne({ where: { id: input.fileId } });
    if (!file) throw new NotFoundException('File not found');

    if (file.ownerId !== currentUser.userId) {
      throw new NotFoundException('File not found');
    }

    if (file.status !== FileStatus.PENDING) {
      throw new BadRequestException('File is not pending');
    }

    const head = await this.s3Storage.head(file.key);

    if (
      head.contentType &&
      file.contentType &&
      head.contentType !== file.contentType
    ) {
      throw new BadRequestException('Uploaded Content-Type mismatch');
    }

    file.size = head.size;
    file.status = FileStatus.READY;
    file.entityId = currentUser.userId;

    await this.fileRepo.save(file);

    await this.usersRepo.update(
      { id: currentUser.userId },
      { avatarFileId: file.id },
    );

    return {
      fileId: file.id,
      status: file.status,
      avatarUrl: await this.getViewUrl(file),
    };
  }

  public async getViewUrl(file: FileRecordEntity): Promise<string | null> {
    // if (!file || file.status !== FileStatus.READY) return null;

    return this.s3Storage.presignGet(file.key, S3_PRESIGNED_GET_TTL_SECONDS);
  }

  public async getAvatarUrlForUser(
    avatarFileId: string,
  ): Promise<string | null> {
    const file = await this.fileRepo.findOne({ where: { id: avatarFileId } });
    if (!file) return null;

    // Status check
    if (file.status !== FileStatus.READY) return null;

    return this.s3Storage.presignGet(file.key, S3_PRESIGNED_GET_TTL_SECONDS);
  }

  private buildKeyForAvatar(userId: string, contentType: string) {
    const normalizedContentType = (contentType || '').toLowerCase().trim();

    if (!normalizedContentType.startsWith('image/')) {
      throw new BadRequestException('Only images are allowed');
    }

    const ext = this.extensionFromContentType(normalizedContentType) || 'jpg';
    const key = `users/${userId}/avatars/${randomUUID()}.${ext}`;

    return { key, normalizedContentType };
  }

  private extensionFromContentType(contentType: string): string | null {
    switch (contentType) {
      case 'image/jpeg':
        return 'jpg';
      case 'image/png':
        return 'png';
      case 'image/webp':
        return 'webp';
      default:
        return null;
    }
  }
}
