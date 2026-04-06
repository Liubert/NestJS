import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
} from 'class-validator';

export class BatchTranslateDto {
  @ApiProperty({
    example: ['accessControl', 'welcomeMessage'],
    description: 'List of translation keys to AI-translate',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  keys!: string[];

  @ApiPropertyOptional({
    example: ['da', 'nb'],
    description:
      'Target locale codes. If omitted, translates to all non-default locales.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetLocales?: string[];
}
