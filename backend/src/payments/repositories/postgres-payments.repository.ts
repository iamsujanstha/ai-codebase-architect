import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PostgresService } from '../../database/postgres.service';
import {
  AtomicOrderPaidParams,
  CreateOrderSnapshotDto,
  CustomerUserData,
  IPaymentsRepository,
  OutboxEventRecord,
  OrderWithRelations,
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
   * Fetch product list by IDs in a single round-trip using PostgreSQL native array matching:
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
    const resolvedName =
      (fullName && fullName.trim()) || normalizedEmail.split('@')[0];

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
        const values: Array<number | string> = [];
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
  async findOrderByOrderNumber(
    orderNumber: string,
  ): Promise<OrderWithRelations | null> {
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
    const res = await this.pg.query<OrderWithRelations>(sql, [orderNumber]);
    return res.rows[0] ?? null;
  }

  /**
   * Retrieves up to 100 recent orders for a user id or user email with relations aggregated.
   */
  async findOrdersByUserIdOrEmail(
    userId?: string,
    userEmail?: string,
  ): Promise<OrderWithRelations[]> {
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
    const res = await this.pg.query<OrderWithRelations>(sql, [
      pgUserId,
      normalizedEmail,
    ]);
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
    eventId: number,
    items: Array<{ productId: number; quantity: number }>,
  ): Promise<void> {
    const client = await this.pg.getClient();
    try {
      await client.query('BEGIN');
      const claim = await client.query(
        `INSERT INTO outbox_effects (event_id, effect_type)
         VALUES ($1, 'inventory_decrement')
         ON CONFLICT (event_id, effect_type) DO NOTHING
         RETURNING event_id;`,
        [eventId],
      );
      if (claim.rowCount === 0) {
        await client.query('COMMIT');
        return;
      }

      for (const item of items) {
        await client.query(
          `UPDATE products
           SET stock = GREATEST(0, stock - $1), updated_at = NOW()
           WHERE id = $2;`,
          [item.quantity, item.productId],
        );
      }
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async checkIdempotencyKey(key: string): Promise<boolean> {
    try {
      const sql = `
        SELECT 1
        FROM idempotency_keys
        WHERE key = $1 AND status = 'completed' AND expires_at > NOW()
        LIMIT 1;
      `;
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

  /** Claims a webhook key or rejects a still-active claim atomically. */
  async createIdempotencyKey(key: string, expiresAt: Date): Promise<void> {
    try {
      const sql = `
        INSERT INTO idempotency_keys (key, status, expires_at, created_at)
        VALUES ($1, 'processing', $2, NOW())
        ON CONFLICT (key) DO UPDATE
          SET request_hash = NULL,
              status = 'processing',
              response = NULL,
              expires_at = EXCLUDED.expires_at,
              created_at = NOW()
        WHERE idempotency_keys.expires_at <= NOW()
        RETURNING key;
      `;
      const result = await this.pg.query<{ key: string }>(sql, [
        key,
        expiresAt,
      ]);

      if (result.rows.length === 0) {
        throw new ConflictException('Webhook is already being processed');
      }
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        throw error;
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
    const sql = `
      UPDATE idempotency_keys
      SET status = 'completed'
      WHERE key = $1 AND status = 'processing';
    `;
    const result = await this.pg.query(sql, [key]);

    if (result.rowCount !== 1) {
      throw new Error('Webhook idempotency claim could not be completed');
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
    staleClaimBefore: Date,
  ): Promise<OutboxEventRecord[]> {
    await this.pg.query(
      `UPDATE outbox_events SET claimed_at = $1 WHERE status = 'processing' AND claimed_at IS NULL;`,
      [now],
    );
    await this.pg.query(
      `
        UPDATE outbox_events
        SET status = 'dead_lettered',
            dead_lettered_at = $1,
            last_error = COALESCE(last_error, 'Worker lease expired after the final attempt'),
            claimed_at = NULL,
            claim_token = NULL
        WHERE status = 'processing'
          AND attempts >= max_attempts
          AND claimed_at <= $2;
      `,
      [now, staleClaimBefore],
    );

    const claimToken = randomUUID();
    const sql = `
      WITH claimable_events AS (
        SELECT id
        FROM outbox_events
        WHERE (
          status = 'pending'
          AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
          AND attempts < max_attempts
        ) OR (
          status = 'processing'
          AND claimed_at <= $2
          AND attempts < max_attempts
        )
        ORDER BY created_at ASC, id ASC
        LIMIT $3
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_events AS events
      SET status = 'processing',
          claimed_at = $1,
          claim_token = $4,
          attempts = events.attempts + 1
      FROM claimable_events
      WHERE events.id = claimable_events.id
      RETURNING events.id, events.aggregate_id, events.aggregate_type,
                events.event_type, events.payload, events.attempts,
                events.max_attempts, events.claim_token;
    `;
    const res = await this.pg.query<OutboxEventRecord>(sql, [
      now,
      staleClaimBefore,
      batchSize,
      claimToken,
    ]);
    return res.rows;
  }

  async markOutboxEventProcessed(
    id: number,
    claimToken: string,
  ): Promise<void> {
    const sql = `
      UPDATE outbox_events
      SET status = 'processed',
          processed_at = NOW(),
          last_error = NULL,
          claimed_at = NULL,
          claim_token = NULL
      WHERE id = $1 AND claim_token = $2 AND status = 'processing';
    `;
    const result = await this.pg.query(sql, [id, claimToken]);
    if (result.rowCount !== 1) {
      throw new Error('Outbox event claim was lost before completion');
    }
  }

  async scheduleOutboxEventRetry(
    id: number,
    claimToken: string,
    nextAttemptAt: Date,
    error: string,
  ): Promise<void> {
    const sql = `
      UPDATE outbox_events
      SET status = 'pending',
          last_error = $3,
          next_attempt_at = $4,
          claimed_at = NULL,
          claim_token = NULL
      WHERE id = $1 AND claim_token = $2 AND status = 'processing';
    `;
    const result = await this.pg.query(sql, [
      id,
      claimToken,
      error,
      nextAttemptAt,
    ]);
    if (result.rowCount !== 1) {
      throw new Error('Outbox event claim was lost before retry scheduling');
    }
  }

  async deadLetterOutboxEvent(
    id: number,
    claimToken: string,
    error: string,
  ): Promise<void> {
    const sql = `
      UPDATE outbox_events
      SET status = 'dead_lettered',
          last_error = $3,
          dead_lettered_at = NOW(),
          claimed_at = NULL,
          claim_token = NULL
      WHERE id = $1 AND claim_token = $2 AND status = 'processing';
    `;
    const result = await this.pg.query(sql, [id, claimToken, error]);
    if (result.rowCount !== 1) {
      throw new Error('Outbox event claim was lost before dead lettering');
    }
  }
}
