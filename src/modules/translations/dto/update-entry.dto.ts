import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateEntryDto {
  @ApiProperty({
    example: { en: 'Access control', 'nb-NO': 'Adgangskontroll' },
    description: 'Values to upsert per locale code',
  })
  @IsObject()
  values!: Record<string, string>;
}
