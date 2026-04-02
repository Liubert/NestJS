import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CheckQualityDto {
  @ApiProperty({
    example: 'Access control',
    description: 'Source English text',
  })
  @IsString()
  @MinLength(1)
  source!: string;

  @ApiProperty({
    example: 'Контроль доступу',
    description: 'Text to evaluate',
  })
  @IsString()
  @MinLength(1)
  translation!: string;

  @ApiProperty({ example: 'uk', description: 'Target locale code' })
  @IsString()
  @MinLength(1)
  locale!: string;

  @ApiPropertyOptional({
    example: 'translation_quality',
    enum: ['translation_quality', 'language_quality'],
    description:
      'translation_quality: compare to source. language_quality: evaluate text standalone.',
  })
  @IsOptional()
  @IsIn(['translation_quality', 'language_quality'])
  mode?: 'translation_quality' | 'language_quality';

  @ApiPropertyOptional({
    example: 'my-project',
    description: 'Project slug for AI usage tracking',
  })
  @IsOptional()
  @IsString()
  projectSlug?: string;

  @ApiPropertyOptional({
    example: 'Button label in expense form footer',
    description:
      'Optional context about where/how this key is used. Helps AI evaluate accuracy for ambiguous terms.',
  })
  @IsOptional()
  @IsString()
  context?: string;
}
