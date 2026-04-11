import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';

export class BulkQualityCheckDto {
  @ApiPropertyOptional({
    example: ['accessControl', 'welcomeMessage'],
    description:
      'List of translation key names to check. When omitted or empty, all keys in the namespace are checked.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(500)
  keys?: string[];
}
