import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RetranslateDto {
  @ApiPropertyOptional({
    description: 'Locale code — omit to retranslate all non-default locales',
    example: 'es',
  })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({
    description:
      'Key name — requires locale; omit to retranslate the whole namespace/locale',
    example: 'common.save',
  })
  @IsOptional()
  @IsString()
  key?: string;
}
