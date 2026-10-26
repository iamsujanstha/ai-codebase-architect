import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/users.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdateStockDto } from './dto/update-stock.dto';

@Controller(['admin', 'api/admin'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // -----------------------------------------------------------
  // 1. GET /api/admin/stats
  // -----------------------------------------------------------
  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('dashboard/stats')
  async getDashboardStats() {
    return this.adminService.getStats();
  }

  // -----------------------------------------------------------
  // 2. GET /api/admin/products
  // -----------------------------------------------------------
  @Get('products')
  async getProducts(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getProducts({
      status,
      q: q || search,
      sort,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize
        ? parseInt(pageSize, 10)
        : limit
          ? parseInt(limit, 10)
          : 10,
    });
  }

  // -----------------------------------------------------------
  // 3. POST /api/admin/products
  // -----------------------------------------------------------
  @Post('products')
  async createProduct(@Body() createProductDto: CreateProductDto) {
    return this.adminService.createProduct(createProductDto);
  }

  // -----------------------------------------------------------
  // 4. PATCH & PUT /api/admin/products/:id
  // -----------------------------------------------------------
  @Patch('products/:id')
  async updateProductPatch(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.adminService.updateProduct(id, updateProductDto);
  }

  @Put('products/:id')
  async updateProductPut(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.adminService.updateProduct(id, updateProductDto);
  }

  // -----------------------------------------------------------
  // 5. DELETE /api/admin/products/:id
  // -----------------------------------------------------------
  @Delete('products/:id')
  async deleteProduct(@Param('id') id: string) {
    return this.adminService.softDeleteProduct(id);
  }

  // -----------------------------------------------------------
  // 6. POST /api/admin/uploads
  // -----------------------------------------------------------
  @Post('uploads')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadDir = './uploads';
          if (!existsSync(uploadDir)) {
            mkdirSync(uploadDir, { recursive: true });
          }
          cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname) || '.webp';
          cb(null, `product-${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|webp|gif|svg\+xml)$/)) {
          return cb(
            new BadRequestException(
              'Only image files (jpeg, png, webp, gif, svg) are allowed',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadProductImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Image file is required');
    }
    return { url: `/uploads/${file.filename}` };
  }

  // -----------------------------------------------------------
  // 7. GET /api/admin/users
  // -----------------------------------------------------------
  @Get('users')
  async getUsers(
    @Query('role') role?: string,
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getUsers({
      role,
      q: q || search,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize
        ? parseInt(pageSize, 10)
        : limit
          ? parseInt(limit, 10)
          : 10,
    });
  }

  // -----------------------------------------------------------
  // 8. PATCH /api/admin/users/:id/role
  // -----------------------------------------------------------
  @Patch('users/:id/role')
  async updateUserRole(
    @Req() req: any,
    @Param('id') targetUserId: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    const currentAdminId = req.user?._id?.toString() || req.user?.id;
    if (String(currentAdminId) === String(targetUserId)) {
      throw new BadRequestException('Cannot change your own role');
    }
    return this.adminService.updateUserRole(
      currentAdminId,
      targetUserId,
      dto.role,
    );
  }

  // -----------------------------------------------------------
  // 9. PATCH /api/admin/users/:id/status
  // -----------------------------------------------------------
  @Patch('users/:id/status')
  async updateUserStatus(
    @Req() req: any,
    @Param('id') targetUserId: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    const currentAdminId = req.user?._id?.toString() || req.user?.id;
    if (String(currentAdminId) === String(targetUserId)) {
      throw new BadRequestException('Cannot suspend your own account');
    }
    return this.adminService.updateUserStatus(
      currentAdminId,
      targetUserId,
      dto.status,
    );
  }

  // -----------------------------------------------------------
  // Additional backward-compatible routes
  // -----------------------------------------------------------
  @Get('products/:id')
  async getProductById(@Param('id') id: string) {
    return this.adminService.getProductById(id);
  }

  @Put('products/:id/stock')
  async updateProductStock(
    @Param('id') id: string,
    @Body() updateStockDto: UpdateStockDto,
  ) {
    return this.adminService.updateProductStock(
      id,
      updateStockDto.inventoryCount,
    );
  }

  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Put('users/:id')
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.adminService.updateUser(id, updateUserDto);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Get('orders')
  async getAllOrders(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.adminService.getAllOrders(
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      status,
      userId,
    );
  }

  @Get('users/:userId/orders')
  async getUserOrders(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getUserOrders(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      status,
    );
  }

  @Get('orders/:id')
  async getOrderById(@Param('id') id: string) {
    return this.adminService.getOrderById(id);
  }

  @Put('orders/:id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body() updateOrderStatusDto: UpdateOrderStatusDto,
  ) {
    return this.adminService.updateOrderStatus(id, updateOrderStatusDto);
  }

  @Get('categories')
  async getAllCategories() {
    return this.adminService.getAllCategories();
  }

  @Post('categories')
  async createCategory(@Body() categoryData: any) {
    return this.adminService.createCategory(categoryData);
  }

  @Put('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() categoryData: any) {
    return this.adminService.updateCategory(id, categoryData);
  }

  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string) {
    return this.adminService.deleteCategory(id);
  }
}
