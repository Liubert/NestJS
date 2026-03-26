import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateNamespaceDto {
  @ApiProperty({ example: 'backoffice-translations' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with dashes',
  })
  @MaxLength(100)
  slug!: string;
}
