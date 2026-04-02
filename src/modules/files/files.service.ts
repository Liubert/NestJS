import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { FileRecordEntity, FileStatus } from './file-record.entity';
import { S3StorageService } from './storage/s3-storage.service';

const S3_PRESIGNED_GET_TTL_SECONDS = 3600;

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileRecordEntity)
    private readonly fileRepo: Repository<FileRecordEntity>,
    private readonly s3Storage: S3StorageService,
  ) {}

  async findFileRecordsByIds(ids: string[]): Promise<FileRecordEntity[]> {
    if (!ids.length) return [];

    return this.fileRepo.find({
      where: { id: In(ids) },
    });
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
}
