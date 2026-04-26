import { Controller, Get, Param, Query, Post, Body } from '@nestjs/common';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { CatalogService } from './catalog.service';

// Controllers define the HTTP surface area of the catalog feature.
// We keep them intentionally thin so the important logic stays testable in the service layer.
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('home')
  async getHomePage() {
    return this.catalogService.getHomePage();
  }

  @Get('categories')
  async listCategories() {
    return this.catalogService.listCategories();
  }

  @Get('products')
  async listProducts(@Query() query: ListProductsQueryDto) {
    return this.catalogService.listProducts(query);
  }

  @Get('products/:slug')
  async getProduct(@Param('slug') slug: string) {
    return this.catalogService.getProductBySlug(slug);
  }

  @Post('products')
  async createProduct(@Body() createProductDto: any) {
    return this.catalogService.createProduct(createProductDto);
  }

  @Post('seed')
  async seedProducts(@Body('count') count?: number) {
    return this.catalogService.seedProducts(count);
  }
}
