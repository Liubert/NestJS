import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { AppConfig } from '../../../config/app.config';

@Injectable()
export class S3StorageService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.getOrThrow<AppConfig>('app');

    this.bucket = config.s3.bucket;
    this.region = config.s3.region;

    const accessKeyId = config.s3.accessKeyId;
    const secretAccessKey = config.s3.secretAccessKey;

    this.s3 = new S3Client({
      region: this.region,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  async presignPut(key: string, contentType: string) {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.s3, cmd, { expiresIn: 60 });
  }

  async head(key: string): Promise<{ size: number; contentType?: string }> {
    const res = await this.s3.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    return {
      size: res.ContentLength ?? 0,
      contentType: res.ContentType,
    };
  }

  async presignGet(key: string, expiresInSeconds = 300) {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, cmd, { expiresIn: expiresInSeconds });
  }
}
