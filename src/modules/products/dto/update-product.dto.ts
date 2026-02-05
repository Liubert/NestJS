import { IsInt, IsNumberString, IsOptional, Min } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  name?: string;

  @IsOptional()
  @IsNumberString()
  price?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}
