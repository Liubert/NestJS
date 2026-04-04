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
      'Translation guidance for AI — formality, plural rules, style notes',
    example: 'Use formal "vi". Avoid anglicisms.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(3000)
  guidance?: string;
}
