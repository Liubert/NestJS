import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { PaginationDto } from '../../../common/dto/pagination.dto.js';

export class DiffQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    example: 'common',
    description: 'Filter to a specific namespace',
  })
  @IsOptional()
  @IsString()
  namespace?: string;

  @ApiPropertyOptional({
    example: 'en',
    description: 'Filter to a specific locale',
  })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({
    example: 'changed',
    enum: ['added', 'changed', 'deleted'],
    description: 'Filter by change type',
  })
  @IsOptional()
  @IsIn(['added', 'changed', 'deleted'])
  status?: 'added' | 'changed' | 'deleted';
}
