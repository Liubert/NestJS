import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class PreviewPromptDto {
  @ApiProperty({
    example: 'translate',
    enum: ['translate', 'quality'],
    description: 'Type of prompt to preview: translate or quality check.',
  })
  @IsIn(['translate', 'quality'])
  type!: 'translate' | 'quality';

  @ApiProperty({
    example: 'Access control',
    description: 'Source English text to use in the prompt.',
  })
  @IsString()
  text!: string;

  @ApiPropertyOptional({
    example: { uk: 'Ukrainian', sv: 'Swedish' },
    description:
      'Locale code to locale name map. Used for translate type. Defaults to {"uk": "Ukrainian"} if omitted.',
  })
  @IsOptional()
  targetLocales?: Record<string, string>;

  @ApiPropertyOptional({
    example: { uk: 'Use informal tone', sv: 'Keep formal register' },
    description: 'Locale code to guidance string map (localeSkill).',
  })
  @IsOptional()
  localeSkill?: Record<string, string>;

  @ApiPropertyOptional({
    example: 'Button label in checkout flow',
    description: 'Optional context about where this key is used.',
  })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiPropertyOptional({
    example: 'uk',
    description: 'Target locale code. Required for quality type.',
  })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({
    example: 'Контроль доступу',
    description: 'Translation text to evaluate. Required for quality type.',
  })
  @IsOptional()
  @IsString()
  translation?: string;

  @ApiPropertyOptional({
    example: 'translation_quality',
    enum: ['translation_quality', 'language_quality'],
    description: 'Quality check sub-mode. Defaults to translation_quality.',
  })
  @IsOptional()
  @IsIn(['translation_quality', 'language_quality'])
  mode?: 'translation_quality' | 'language_quality';
}
