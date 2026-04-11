import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class BulkQualityCheckAiDto {
  @ApiProperty({
    example: 'Save',
    description: 'Source English text',
  })
  @IsString()
  @MinLength(1)
  source!: string;

  @ApiProperty({
    example: { uk: 'Зберегти', de: 'Speichern' },
    description: 'Locale-to-translation map to evaluate',
  })
  @IsObject()
  translations!: Record<string, string>;

  @ApiPropertyOptional({
    example: 'my-project',
    description: 'Project slug for AI usage tracking and locale guidance',
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
  @MaxLength(1000)
  context?: string;
}
