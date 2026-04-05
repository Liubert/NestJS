import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { BulkAiTranslateEntryDto } from './bulk-ai-translate.dto.js';

export class BulkTranslateAndSaveDto {
  @ApiProperty({
    example: 'my-project',
    description: 'Project slug for locale resolution and usage tracking',
  })
  @IsString()
  projectSlug!: string;

  @ApiProperty({
    example: 'common',
    description: 'Namespace slug where translations will be saved',
  })
  @IsString()
  namespace!: string;

  @ApiProperty({
    type: [BulkAiTranslateEntryDto],
    description: 'Array of entries to translate and save (1–200)',
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
    example: ['uk', 'nb-NO', 'sv'],
    description:
      'Target locale codes. When omitted, translates to all non-default project locales.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetLocales?: string[];

  @ApiPropertyOptional({
    example: false,
    description:
      'Skip synchronous quality check. When true, translations are saved and quality check is queued for background worker (~30s). Default: false.',
  })
  @IsOptional()
  @IsBoolean()
  skipQuality?: boolean;
}
