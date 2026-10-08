import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CheckoutCustomerDto } from './checkout-customer.dto';
import { PaymentCartItemDto } from './payment-cart-item.dto';

export class CreatePaymentSessionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentCartItemDto)
  items!: PaymentCartItemDto[];

  @ValidateNested()
  @Type(() => CheckoutCustomerDto)
  customer!: CheckoutCustomerDto;
}
