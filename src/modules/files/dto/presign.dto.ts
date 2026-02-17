import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum FileVisibility {
  PRIVATE = 'private',
  PUBLIC = 'public',
}

export class PresignUploadDto {
  @IsOptional()
  @IsEnum(FileVisibility)
  visibility?: FileVisibility;

  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsInt()
  @Min(1)
  size!: number;

  @IsOptional()
  @IsString()
  entityId?: string;
}
