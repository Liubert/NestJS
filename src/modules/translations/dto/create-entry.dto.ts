import { IntersectionType } from '@nestjs/swagger';
import { BaseEntryKeyDto, OptionalValuesDto } from './base-entry.dto.js';

export class CreateEntryDto extends IntersectionType(
  BaseEntryKeyDto,
  OptionalValuesDto,
) {}
