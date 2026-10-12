import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { PostgresService } from '../../database/postgres.service';
import {
  CreateOrderParams,
  IOrdersRepository,
  OrderItemRow,
  OrderRow,
} from './orders.repository.interface';

@Injectable()
export class PostgresOrdersRepository implements IOrdersRepository {
  constructor(private readonly pg: PostgresService) {}

  async create(
    params: CreateOrderParams,
    externalClient?: PoolClient,
  ): Promise<OrderRow> {
    const client = externalClient ?? (await this.pg.getClient());
    const isExternalTx = !!externalClient;

    try {
      if (!isExternalTx) {
        await client.query('BEGIN');
      }

      // 1. Insert order
      const insertOrderSql = `
        INSERT INTO orders (user_id, order_number, total_amount, status, payment_method, payment_intent_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING id, user_id, order_number, total_amount, status, payment_method, payment_intent_id, created_at, updated_at;
      `;
      const orderRes = await client.query(insertOrderSql, [
        params.userId,
        params.orderNumber,
        params.totalAmount,
        params.status,
        params.paymentMethod ?? 'stripe',
        params.paymentIntentId ?? null,
      ]);
      const order = orderRes.rows[0];

      // 2. Insert order items
      const items: OrderItemRow[] = [];
      if (params.items && params.items.length > 0) {
        for (const item of params.items) {
          const insertItemSql = `
            INSERT INTO order_items (order_id, product_id, name, price, quantity)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, order_id, product_id, name, price, quantity, subtotal;
          `;
          const itemRes = await client.query(insertItemSql, [
            order.id,
            item.productId,
            item.name,
            item.price,
            item.quantity,
          ]);
          items.push(itemRes.rows[0]);
        }
      }

      if (!isExternalTx) {
        await client.query('COMMIT');
      }

      // Fetch user info for complete response
      const userRes = await client.query(
        'SELECT email, name FROM users WHERE id = $1',
        [params.userId],
      );
      const user = userRes.rows[0] ?? {};

      return {
        ...order,
        user_email: user.email,
        user_name: user.name,
        items,
      };
    } catch (err) {
      if (!isExternalTx) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      if (!isExternalTx) {
        client.release();
      }
    }
  }

  async findByUserId(userId: number): Promise<OrderRow[]> {
    const sql = `
      SELECT 
        o.id,
        o.user_id,
        o.order_number,
        o.total_amount,
        o.status,
        o.payment_method,
        o.payment_intent_id,
        o.created_at,
        o.updated_at,
        u.email AS user_email,
        u.name AS user_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'order_id', oi.order_id,
              'product_id', oi.product_id,
              'name', oi.name,
              'price', oi.price,
              'quantity', oi.quantity,
              'subtotal', oi.subtotal
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = $1
      GROUP BY o.id, u.id
      ORDER BY o.created_at DESC;
    `;
    const res = await this.pg.query<OrderRow>(sql, [userId]);
    return res.rows;
  }

  async findById(
    id: number | string,
    userId?: number,
  ): Promise<OrderRow | null> {
    const isNumeric = typeof id === 'number' || !isNaN(Number(id));
    const conditions: string[] = [];
    const params: any[] = [];

    if (isNumeric) {
      params.push(Number(id));
      conditions.push(`o.id = $${params.length}`);
    } else {
      params.push(id.toString());
      conditions.push(`o.order_number = $${params.length}`);
    }

    if (userId !== undefined) {
      params.push(userId);
      conditions.push(`o.user_id = $${params.length}`);
    }

    const sql = `
      SELECT 
        o.id,
        o.user_id,
        o.order_number,
        o.total_amount,
        o.status,
        o.payment_method,
        o.payment_intent_id,
        o.created_at,
        o.updated_at,
        u.email AS user_email,
        u.name AS user_name,
        COALESCE(
          json_agg(
            json_build_object(
              'id', oi.id,
              'order_id', oi.order_id,
              'product_id', oi.product_id,
              'name', oi.name,
              'price', oi.price,
              'quantity', oi.quantity,
              'subtotal', oi.subtotal
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY o.id, u.id;
    `;

    const res = await this.pg.query<OrderRow>(sql, params);
    return res.rows[0] ?? null;
  }

  async updateStatus(
    id: number | string,
    status: string,
    paymentReference?: string,
    externalClient?: PoolClient,
  ): Promise<OrderRow | null> {
    const isNumeric = typeof id === 'number' || !isNaN(Number(id));
    const whereClause = isNumeric ? 'id = $3' : 'order_number = $3';
    const updateSql = `
      UPDATE orders
      SET 
        status = $1,
        payment_intent_id = COALESCE($2, payment_intent_id),
        updated_at = NOW()
      WHERE ${whereClause}
      RETURNING id;
    `;

    const queryParams = [
      status,
      paymentReference ?? null,
      isNumeric ? Number(id) : id.toString(),
    ];

    let rowId: number | null = null;
    if (externalClient) {
      const res = await externalClient.query(updateSql, queryParams);
      rowId = res.rows[0]?.id ?? null;
    } else {
      const res = await this.pg.query(updateSql, queryParams);
      rowId = res.rows[0]?.id ?? null;
    }

    if (!rowId) return null;
    return this.findById(rowId);
  }
}
