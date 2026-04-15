import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

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
      'Locale codes array — alternative to single locale, retranslate multiple locales in one request',
    example: ['es', 'fr', 'de'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  locales?: string[];

  @ApiPropertyOptional({
    description:
      'Key name — requires locale/locales; omit to retranslate the whole namespace/locale',
    example: 'common.save',
  })
  @IsOptional()
  @IsString()
  key?: string;
}
