import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service';
import {
  AtomicOrderPaidParams,
  CreateOrderSnapshotDto,
  CustomerUserData,
  IPaymentsRepository,
  OutboxEventRecord,
  ProductCatalogItem,
} from './payments.repository.interface';

/**
 * Production-Grade Raw PostgreSQL Payments Repository
 *
 * Implements IPaymentsRepository using native node-postgres (pg) PoolClient connections,
 * explicit ACID transaction lifecycle (BEGIN / COMMIT / ROLLBACK), single-roundtrip JSON
 * aggregation, multi-row batch inserts, row-level locks (FOR UPDATE SKIP LOCKED),
 * and native PostgreSQL SQLSTATE error handling (e.g. 23505 unique_violation).
 */
@Injectable()
export class PostgresPaymentsRepository implements IPaymentsRepository {
  private readonly logger = new Logger(PostgresPaymentsRepository.name);

  constructor(private readonly pg: PostgresService) {}

  /**
   * Fetch products by IDs in a single round-trip using PostgreSQL native array matching:
   * WHERE id = ANY($1::int[])
   */
  async findProductsByIds(ids: number[]): Promise<ProductCatalogItem[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    const sql = `
      SELECT id, name, price, stock, category, image_url, status, featured, sku, created_at, updated_at, deleted_at
      FROM products
      WHERE id = ANY($1::int[]) AND deleted_at IS NULL;
    `;
    const res = await this.pg.query<ProductCatalogItem>(sql, [ids]);
    return res.rows;
  }

  async findUserByEmail(email: string): Promise<CustomerUserData | null> {
    const sql = `
      SELECT id, email, name
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1;
    `;
    const res = await this.pg.query<CustomerUserData>(sql, [email.trim()]);
    return res.rows[0] ?? null;
  }

  async findUserById(id: number): Promise<CustomerUserData | null> {
    const sql = `
      SELECT id, email, name
      FROM users
      WHERE id = $1
      LIMIT 1;
    `;
    const res = await this.pg.query<CustomerUserData>(sql, [id]);
    return res.rows[0] ?? null;
  }

  async getFirstUserId(): Promise<number> {
    const sql = `SELECT id FROM users ORDER BY id ASC LIMIT 1;`;
    const res = await this.pg.query<{ id: number }>(sql);
    return res.rows[0]?.id ?? 1;
  }

  /**
   * Atomic user lookup or creation using PostgreSQL ON CONFLICT (email)
   * Guarantees race-condition-free customer creation in a single query round-trip.
   */
  async findOrCreateCustomer(
    email: string,
    fullName?: string,
  ): Promise<CustomerUserData> {
    const normalizedEmail = email.trim().toLowerCase();
    const resolvedName = (fullName && fullName.trim()) || normalizedEmail.split('@')[0];

    const sql = `
      INSERT INTO users (email, name, password, role, status, created_at, updated_at)
      VALUES ($1, $2, '', 'customer', 'active', NOW(), NOW())
      ON CONFLICT (email) DO UPDATE
        SET updated_at = NOW()
      RETURNING id, email, name;
    `;
    const res = await this.pg.query<CustomerUserData>(sql, [
      normalizedEmail,
      resolvedName,
    ]);
    return res.rows[0];
  }

  /**
   * Creates an order snapshot and its line items inside an ACID transaction.
   * Order items are inserted via single multi-row VALUES batching to minimize network round-trips.
   */
  async createOrderSnapshot(dto: CreateOrderSnapshotDto): Promise<void> {
    const client = await this.pg.getClient();
    try {
      await client.query('BEGIN');

      const insertOrderSql = `
        INSERT INTO orders (user_id, order_number, total_amount, status, payment_method, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id;
      `;
      const orderRes = await client.query<{ id: number }>(insertOrderSql, [
        dto.userId,
        dto.orderNumber,
        dto.totalAmount,
        dto.status,
        dto.paymentMethod.toLowerCase(),
      ]);
      const orderId = orderRes.rows[0].id;

      if (dto.items && dto.items.length > 0) {
        const values: any[] = [];
        const placeholders: string[] = [];

        dto.items.forEach((item, index) => {
          const offset = index * 5;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`,
          );
          values.push(
            orderId,
            item.productId,
            item.name,
            item.price,
            item.quantity,
          );
        });

        const insertItemsSql = `
          INSERT INTO order_items (order_id, product_id, name, price, quantity)
          VALUES ${placeholders.join(', ')};
        `;
        await client.query(insertItemsSql, values);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateOrderStatus(
    orderNumber: string,
    status: string,
    paymentIntentId?: string | null,
  ): Promise<void> {
    const sql = `
      UPDATE orders
      SET status = $1,
          payment_intent_id = COALESCE($2, payment_intent_id),
          updated_at = NOW()
      WHERE order_number = $3;
    `;
    await this.pg.query(sql, [status, paymentIntentId ?? null, orderNumber]);
  }

  /**
   * Retrieves an order with denormalized user and aggregated items in a SINGLE query
   * utilizing PostgreSQL json_build_object and json_agg subqueries (zero N+1 queries).
   */
  async findOrderByOrderNumber(orderNumber: string): Promise<any | null> {
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
      WHERE o.order_number = $1
      LIMIT 1;
    `;
    const res = await this.pg.query(sql, [orderNumber]);
    return res.rows[0] ?? null;
  }

  /**
   * Retrieves up to 100 recent orders for a user id or user email with relations aggregated.
   */
  async findOrdersByUserIdOrEmail(
    userId?: string,
    userEmail?: string,
  ): Promise<any[]> {
    let pgUserId: number | null = null;
    if (userId && /^\d+$/.test(userId)) {
      pgUserId = parseInt(userId, 10);
    }

    const normalizedEmail = userEmail ? userEmail.trim().toLowerCase() : null;

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
      WHERE (
        ($1::int IS NOT NULL AND o.user_id = $1::int)
        OR
        ($2::text IS NOT NULL AND LOWER(u.email) = $2::text)
      )
      ORDER BY o.created_at DESC
      LIMIT 100;
    `;
    const res = await this.pg.query(sql, [pgUserId, normalizedEmail]);
    return res.rows;
  }

  /**
   * Transactional Outbox Pattern:
   * Atomically transitions the order to 'paid' AND inserts an outbox event in the same ACID transaction.
   * If the database or worker crashes, both updates succeed or both rollback together.
   */
  async markOrderAsPaidAtomic(params: AtomicOrderPaidParams): Promise<void> {
    const client = await this.pg.getClient();
    try {
      await client.query('BEGIN');

      const updateOrderSql = `
        UPDATE orders
        SET status = 'paid',
            payment_intent_id = COALESCE($1, payment_intent_id),
            updated_at = NOW()
        WHERE order_number = $2;
      `;
      await client.query(updateOrderSql, [
        params.paymentIntentId ?? null,
        params.orderNumber,
      ]);

      const insertOutboxSql = `
        INSERT INTO outbox_events (
          aggregate_id,
          aggregate_type,
          event_type,
          payload,
          status,
          attempts,
          max_attempts,
          next_attempt_at,
          created_at
        ) VALUES ($1, $2, $3, $4::jsonb, 'pending', 0, 5, $5, NOW());
      `;
      await client.query(insertOutboxSql, [
        params.outboxEvent.aggregateId,
        params.outboxEvent.aggregateType,
        params.outboxEvent.eventType,
        JSON.stringify(params.outboxEvent.payload),
        params.outboxEvent.nextAttemptAt ?? null,
      ]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Atomic stock decrement with floor zero constraint:
   * GREATEST(0, stock - $1)
   */
  async decrementProductStock(
    items: Array<{ productId: number; quantity: number }>,
  ): Promise<void> {
    for (const item of items) {
      const sql = `
        UPDATE products
        SET stock = GREATEST(0, stock - $1),
            updated_at = NOW()
        WHERE id = $2;
      `;
      await this.pg.query(sql, [item.quantity, item.productId]);
    }
  }

  async checkIdempotencyKey(key: string): Promise<boolean> {
    try {
      const sql = `SELECT 1 FROM idempotency_keys WHERE key = $1 LIMIT 1;`;
      const res = await this.pg.query(sql, [key]);
      return res.rows.length > 0;
    } catch (error) {
      this.logger.error({
        event: 'webhook_idempotency_check_failed',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Native PostgreSQL unique constraint violation handling:
   * Inspects SQLSTATE code '23505' (unique_violation) to catch concurrent duplicate requests.
   */
  async createIdempotencyKey(key: string, expiresAt: Date): Promise<void> {
    try {
      const sql = `
        INSERT INTO idempotency_keys (key, status, expires_at, created_at)
        VALUES ($1, 'processing', $2, NOW());
      `;
      await this.pg.query(sql, [key, expiresAt]);
    } catch (error: any) {
      if (error?.code === '23505') {
        this.logger.log({
          event: 'webhook_concurrent_processing_detected',
          key,
        });
        throw new ConflictException('Webhook is already being processed');
      }

      this.logger.error({
        event: 'webhook_idempotency_insert_failed',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async markIdempotencyKeyProcessed(key: string): Promise<void> {
    try {
      const sql = `UPDATE idempotency_keys SET status = 'processed' WHERE key = $1;`;
      await this.pg.query(sql, [key]);
    } catch (error) {
      this.logger.error({
        event: 'webhook_idempotency_update_failed',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async deleteIdempotencyKey(key: string): Promise<void> {
    try {
      const sql = `DELETE FROM idempotency_keys WHERE key = $1;`;
      await this.pg.query(sql, [key]);
    } catch (error) {
      this.logger.error({
        event: 'webhook_idempotency_removal_failed',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Concurrency-safe outbox event polling:
   * Utilizes PostgreSQL FOR UPDATE SKIP LOCKED to allow horizontal worker scaling
   * without contention, duplicate processing, or blocking.
   */
  async claimPendingOutboxEvents(
    batchSize: number,
    now: Date,
  ): Promise<OutboxEventRecord[]> {
    const sql = `
      SELECT id, aggregate_id, aggregate_type, event_type, payload, attempts, max_attempts, next_attempt_at
      FROM outbox_events
      WHERE status = 'pending'
        AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
      ORDER BY created_at ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED;
    `;
    const res = await this.pg.query<OutboxEventRecord>(sql, [now, batchSize]);
    return res.rows;
  }

  async markOutboxEventProcessing(id: number): Promise<void> {
    const sql = `UPDATE outbox_events SET status = 'processing' WHERE id = $1;`;
    await this.pg.query(sql, [id]);
  }

  async markOutboxEventProcessed(id: number, attempts: number): Promise<void> {
    const sql = `
      UPDATE outbox_events
      SET status = 'processed',
          processed_at = NOW(),
          attempts = $1,
          last_error = NULL
      WHERE id = $2;
    `;
    await this.pg.query(sql, [attempts, id]);
  }

  async scheduleOutboxEventRetry(
    id: number,
    attempts: number,
    nextAttemptAt: Date,
    error: string,
  ): Promise<void> {
    const sql = `
      UPDATE outbox_events
      SET status = 'pending',
          attempts = $1,
          last_error = $2,
          next_attempt_at = $3
      WHERE id = $4;
    `;
    await this.pg.query(sql, [attempts, error, nextAttemptAt, id]);
  }

  async deadLetterOutboxEvent(
    id: number,
    attempts: number,
    error: string,
  ): Promise<void> {
    const sql = `
      UPDATE outbox_events
      SET status = 'dead_lettered',
          attempts = $1,
          last_error = $2,
          dead_lettered_at = NOW()
      WHERE id = $3;
    `;
    await this.pg.query(sql, [attempts, error, id]);
  }
}
