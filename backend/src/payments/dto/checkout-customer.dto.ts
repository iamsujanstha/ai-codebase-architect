import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// We collect a small, merchant-owned customer record before redirecting
// to a payment provider. This gives us an internal order context even if the
// customer never returns to the success page.
export class CheckoutCustomerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string;
}
