import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AiTranslateDto {
  @ApiProperty({
    example: 'Access control',
    description: 'English UI text to translate',
  })
  @IsString()
  @MinLength(1)
  text!: string;
}
