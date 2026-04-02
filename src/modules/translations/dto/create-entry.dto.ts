import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateEntryDto {
  @ApiProperty({ example: 'accessControl' })
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'key must contain only letters, digits, dots, underscores or dashes',
  })
  @MaxLength(255)
  key!: string;

  @ApiPropertyOptional({
    example: { en: 'Access control', 'nb-NO': 'Adgangskontroll' },
    description: 'Initial values per locale code',
  })
  @IsOptional()
  @IsObject()
  values?: Record<string, string>;

  @ApiPropertyOptional({
    example: 'Button label on the settings page',
    description: 'Short context describing where/how the key is used (max 500 chars)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  context?: string;
}
