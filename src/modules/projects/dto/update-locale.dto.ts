import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateLocaleDto {
  @ApiPropertyOptional({
    example: ['ua', 'ukr'],
    description: 'Alternative codes / aliases for this locale',
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
  localeSkill?: string;
}
