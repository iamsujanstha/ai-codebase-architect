import { IsNotEmpty, IsNumber, IsString, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

class ProductVisualDto {
  @IsString()
  gradientFrom!: string;

  @IsString()
  gradientTo!: string;

  @IsString()
  accent!: string;

  @IsString()
  glyph!: string;
}

class ProductSpecDto {
  @IsString()
  label!: string;

  @IsString()
  value!: string;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  subtitle!: string;

  @IsString()
  @IsNotEmpty()
  shortDescription!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  price!: number;

  @IsString()
  categorySlug!: string;

  @IsString()
  categoryName!: string;

  @IsString()
  heroBadge!: string;

  @ValidateNested()
  @Type(() => ProductVisualDto)
  visual!: ProductVisualDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductSpecDto)
  @IsOptional()
  specs?: ProductSpecDto[];
}
