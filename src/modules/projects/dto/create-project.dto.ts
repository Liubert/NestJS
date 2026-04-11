import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'my-project' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with dashes',
  })
  @MaxLength(100)
  slug!: string;

  @ApiPropertyOptional({ example: 'My Project' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiProperty({
    example: ['common'],
    description: 'At least one namespace must be provided',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one namespace is required' })
  @IsString({ each: true })
  @Matches(/^[a-z0-9-]+$/, {
    each: true,
    message: 'namespace slugs must be lowercase alphanumeric with dashes',
  })
  namespaces!: string[];
}
