// Response interfaces document the stable contract the frontend consumes.
// In larger teams this is the "API language" shared between backend and frontend engineers.
export interface CatalogCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  accentColor: string;
  icon: string;
  featuredCopy: string;
  productCount: number;
}
