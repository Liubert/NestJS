import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AnalyzeEntryItemDto {
  @ApiProperty({ example: 'button.save' })
  @IsString()
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'key must contain only letters, digits, dots, underscores or dashes',
  })
  @MaxLength(255)
  key!: string;

  @ApiProperty({ example: 'Save changes' })
  @IsString()
  text!: string;

  @ApiPropertyOptional({ example: 'Button on settings page' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  context?: string;
}

export class AnalyzeEntriesDto {
  @ApiProperty({ type: [AnalyzeEntryItemDto] })
  @ValidateNested({ each: true })
  @Type(() => AnalyzeEntryItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  entries!: AnalyzeEntryItemDto[];

  @ApiPropertyOptional({
    example: 'en',
    description: 'Source locale code. Defaults to project default locale.',
  })
  @IsOptional()
  @IsString()
  sourceLocale?: string;
}

export type AnalysisStatus =
  | 'safe_to_create'
  | 'key_exists_same_value'
  | 'key_exists_different_value'
  | 'value_exists_under_other_key'
  | 'duplicate_in_batch'
  | 'needs_manual_review';

export type Recommendation =
  | 'create'
  | 'skip'
  | 'update'
  | 'reuse'
  | 'rename'
  | 'review';

export interface AnalysisConflict {
  reason: string;
  existingKeys?: string[];
  existingValue?: string;
  batchConflictWith?: string;
}

export interface AnalysisItemResult {
  key: string;
  text: string;
  status: AnalysisStatus;
  recommendation: Recommendation;
  conflict?: AnalysisConflict;
}

export interface AnalyzeEntriesResponse {
  sourceLocale: string;
  results: AnalysisItemResult[];
  summary: {
    total: number;
    safeToCreate: number;
    alreadyExistSameValue: number;
    keyConflicts: number;
    sourceTextDuplicates: number;
    batchConflicts: number;
    needsReview: number;
  };
}
