import { Inject, Injectable } from '@nestjs/common';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppConfig } from '../../../config/app.config';
import appConfig from '../../../config/app.config';

@Injectable()
export class S3StorageService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(appConfig.KEY) private readonly config: AppConfig) {
    this.bucket = this.config.s3.bucket;

    this.client = new S3Client({
      region: this.config.s3.region,
      credentials: {
        accessKeyId: this.config.s3.accessKeyId,
        secretAccessKey: this.config.s3.secretAccessKey,
      },
    });
  }

  async presignPut(key: string, contentType: string): Promise<string> {
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(this.client, cmd, { expiresIn: 60 });
  }

  async head(key: string): Promise<{ size: number; contentType?: string }> {
    const res = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    return {
      size: Number(res.ContentLength ?? 0),
      contentType: res.ContentType,
    };
  }

  async presignGet(key: string): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, cmd, { expiresIn: 60 });
  }

  publicUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.config.s3.region}.amazonaws.com/${key}`;
  }
}
