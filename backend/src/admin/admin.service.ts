import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Product, ProductDocument } from '../catalog/schemas/product.schema';
import { Category, CategoryDocument } from '../catalog/schemas/category.schema';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
  ) {}

  // Dashboard Statistics
  async getDashboardStats() {
    const [
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenue,
      recentOrders,
      lowStockProducts,
      topProducts,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.productModel.countDocuments(),
      this.orderModel.countDocuments(),
      this.calculateTotalRevenue(),
      this.orderModel.find().sort({ createdAt: -1 }).limit(10).lean(),
      this.productModel.find({ inventoryCount: { $lte: 10 } }).limit(10).lean(),
      this.getTopSellingProducts(),
    ]);

    const ordersByStatus = await this.orderModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    return {
      totalUsers,
      totalProducts,
      totalOrders,
      totalRevenue,
      ordersByStatus: ordersByStatus.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      recentOrders,
      lowStockProducts,
      topProducts,
    };
  }

  private async calculateTotalRevenue(): Promise<number> {
    const result = await this.orderModel.aggregate([
      { $match: { status: { $in: ['completed', 'paid'] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);
    return result[0]?.total || 0;
  }

  private async getTopSellingProducts() {
    return this.orderModel.aggregate([
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          productName: { $first: '$items.productName' },
          totalSold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.lineTotal' },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
    ]);
  }

  // User Management
  async getAllUsers(page: number = 1, limit: number = 20, search?: string): Promise<{
    users: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .select('+password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(query),
    ]);

    return {
      users: users.map((user) => ({
        ...user,
        password: undefined,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserById(userId: string) {
    const user = await this.userModel.findById(userId).lean();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const orders = await this.orderModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const orderStats = await this.orderModel.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$total' },
        },
      },
    ]);

    return {
      user,
      orders,
      stats: orderStats[0] || { totalOrders: 0, totalSpent: 0 },
    };
  }

  async updateUser(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      { $set: updateUserDto },
      { new: true },
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async deleteUser(userId: string) {
    const user = await this.userModel.findByIdAndDelete(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return { message: 'User deleted successfully' };
  }

  // Product Management
  async getAllProducts(page: number = 1, limit: number = 20, search?: string, category?: string) {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    if (category) {
      query.categorySlug = category;
    }

    const [products, total] = await Promise.all([
      this.productModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.productModel.countDocuments(query),
    ]);

    return {
      products,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getProductById(productId: string) {
    const product = await this.productModel.findById(productId).lean();
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }

  async createProduct(createProductDto: CreateProductDto) {
    const slug = createProductDto.name
      .toLowerCase()
      .replace(/ /g, '-')
      .replace(/[^\w-]+/g, '');

    const existingProduct = await this.productModel.findOne({ slug });
    if (existingProduct) {
      throw new BadRequestException('Product with this name already exists');
    }

    const product = new this.productModel({
      ...createProductDto,
      slug,
    });

    return product.save();
  }

  async updateProduct(productId: string, updateProductDto: UpdateProductDto) {
    const product = await this.productModel.findByIdAndUpdate(
      productId,
      { $set: updateProductDto },
      { new: true },
    );

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async deleteProduct(productId: string) {
    const product = await this.productModel.findByIdAndDelete(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return { message: 'Product deleted successfully' };
  }

  async updateProductStock(productId: string, inventoryCount: number) {
    const product = await this.productModel.findByIdAndUpdate(
      productId,
      { $set: { inventoryCount } },
      { new: true },
    );

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  // Order Management
  async getAllOrders(page: number = 1, limit: number = 20, status?: string, userId?: string) {
    const skip = (page - 1) * limit;
    const query: any = {};
    
    if (status) {
      query.status = status;
    }
    
    if (userId) {
      query.userId = userId;
    }

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments(query),
    ]);

    return {
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getUserOrders(userId: string, page: number = 1, limit: number = 20, status?: string) {
    const skip = (page - 1) * limit;
    const query: any = { userId };
    
    if (status) {
      query.status = status;
    }

    const [orders, total] = await Promise.all([
      this.orderModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.orderModel.countDocuments(query),
    ]);

    return {
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getOrderById(orderId: string) {
    const order = await this.orderModel.findById(orderId).lean();
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const user = await this.userModel.findById(order.userId).lean();

    return {
      order,
      user,
    };
  }

  async updateOrderStatus(orderId: string, updateOrderStatusDto: UpdateOrderStatusDto) {
    const order = await this.orderModel.findByIdAndUpdate(
      orderId,
      { $set: { status: updateOrderStatusDto.status } },
      { new: true },
    );

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  // Category Management
  async getAllCategories() {
    return this.categoryModel.find().sort({ sortOrder: 1 }).lean();
  }

  async createCategory(categoryData: any) {
    const slug = categoryData.name
      .toLowerCase()
      .replace(/ /g, '-')
      .replace(/[^\w-]+/g, '');

    const category = new this.categoryModel({
      ...categoryData,
      slug,
    });

    return category.save();
  }

  async updateCategory(categoryId: string, categoryData: any) {
    const category = await this.categoryModel.findByIdAndUpdate(
      categoryId,
      { $set: categoryData },
      { new: true },
    );

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async deleteCategory(categoryId: string) {
    const category = await this.categoryModel.findByIdAndDelete(categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return { message: 'Category deleted successfully' };
  }
}
