import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto.js';

export class ListEntriesQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Search in key name or any translation value',
    example: 'access',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  search?: string;

  @ApiPropertyOptional({
    description: 'Restrict value search to a specific locale',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  searchLocale?: string;

  @ApiPropertyOptional({
    description: 'Filter by quality level',
    enum: ['green', 'yellow', 'red', 'unchecked', 'needs_context', 'expected'],
  })
  @IsOptional()
  @IsIn(['green', 'yellow', 'red', 'unchecked', 'needs_context', 'expected'])
  qualityLevel?: string;

  @ApiPropertyOptional({
    description: 'Filter by quality review state',
    enum: [
      'checked',
      'not_checked',
      'skipped',
      'failed',
      'expected',
      'queued',
      'processing',
    ],
  })
  @IsOptional()
  @IsIn([
    'checked',
    'not_checked',
    'skipped',
    'failed',
    'expected',
    'queued',
    'processing',
  ])
  reviewState?: string;

  @ApiPropertyOptional({
    enum: ['key', 'createdAt', 'qualityScore'],
    default: 'key',
  })
  @IsOptional()
  @IsIn(['key', 'createdAt', 'qualityScore'])
  sortBy: 'key' | 'createdAt' | 'qualityScore' = 'key';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({
    description: 'Filter to keys missing a value for the specified locale',
    example: 'nb',
  })
  @IsOptional()
  @IsString()
  missingLocale?: string;
}
