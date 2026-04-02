import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEntryDto {
  @ApiProperty({
    example: { en: 'Access control', 'nb-NO': 'Adgangskontroll' },
    description: 'Values to upsert per locale code',
  })
  @IsObject()
  values!: Record<string, string>;

  @ApiPropertyOptional({
    example: 'Button label on the settings page',
    description:
      'Short context describing where/how the key is used (max 500 chars)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  context?: string;
}
