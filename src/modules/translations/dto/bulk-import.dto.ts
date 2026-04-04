import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class BulkImportEntryDto {
  @ApiProperty({ example: 'accessControl' })
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'key must contain only letters, digits, dots, underscores or dashes',
  })
  @MaxLength(255)
  key!: string;

  @ApiProperty({
    example: { en: 'Access control', 'nb-NO': 'Adgangskontroll' },
    description: 'Values per locale code',
  })
  @IsObject()
  values!: Record<string, string>;

  @ApiPropertyOptional({
    example: 'Button label on the settings page',
    description: 'Short context describing where/how the key is used',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  context?: string;
}

export class BulkImportDto {
  @ApiProperty({ type: [BulkImportEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportEntryDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  entries!: BulkImportEntryDto[];
}
