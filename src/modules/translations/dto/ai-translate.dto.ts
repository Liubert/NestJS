import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class AiTranslateDto {
  @ApiProperty({
    example: 'Access control',
    description: 'English UI text to translate',
  })
  @IsString()
  @MinLength(1)
  text!: string;

  @ApiPropertyOptional({
    example: 'my-project',
    description: 'Project slug for AI usage tracking (optional)',
  })
  @IsOptional()
  @IsString()
  projectSlug?: string;
}
