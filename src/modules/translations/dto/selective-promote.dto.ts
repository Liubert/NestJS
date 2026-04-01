import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsString,
  ValidateNested,
} from 'class-validator';

class PromoteKeyDto {
  @ApiProperty({ example: 'common' })
  @IsString()
  namespace!: string;

  @ApiProperty({ example: 'greeting.hello' })
  @IsString()
  key!: string;
}

export class SelectivePromoteDto {
  @ApiProperty({ type: [PromoteKeyDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PromoteKeyDto)
  keys!: PromoteKeyDto[];
}
