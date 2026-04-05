import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { FeedbackStatus } from '../entities/agent-feedback.entity.js';

export class UpdateStatusDto {
  @ApiProperty({
    example: 'planned',
    description: 'New workflow status for the feedback item',
    enum: ['new', 'planned', 'done', 'deferred', 'rejected'],
  })
  @IsIn(['new', 'planned', 'done', 'deferred', 'rejected'])
  status!: FeedbackStatus;
}
