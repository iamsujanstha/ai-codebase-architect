import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentCartItemDto } from './payment-cart-item.dto';

export class PaymentQuoteRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentCartItemDto)
  items!: PaymentCartItemDto[];
}
