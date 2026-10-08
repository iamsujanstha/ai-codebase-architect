import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  subtitle?: string;

  @IsString()
  @IsOptional()
  shortDescription?: string;

  @IsString()
  description!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  compareAtPrice?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsNumber()
  @Min(0)
  inventoryCount!: number;

  @IsString()
  categorySlug!: string;

  @IsString()
  categoryName!: string;

  @IsArray()
  @IsOptional()
  tags?: string[];

  @IsArray()
  @IsOptional()
  keyHighlights?: string[];

  @IsString()
  @IsOptional()
  heroBadge?: string;

  @IsBoolean()
  @IsOptional()
  featured?: boolean;

  @IsBoolean()
  @IsOptional()
  bestSeller?: boolean;

  @IsBoolean()
  @IsOptional()
  newArrival?: boolean;

  @IsOptional()
  visual?: {
    gradientFrom: string;
    gradientTo: string;
    accent: string;
    glyph: string;
  };

  @IsArray()
  @IsOptional()
  specs?: Array<{ label: string; value: string }>;

  @IsNumber()
  @IsOptional()
  @Min(0)
  rating?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  reviewCount?: number;
}
