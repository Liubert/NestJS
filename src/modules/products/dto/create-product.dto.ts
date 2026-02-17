import { IsInt, IsNotEmpty, IsNumberString, Min } from 'class-validator';

export class CreateProductDto {
  @IsNotEmpty()
  name!: string;

  @IsNumberString()
  price!: string;

  @IsInt()
  @Min(0)
  stock!: number;
}
