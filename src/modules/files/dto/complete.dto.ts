import { IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CompleteUploadDto {
  @IsUUID()
  fileId!: string;

  // For DZ: keep it simple - only avatar.
  @IsString()
  @IsNotEmpty()
  @IsIn(['avatar'])
  purpose!: 'avatar';
}
