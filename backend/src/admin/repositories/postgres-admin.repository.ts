import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service';
import {
  AdminStatsData,
  IAdminRepository,
} from './admin.repository.interface';

@Injectable()
export class PostgresAdminRepository implements IAdminRepository {
  constructor(private readonly pg: PostgresService) {}

  async getStatsData(): Promise<AdminStatsData> {
    const [
      prodCountRes,
      publishedCountRes,
      userCountRes,
      orderCountRes,
      revenueRes,
      recentUsersRes,
      lowStockRes,
      orders7DaysRes,
    ] = await Promise.all([
      this.pg.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM products WHERE deleted_at IS NULL;',
      ),
      this.pg.query<{ count: number }>(
        "SELECT COUNT(*)::int AS count FROM products WHERE deleted_at IS NULL AND status != 'draft';",
      ),
      this.pg.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users;'),
      this.pg.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM orders;'),
      this.pg.query<{ total: string }>(
        `SELECT COALESCE(SUM(total_amount), 0) AS total
         FROM orders
         WHERE created_at >= NOW() - INTERVAL '30 days'
           AND status IN ('completed', 'paid');`,
      ),
      this.pg.query<{
        id: number;
        name: string;
        email: string;
        role: string;
        created_at: Date;
      }>(
        `SELECT id, name, email, role, created_at
         FROM users
         ORDER BY created_at DESC
         LIMIT 4;`,
      ),
      this.pg.query(
        'SELECT * FROM products WHERE deleted_at IS NULL AND stock <= 5 LIMIT 10;',
      ),
      this.pg.query<{ total_amount: string | number; created_at: Date }>(
        `SELECT total_amount, created_at
         FROM orders
         WHERE created_at >= NOW() - INTERVAL '7 days'
           AND status IN ('completed', 'paid');`,
      ),
    ]);

    const totalProducts = Number(prodCountRes.rows[0]?.count || 0);
    const publishedProducts = Number(publishedCountRes.rows[0]?.count || 0);
    const totalUsers = Number(userCountRes.rows[0]?.count || 0);
    const totalOrders = Number(orderCountRes.rows[0]?.count || 0);
    const totalDec = revenueRes.rows[0]?.total || '0';
    const revenue30Days = Math.round(Number(totalDec) * 100);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    const orders7Days = orders7DaysRes.rows;

    const sales7Days: Array<{ day: string; date: string; sales: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const dayTotal = orders7Days
        .filter(
          (o) =>
            o.created_at &&
            new Date(o.created_at).toISOString().split('T')[0] === dateStr,
        )
        .reduce((acc, o) => acc + Number(o.total_amount), 0);

      sales7Days.push({
        day: days[d.getDay()],
        date: dateStr,
        sales: Math.round(dayTotal * 100),
      });
    }

    return {
      totalProducts,
      publishedProducts,
      totalUsers,
      totalOrders,
      revenue30Days,
      sales7Days,
      recentUsers: recentUsersRes.rows,
      lowStockProducts: lowStockRes.rows,
    };
  }

  async getProducts(params: {
    status?: string;
    q?: string;
    sort?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: any[];
    total: number;
    countAll: number;
    countPublished: number;
    countDraft: number;
  }> {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.max(1, Number(params.pageSize) || 10);
    const skip = (page - 1) * pageSize;

    const whereClauses: string[] = ['deleted_at IS NULL'];
    const values: any[] = [];
    let idx = 1;

    if (params.status && params.status !== 'all') {
      if (params.status === 'published' || params.status === 'live') {
        whereClauses.push("status != 'draft'");
      } else if (params.status === 'draft') {
        whereClauses.push("status = 'draft'");
      }
    }

    if (params.q) {
      const q = `%${params.q.trim()}%`;
      whereClauses.push(
        `(name ILIKE $${idx} OR sku ILIKE $${idx} OR category ILIKE $${idx})`,
      );
      values.push(q);
      idx++;
    }

    let sortCol = 'created_at';
    let sortDir = 'DESC';
    if (params.sort) {
      const isDesc = params.sort.startsWith('-');
      const field = isDesc ? params.sort.substring(1) : params.sort;
      sortDir = isDesc ? 'DESC' : 'ASC';
      if (field === 'title') sortCol = 'name';
      else if (field === 'cat' || field === 'category') sortCol = 'category';
      else if (field === 'price') sortCol = 'price';
      else if (field === 'stock') sortCol = 'stock';
      else if (field === 'status') sortCol = 'status';
    }

    const whereSql = whereClauses.join(' AND ');

    const [itemsRes, totalRes, allRes, publishedRes, draftRes] =
      await Promise.all([
        this.pg.query(
          `SELECT * FROM products WHERE ${whereSql} ORDER BY ${sortCol} ${sortDir} LIMIT $${idx} OFFSET $${idx + 1};`,
          [...values, pageSize, skip],
        ),
        this.pg.query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM products WHERE ${whereSql};`,
          values,
        ),
        this.pg.query<{ count: number }>(
          'SELECT COUNT(*)::int AS count FROM products WHERE deleted_at IS NULL;',
        ),
        this.pg.query<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM products WHERE deleted_at IS NULL AND status != 'draft';",
        ),
        this.pg.query<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM products WHERE deleted_at IS NULL AND status = 'draft';",
        ),
      ]);

    return {
      items: itemsRes.rows,
      total: Number(totalRes.rows[0]?.count || 0),
      countAll: Number(allRes.rows[0]?.count || 0),
      countPublished: Number(publishedRes.rows[0]?.count || 0),
      countDraft: Number(draftRes.rows[0]?.count || 0),
    };
  }

  async createProduct(data: any): Promise<any> {
    const sql = `
      INSERT INTO products (name, description, price, category, stock, image_url, featured, status, sku, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *;
    `;
    const res = await this.pg.query(sql, [
      data.name,
      data.description ?? null,
      data.price,
      data.category,
      data.stock ?? 0,
      data.image_url ?? null,
      data.featured ?? false,
      data.status || 'published',
      data.sku ?? null,
    ]);
    return res.rows[0];
  }

  async findProductById(id: number): Promise<any | null> {
    const res = await this.pg.query('SELECT * FROM products WHERE id = $1;', [
      id,
    ]);
    return res.rows[0] ?? null;
  }

  async updateProduct(id: number, data: any): Promise<any> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(val);
      }
    }

    values.push(id);
    const sql = `
      UPDATE products
      SET ${setClauses.join(', ')}
      WHERE id = $${idx}
      RETURNING *;
    `;
    const res = await this.pg.query(sql, values);
    return res.rows[0];
  }

  async getUsers(params: {
    role?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: any[]; total: number }> {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.max(1, Number(params.pageSize) || 10);
    const skip = (page - 1) * pageSize;

    const whereClauses: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (params.role && params.role !== 'all') {
      if (params.role === 'customer') {
        whereClauses.push("u.role IN ('customer', 'user')");
      } else {
        whereClauses.push(`u.role = $${idx++}`);
        values.push(params.role);
      }
    }

    if (params.q) {
      const q = `%${params.q.trim()}%`;
      whereClauses.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx})`);
      values.push(q);
      idx++;
    }

    const whereSql = whereClauses.join(' AND ');

    const [usersRes, totalRes] = await Promise.all([
      this.pg.query(
        `SELECT u.id, u.name, u.email, u.role, u.is_active, u.status, u.created_at,
                COUNT(o.id)::int AS orders_count
         FROM users u
         LEFT JOIN orders o ON o.user_id = u.id
         WHERE ${whereSql}
         GROUP BY u.id
         ORDER BY u.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1};`,
        [...values, pageSize, skip],
      ),
      this.pg.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM users u WHERE ${whereSql};`,
        values,
      ),
    ]);

    const items = usersRes.rows.map((u: any) => ({
      id: u.id.toString(),
      name: u.name,
      email: u.email,
      role: u.role === 'user' ? 'customer' : u.role,
      status: u.status || (u.is_active ? 'active' : 'suspended'),
      ordersCount: u.orders_count || 0,
      createdAt: u.created_at,
      joined: u.created_at
        ? new Date(u.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : '',
    }));

    return { items, total: Number(totalRes.rows[0]?.count || 0) };
  }

  async findUserById(id: number): Promise<any | null> {
    const res = await this.pg.query('SELECT * FROM users WHERE id = $1;', [id]);
    return res.rows[0] ?? null;
  }

  async findUserWithOrders(
    id: number,
  ): Promise<{ user: any; orders: any[] } | null> {
    const userRes = await this.pg.query('SELECT * FROM users WHERE id = $1;', [
      id,
    ]);
    if (userRes.rows.length === 0) return null;

    const ordersRes = await this.pg.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10;',
      [id],
    );

    return { user: userRes.rows[0], orders: ordersRes.rows };
  }

  async updateUser(id: number, data: any): Promise<any> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let idx = 1;

    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(val);
      }
    }

    values.push(id);
    const sql = `
      UPDATE users
      SET ${setClauses.join(', ')}
      WHERE id = $${idx}
      RETURNING *;
    `;
    const res = await this.pg.query(sql, values);
    return res.rows[0];
  }

  async deleteUser(id: number): Promise<void> {
    await this.pg.query('DELETE FROM users WHERE id = $1;', [id]);
  }

  async getOrders(params: {
    page: number;
    limit: number;
    status?: string;
    userId?: number;
  }): Promise<{ orders: any[]; total: number }> {
    const skip = (params.page - 1) * params.limit;
    const whereClauses: string[] = ['1=1'];
    const values: any[] = [];
    let idx = 1;

    if (params.status) {
      whereClauses.push(`o.status = $${idx++}`);
      values.push(params.status);
    }
    if (params.userId) {
      whereClauses.push(`o.user_id = $${idx++}`);
      values.push(params.userId);
    }

    const whereSql = whereClauses.join(' AND ');

    const [ordersRes, totalRes] = await Promise.all([
      this.pg.query(
        `SELECT 
           o.*,
           CASE 
             WHEN u.id IS NOT NULL THEN json_build_object('id', u.id, 'name', u.name, 'email', u.email)
             ELSE NULL 
           END AS users,
           COALESCE(
             (
               SELECT json_agg(
                 json_build_object(
                   'id', oi.id,
                   'order_id', oi.order_id,
                   'product_id', oi.product_id,
                   'name', oi.name,
                   'price', oi.price,
                   'quantity', oi.quantity,
                   'subtotal', oi.subtotal
                 )
               )
               FROM order_items oi
               WHERE oi.order_id = o.id
             ),
             '[]'::json
           ) AS order_items
         FROM orders o
         LEFT JOIN users u ON u.id = o.user_id
         WHERE ${whereSql}
         ORDER BY o.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1};`,
        [...values, params.limit, skip],
      ),
      this.pg.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM orders o WHERE ${whereSql};`,
        values,
      ),
    ]);

    return {
      orders: ordersRes.rows,
      total: Number(totalRes.rows[0]?.count || 0),
    };
  }

  async findOrderById(id: number): Promise<any | null> {
    const sql = `
      SELECT 
        o.*,
        CASE 
          WHEN u.id IS NOT NULL THEN json_build_object('id', u.id, 'name', u.name, 'email', u.email)
          ELSE NULL 
        END AS users,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', oi.id,
                'order_id', oi.order_id,
                'product_id', oi.product_id,
                'name', oi.name,
                'price', oi.price,
                'quantity', oi.quantity,
                'subtotal', oi.subtotal
              )
            )
            FROM order_items oi
            WHERE oi.order_id = o.id
          ),
          '[]'::json
        ) AS order_items
      FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      WHERE o.id = $1
      LIMIT 1;
    `;
    const res = await this.pg.query(sql, [id]);
    return res.rows[0] ?? null;
  }

  async updateOrderStatus(id: number, status: string): Promise<any> {
    const sql = `
      UPDATE orders
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *;
    `;
    const res = await this.pg.query(sql, [status, id]);
    return res.rows[0];
  }

  async getCategoryCounts(): Promise<
    Array<{ id: string; name: string; count: number }>
  > {
    const sql = `
      SELECT category, COUNT(*)::int AS count
      FROM products
      WHERE deleted_at IS NULL
      GROUP BY category;
    `;
    const res = await this.pg.query<{ category: string; count: number }>(sql);
    return res.rows.map((g) => ({
      id: g.category.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: g.category,
      count: g.count,
    }));
  }
}
