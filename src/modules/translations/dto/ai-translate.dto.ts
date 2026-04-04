import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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

  @ApiPropertyOptional({
    example: 'Button label in user permissions settings page',
    description:
      'Optional context to improve translation quality (e.g. where the text appears in UI)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  context?: string;

  @ApiPropertyOptional({
    example: ['uk', 'nb', 'sv'],
    description:
      'Target locale codes to translate into. If omitted, uses default set.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetLocales?: string[];
}
