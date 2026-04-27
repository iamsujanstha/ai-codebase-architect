import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrdersService, CreateOrderDto } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Create a new order for the authenticated user.
   * The payment provider (Stripe/eSewa) calls back to update status separately.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@Request() req: any, @Body() dto: CreateOrderDto) {
    return this.ordersService.createOrder(req.user.id, req.user.email, dto);
  }

  /**
   * Return all orders belonging to the currently logged-in user.
   */
  @Get('my')
  async getMyOrders(@Request() req: any) {
    return this.ordersService.getOrdersByUser(req.user.id);
  }

  /**
   * Return a single order by ID (must belong to the requesting user).
   */
  @Get(':id')
  async getOrder(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.getOrderById(id, req.user.id);
  }
}
