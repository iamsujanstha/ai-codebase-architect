import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class PaymentCartItemDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  quantity!: number;
}

