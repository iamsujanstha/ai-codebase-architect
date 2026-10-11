import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service';
import {
  CategoryCountRow,
  CreateProductParams,
  ICatalogRepository,
  ListProductsFilters,
  ProductRow,
} from './catalog.repository.interface';

@Injectable()
export class PostgresCatalogRepository implements ICatalogRepository {
  constructor(private readonly pg: PostgresService) {}

  async getCategoryCounts(): Promise<CategoryCountRow[]> {
    const sql = `
      SELECT category, COUNT(*)::int AS count
      FROM products
      WHERE deleted_at IS NULL
      GROUP BY category
      ORDER BY count DESC;
    `;
    const res = await this.pg.query<CategoryCountRow>(sql);
    return res.rows;
  }

  async findFeatured(limit: number): Promise<ProductRow[]> {
    const sql = `
      SELECT *
      FROM products
      WHERE featured = true AND deleted_at IS NULL
      ORDER BY price DESC
      LIMIT $1;
    `;
    const res = await this.pg.query<ProductRow>(sql, [limit]);
    return res.rows;
  }

  async findNewArrivals(limit: number): Promise<ProductRow[]> {
    const sql = `
      SELECT *
      FROM products
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $1;
    `;
    const res = await this.pg.query<ProductRow>(sql, [limit]);
    return res.rows;
  }

  async findCatalogProducts(limit: number): Promise<ProductRow[]> {
    const sql = `
      SELECT *
      FROM products
      WHERE deleted_at IS NULL
      ORDER BY id ASC
      LIMIT $1;
    `;
    const res = await this.pg.query<ProductRow>(sql, [limit]);
    return res.rows;
  }

  async findPaginated(
    filters: ListProductsFilters,
  ): Promise<{ products: ProductRow[]; total: number }> {
    const conditions: string[] = ['deleted_at IS NULL', "status != 'draft'"];
    const params: any[] = [];

    if (filters.category && filters.category !== 'all') {
      params.push(filters.category);
      conditions.push(`LOWER(category) = LOWER($${params.length})`);
    }

    if (filters.featured !== undefined) {
      params.push(filters.featured);
      conditions.push(`featured = $${params.length}`);
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      const pIdx = params.length;
      conditions.push(
        `(name ILIKE $${pIdx} OR description ILIKE $${pIdx} OR category ILIKE $${pIdx})`,
      );
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total matching rows
    const countSql = `SELECT COUNT(*)::int AS total FROM products ${whereClause};`;
    const countRes = await this.pg.query<{ total: number }>(countSql, params);
    const total = countRes.rows[0]?.total ?? 0;

    // Fetch paginated products
    params.push(filters.limit);
    const limitIdx = params.length;
    params.push(filters.skip);
    const skipIdx = params.length;

    const dataSql = `
      SELECT *
      FROM products
      ${whereClause}
      ORDER BY id ASC
      LIMIT $${limitIdx} OFFSET $${skipIdx};
    `;
    const dataRes = await this.pg.query<ProductRow>(dataSql, params);

    return {
      products: dataRes.rows,
      total,
    };
  }

  async findBySlugOrId(identifier: string | number): Promise<ProductRow | null> {
    const isNumeric = typeof identifier === 'number' || !isNaN(Number(identifier));
    if (isNumeric) {
      return this.findById(Number(identifier));
    }

    const slugStr = identifier.toString().toLowerCase().trim();
    const sql = `
      SELECT *
      FROM products
      WHERE deleted_at IS NULL
        AND (
          LOWER(REPLACE(name, ' ', '-')) = $1
          OR LOWER(sku) = $1
          OR LOWER(name) = $1
        )
      LIMIT 1;
    `;
    const res = await this.pg.query<ProductRow>(sql, [slugStr]);
    return res.rows[0] ?? null;
  }

  async findById(id: number): Promise<ProductRow | null> {
    const sql = `
      SELECT *
      FROM products
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1;
    `;
    const res = await this.pg.query<ProductRow>(sql, [id]);
    return res.rows[0] ?? null;
  }

  async findRelated(category: string, excludeId: number, limit: number): Promise<ProductRow[]> {
    const sql = `
      SELECT *
      FROM products
      WHERE category = $1 AND id != $2 AND deleted_at IS NULL
      LIMIT $3;
    `;
    const res = await this.pg.query<ProductRow>(sql, [category, excludeId, limit]);
    return res.rows;
  }

  async create(params: CreateProductParams): Promise<ProductRow> {
    const sql = `
      INSERT INTO products (name, category, price, stock, description, featured, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
      RETURNING *;
    `;
    const res = await this.pg.query<ProductRow>(sql, [
      params.name,
      params.category,
      params.price,
      params.stock,
      params.description,
      params.featured,
    ]);
    return res.rows[0];
  }
}
