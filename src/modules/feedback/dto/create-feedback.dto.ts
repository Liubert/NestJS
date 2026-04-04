import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFeedbackDto {
  @ApiProperty({
    example: 'bug',
    description: 'Feedback category',
    enum: ['bug', 'confusion', 'missing_feature', 'suggestion', 'other'],
  })
  @IsIn(['bug', 'confusion', 'missing_feature', 'suggestion', 'other'])
  category!: string;

  @ApiProperty({
    example: 'The endpoint returned 500 when slug has special chars',
    description: 'Detailed feedback message',
  })
  @IsString()
  @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional({
    example: 'POST /translations/ai-translate',
    description: 'Tool or endpoint involved',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  toolOrEndpoint?: string;

  @ApiPropertyOptional({
    example: 'Tried to translate 50 keys at once',
    description: 'What was attempted',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  actionAttempted?: string;

  @ApiPropertyOptional({
    example: 'failed',
    description: 'Outcome of the action',
    enum: ['failed', 'partial', 'confusing', 'success'],
  })
  @IsOptional()
  @IsIn(['failed', 'partial', 'confusing', 'success'])
  resultStatus?: string;

  @ApiPropertyOptional({
    example: 'medium',
    description: 'Impact severity',
    enum: ['low', 'medium', 'high'],
  })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  severity?: string;

  @ApiPropertyOptional({
    example: 'Add batch size limit validation',
    description: 'Suggested fix or improvement',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  suggestion?: string;

  @ApiPropertyOptional({
    example: 'my-app',
    description: 'Related project slug',
  })
  @IsOptional()
  @IsString()
  projectSlug?: string;

  @ApiPropertyOptional({
    example: 'claude-code',
    description: 'Agent or tool name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  agentName?: string;

  @ApiPropertyOptional({
    example: '1.2.0',
    description: 'Agent or tool version',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  agentVersion?: string;

  @ApiPropertyOptional({
    example: 'sess_abc123',
    description: 'Session identifier',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sessionId?: string;
}
