import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewFeedbackDto {
  @ApiProperty({ example: true, description: 'Mark as reviewed or unreviewed' })
  @IsBoolean()
  reviewed!: boolean;

  @ApiPropertyOptional({
    example: 'Fixed in v1.3.0',
    description: 'Optional reviewer note',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewerNote?: string;
}
