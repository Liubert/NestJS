import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
}
