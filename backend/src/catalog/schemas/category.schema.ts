import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// Category documents power the high-level browse experience of the storefront.
// In a production marketplace this collection often feeds:
// - navigation menus
// - merchandising pages
// - campaign landing pages
// - search facets
//
// We keep it intentionally small here, but the shape mirrors real catalog metadata.
@Schema({
  collection: 'catalog_categories',
  timestamps: true,
})
export class Category {
  @Prop({
    required: true,
    trim: true,
    unique: true,
    index: true,
  })
  slug!: string;

  @Prop({
    required: true,
    trim: true,
  })
  name!: string;

  @Prop({
    required: true,
    trim: true,
  })
  description!: string;

  @Prop({
    required: true,
    trim: true,
  })
  accentColor!: string;

  @Prop({
    required: true,
    trim: true,
  })
  icon!: string;

  @Prop({
    required: true,
    trim: true,
  })
  featuredCopy!: string;

  @Prop({
    required: true,
    min: 0,
    default: 0,
  })
  sortOrder!: number;
}

export type CategoryDocument = HydratedDocument<Category>;

export const CategorySchema = SchemaFactory.createForClass(Category);

CategorySchema.index({ sortOrder: 1, name: 1 });
