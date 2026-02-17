import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { FileRecordEntity, FileStatus } from './file-record.entity';
import { S3StorageService } from './storage/s3-storage.service';
import { FileVisibility, PresignUploadDto } from './dto/presign.dto';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileRecordEntity)
    private readonly filesRepo: Repository<FileRecordEntity>,
    private readonly s3: S3StorageService,
  ) {}

  async presign(user: { userId: string }, input: PresignUploadDto) {
    console.log('user');
    console.log(user);
    const ownerId = user.userId;
    const entityId = user.userId;

    const ext = this.extFromContentType(input.contentType);
    const key = `users/${ownerId}/avatars/${randomUUID()}.${ext}`;

    console.log('key');
    console.log(key);
    const file = this.filesRepo.create({
      ownerId,
      entityId,
      key,
      contentType: input.contentType,
      size: input.size, // store expected size (optional but useful)
      status: FileStatus.PENDING,
      visibility: input.visibility,
    });

    const saved = await this.filesRepo.save(file);
    const uploadUrl = await this.s3.presignPut(key, input.contentType);

    return { fileId: saved.id, key, uploadUrl, contentType: input.contentType };
  }

  async getViewUrl(requesterId: string, fileId: string): Promise<string> {
    const file = await this.filesRepo.findOne({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');

    if (file.ownerId !== requesterId) {
      throw new ForbiddenException('Not your file');
    }

    if (file.visibility === FileVisibility.PUBLIC) {
      return this.s3.publicUrl(file.key);
    }

    return this.s3.presignGet(file.key);
  }

  async complete(
    ownerId: string,
    input: { fileId: string; entityId?: string },
  ) {
    const file = await this.filesRepo.findOne({ where: { id: input.fileId } });
    if (!file) throw new NotFoundException('File not found');
    if (file.ownerId !== ownerId) throw new ForbiddenException('Not your file');
    if (file.status !== FileStatus.PENDING)
      throw new BadRequestException('File is not pending');

    const head = await this.s3.head(file.key);
    if (head.size <= 0) throw new BadRequestException('Empty object');

    file.size = head.size;
    file.status = FileStatus.READY;
    await this.filesRepo.save(file);

    return {
      fileId: file.id,
      key: file.key,
      url: this.s3.publicUrl(file.key),
      status: file.status,
    };
  }

  private extFromContentType(ct: string) {
    if (ct === 'image/jpeg') return 'jpg';
    if (ct === 'image/png') return 'png';
    if (ct === 'image/webp') return 'webp';
    throw new BadRequestException('Unsupported contentType');
  }
}
