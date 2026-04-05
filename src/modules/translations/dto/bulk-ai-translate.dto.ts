import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class BulkAiTranslateEntryDto {
  @ApiProperty({
    example: 'btn.save',
    description: 'Translation key identifier',
  })
  @IsString()
  @MinLength(1)
  key!: string;

  @ApiProperty({
    example: 'Save',
    description: 'English source text to translate',
  })
  @IsString()
  @MinLength(1)
  text!: string;

  @ApiPropertyOptional({
    example: 'Primary action button in the edit form',
    description:
      'Optional context to improve translation quality (e.g. where the text appears in UI)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  context?: string;
}

export class BulkAiTranslateDto {
  @ApiProperty({
    type: [BulkAiTranslateEntryDto],
    description: 'Array of entries to translate (1–200)',
    example: [
      { key: 'btn.save', text: 'Save' },
      { key: 'btn.cancel', text: 'Cancel' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkAiTranslateEntryDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  entries!: BulkAiTranslateEntryDto[];

  @ApiPropertyOptional({
    example: 'my-project',
    description:
      'Project slug for locale resolution and AI usage tracking (optional)',
  })
  @IsOptional()
  @IsString()
  projectSlug?: string;

  @ApiPropertyOptional({
    example: ['uk', 'nb-NO', 'sv'],
    description:
      'Target locale codes. When omitted, translates to all non-default project locales.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetLocales?: string[];
}
