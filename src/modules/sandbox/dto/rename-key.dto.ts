import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class RenameKeyDto {
  @ApiProperty({
    example: 'newKeyName',
    description: 'New key name (must be unique within the namespace)',
  })
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'key must contain only letters, digits, dots, underscores or dashes',
  })
  @MaxLength(255)
  newKey!: string;
}
