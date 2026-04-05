import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class BulkMarkExpectedDto {
  @ApiProperty({
    example: ['accessControl', 'welcomeMessage'],
    description: 'List of translation key names to mark as expected.',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  keys!: string[];

  @ApiPropertyOptional({
    example: 'uk',
    description:
      'Locale code to mark as expected. When omitted, all locales for each key are marked.',
  })
  @IsOptional()
  @IsString()
  locale?: string;
}
