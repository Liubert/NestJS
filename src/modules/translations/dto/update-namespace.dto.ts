import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateNamespaceDto {
  @ApiProperty({ example: 'frontend-v2', description: 'New namespace slug' })
  @IsString()
  @MinLength(1)
  slug!: string;
}
