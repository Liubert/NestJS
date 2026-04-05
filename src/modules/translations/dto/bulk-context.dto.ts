import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class BulkContextItemDto {
  @ApiProperty({
    example: 'accessControl',
    description: 'Translation key name.',
  })
  @IsString()
  key!: string;

  @ApiProperty({
    example: 'Used in the access control settings panel header.',
    description:
      'Context description for the translation key (max 1000 chars).',
  })
  @IsString()
  @MaxLength(1000)
  context!: string;
}

export class BulkContextUpdateDto {
  @ApiProperty({
    type: [BulkContextItemDto],
    description: 'List of key-context pairs to update (1–500 items).',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkContextItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  updates!: BulkContextItemDto[];
}
