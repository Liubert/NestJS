import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { BaseEntryKeyDto, RequiredValuesDto } from './base-entry.dto.js';

export class BulkImportEntryDto extends IntersectionType(
  BaseEntryKeyDto,
  RequiredValuesDto,
) {}

export class BulkImportDto {
  @ApiProperty({ type: [BulkImportEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportEntryDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  entries!: BulkImportEntryDto[];
}
