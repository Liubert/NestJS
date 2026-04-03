import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class BatchRevertDto {
  @ApiProperty({
    example: ['accessControl', 'welcomeMessage'],
    description: 'List of translation keys to revert to production values',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  keys!: string[];
}
