import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Translation key field — shared by CreateEntryDto and BulkImportEntryDto.
 */
export class BaseEntryKeyDto {
  @ApiProperty({ example: 'accessControl' })
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'key must contain only letters, digits, dots, underscores or dashes',
  })
  @MaxLength(255)
  key!: string;
}

/**
 * Context field — shared by all entry DTOs.
 */
export class BaseEntryContextDto {
  @ApiPropertyOptional({
    example: 'Button label on the settings page',
    description:
      'Short context describing where/how the key is used (max 200 chars)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  context?: string;
}

/**
 * Optional values — used by CreateEntryDto where values are optional.
 */
export class OptionalValuesDto extends BaseEntryContextDto {
  @ApiPropertyOptional({
    example: { en: 'Access control', 'nb-NO': 'Adgangskontroll' },
    description: 'Values per locale code',
  })
  @IsOptional()
  @IsObject()
  values?: Record<string, string>;
}

/**
 * Required values — used by UpdateEntryDto and BulkImportEntryDto.
 */
export class RequiredValuesDto extends BaseEntryContextDto {
  @ApiProperty({
    example: { en: 'Access control', 'nb-NO': 'Adgangskontroll' },
    description: 'Values per locale code',
  })
  @IsObject()
  values!: Record<string, string>;
}
