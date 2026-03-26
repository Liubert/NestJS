import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

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
    description: 'Translated text to evaluate',
  })
  @IsString()
  @MinLength(1)
  translation!: string;

  @ApiProperty({ example: 'uk', description: 'Target locale code' })
  @IsString()
  @MinLength(1)
  locale!: string;
}
