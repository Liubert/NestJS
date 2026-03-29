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
    enum: ['green', 'yellow', 'red', 'unchecked'],
  })
  @IsOptional()
  @IsIn(['green', 'yellow', 'red', 'unchecked'])
  qualityLevel?: string;

  @ApiPropertyOptional({ enum: ['key', 'createdAt'], default: 'key' })
  @IsOptional()
  @IsIn(['key', 'createdAt'])
  sortBy: 'key' | 'createdAt' = 'key';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
