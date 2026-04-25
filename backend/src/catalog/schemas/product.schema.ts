import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// A real ecommerce product usually contains a large amount of data.
// For teaching purposes, this schema focuses on the fields that matter most for:
// - merchandising
// - pricing
// - card rendering
// - detail pages
// - cart decisions
//
// Notice that category data is slightly denormalized (`categorySlug`, `categoryName`).
// That is a very normal production tradeoff in read-heavy storefronts:
// duplicate a little data so product reads stay fast and simple.
@Schema({ _id: false })
export class ProductVisual {
  @Prop({ required: true, trim: true })
  gradientFrom!: string;

  @Prop({ required: true, trim: true })
  gradientTo!: string;

  @Prop({ required: true, trim: true })
  accent!: string;

  @Prop({ required: true, trim: true })
  glyph!: string;
}

@Schema({ _id: false })
export class ProductSpec {
  @Prop({ required: true, trim: true })
  label!: string;

  @Prop({ required: true, trim: true })
  value!: string;
}

@Schema({
  collection: 'catalog_products',
  timestamps: true,
})
export class Product {
  @Prop({
    required: true,
    trim: true,
    unique: true,
    index: true,
  })
  slug!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true })
  subtitle!: string;

  @Prop({ required: true, trim: true })
  shortDescription!: string;

  @Prop({ required: true, trim: true })
  description!: string;

  @Prop({ required: true, min: 0 })
  price!: number;

  @Prop({ type: Number, min: 0, default: null })
  compareAtPrice!: number | null;


  @Prop({ required: true, trim: true, default: 'USD' })
  currency!: string;

  // eSewa operates in a Nepal-specific payment context, so we store an explicit
  // NPR selling price rather than performing ad-hoc FX conversion at checkout time.
  // Production systems often keep regional price books for exactly this reason.
  @Prop({ type: Number, min: 0, default: null })
  nprPrice!: number | null;

  @Prop({ required: true, min: 0, max: 5 })
  rating!: number;

  @Prop({ required: true, min: 0 })
  reviewCount!: number;

  @Prop({ required: true, min: 0 })
  inventoryCount!: number;

  @Prop({ required: true, trim: true, index: true })
  categorySlug!: string;

  @Prop({ required: true, trim: true })
  categoryName!: string;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ type: [String], default: [] })
  keyHighlights!: string[];

  @Prop({ required: true, trim: true })
  heroBadge!: string;

  @Prop({ required: true, default: false })
  featured!: boolean;

  @Prop({ required: true, default: false })
  bestSeller!: boolean;

  @Prop({ required: true, default: false })
  newArrival!: boolean;

  @Prop({ type: ProductVisual, required: true })
  visual!: ProductVisual;

  @Prop({ type: [ProductSpec], default: [] })
  specs!: ProductSpec[];
}

export type ProductDocument = HydratedDocument<Product>;

export const ProductSchema = SchemaFactory.createForClass(Product);

ProductSchema.index({ categorySlug: 1, featured: -1, newArrival: -1 });
ProductSchema.index({ name: 'text', subtitle: 'text', tags: 'text' });
