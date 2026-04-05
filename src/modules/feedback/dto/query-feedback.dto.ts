import { IsIn, IsOptional, IsString, Max } from 'class-validator';
import type { FeedbackStatus } from '../entities/agent-feedback.entity.js';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

export class QueryFeedbackDto {
  @ApiPropertyOptional({
    example: 'bug',
    enum: ['bug', 'confusion', 'missing_feature', 'suggestion', 'other'],
  })
  @IsOptional()
  @IsIn(['bug', 'confusion', 'missing_feature', 'suggestion', 'other'])
  category?: string;

  @ApiPropertyOptional({
    example: 'my-app',
    description: 'Filter by project slug',
  })
  @IsOptional()
  @IsString()
  projectSlug?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'Filter by reviewed status',
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  reviewed?: boolean;

  @ApiPropertyOptional({
    example: 'high',
    enum: ['low', 'medium', 'high'],
  })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  severity?: string;

  @ApiPropertyOptional({
    example: 'new',
    description: 'Filter by workflow status',
    enum: ['new', 'planned', 'done', 'deferred', 'rejected'],
  })
  @IsOptional()
  @IsIn(['new', 'planned', 'done', 'deferred', 'rejected'])
  status?: FeedbackStatus;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @Max(100)
  limit?: number = 20;
}
