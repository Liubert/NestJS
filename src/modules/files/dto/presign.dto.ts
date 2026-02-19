import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export enum FileVisibility {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

export class PresignUploadDto {
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsString()
  @IsIn(['avatar'])
  purpose!: 'avatar';
}
