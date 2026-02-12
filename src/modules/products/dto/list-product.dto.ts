import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class ListProductsDto {
  // cursor pagination
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  // filters
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @IsString()
  search?: string;

  // price filters
  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'minPrice must be a decimal with up to 2 digits',
  })
  minPrice?: string;

  @IsOptional()
  @Transform(({ value }) => String(value).trim())
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'maxPrice must be a decimal with up to 2 digits',
  })
  maxPrice?: string;
}
