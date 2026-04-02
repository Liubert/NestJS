import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FileRecordEntity } from './file-record.entity';
import { FilesService } from './files.service';
import { S3StorageService } from './storage/s3-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([FileRecordEntity])],
  providers: [FilesService, S3StorageService],
  exports: [FilesService],
})
export class FilesModule {}
