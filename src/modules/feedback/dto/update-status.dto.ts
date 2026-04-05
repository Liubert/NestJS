import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { FeedbackStatus } from '../entities/agent-feedback.entity.js';

export class UpdateStatusDto {
  @ApiProperty({
    example: 'planned',
    description: 'New workflow status for the feedback item',
    enum: ['new', 'planned', 'done', 'deferred', 'rejected'],
  })
  @IsIn(['new', 'planned', 'done', 'deferred', 'rejected'])
  status!: FeedbackStatus;

  @ApiPropertyOptional({
    example: 'Covered by bulk_translate_and_save synchronous flow.',
    description: 'Optional reviewer note explaining the status decision',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewerNote?: string;
}
