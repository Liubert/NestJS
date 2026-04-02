import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class UpdateLocaleDto {
  @ApiPropertyOptional({
    example: ['ua', 'ukr'],
    description: 'Alternative codes / aliases for this locale',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[];
}
