import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class CreateLocaleDto {
  @ApiProperty({ example: 'uk' })
  @IsString()
  @Matches(/^[a-z]{2,3}(-[A-Z]{2,4})?$/, {
    message: 'code must be a valid locale code (e.g. en, nb-NO, uk)',
  })
  code!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
