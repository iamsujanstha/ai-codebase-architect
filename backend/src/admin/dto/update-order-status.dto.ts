import { IsString, IsIn } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsString()
  @IsIn(['pending', 'processing', 'paid', 'completed', 'shipped', 'delivered', 'cancelled', 'refunded'])
  status!: string;
}
