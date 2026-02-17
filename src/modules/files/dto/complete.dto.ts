import { IsString, IsUUID } from 'class-validator';

export class CompleteUploadDto {
  @IsUUID()
  fileId!: string;

  @IsString()
  entityId!: string; // userId for avatar flow
}
