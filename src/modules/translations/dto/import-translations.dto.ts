import { IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportTranslationsDto {
  @ApiProperty({
    example: 'travis',
    description: 'Unique project identifier (slug)',
  })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'projectSlug must be lowercase alphanumeric with dashes',
  })
  projectSlug!: string;

  @ApiPropertyOptional({
    example: 'TRAVIS',
    description: 'Human-readable project name',
  })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional({ example: 'en', description: 'Default locale code' })
  @IsOptional()
  @IsString()
  defaultLocale?: string;
}
