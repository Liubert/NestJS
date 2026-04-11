import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class BulkDeleteDto {
  @ApiProperty({
    example: ['accessControl', 'welcomeMessage'],
    description: 'List of translation keys to delete',
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  keys!: string[];
}
