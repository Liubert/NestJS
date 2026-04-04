import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateLocaleDto {
  @ApiProperty({ example: 'uk' })
  @IsString()
  @Matches(/^[a-z]{2,3}(-[A-Z]{2,4})?$/, {
    message: 'code must be a valid locale code (e.g. en, nb-NO, uk)',
  })
  code!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({
    example: ['en-US', 'en-GB'],
    description: 'Alternative locale codes that map to this language',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];

  @ApiPropertyOptional({
    description:
      'Language-specific translation guide for AI — style, tone, grammar rules, anti-patterns, common mistakes, wording preferences. Supports up to ~500 words.',
    example:
      'Use formal "ви" (not "ти"). Avoid anglicisms when Ukrainian equivalents exist. 3 plural forms: 1 елемент, 2 елементи, 5 елементів.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  guidance?: string;
}
