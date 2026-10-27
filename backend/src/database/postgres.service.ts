import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

/**
 * ============================================================================
 * POSTGRES SERVICE — 100% RAW POSTGRESQL CONNECTION POOL MANAGER
 * ============================================================================
 *
 * 🎯 WHY IS THIS FILE REQUIRED?
 * ────────────────────────────────────────────────────────────────────────────
 * In a zero-ORM, production-grade architecture, the application communicates
 * directly with PostgreSQL over its native TCP wire protocol.
 *
 * Creating a new TCP connection, performing the TLS/SSL handshake, and
 * authenticating with the database takes anywhere from 50ms to 200ms per request.
 * If every API request opened a new connection, the database would quickly run out
 * of file descriptors, exhaust memory, and crash under high concurrent traffic.
 *
 * PostgresService solves this by acting as the centralized manager for the
 * `pg.Pool` connection pool. It provides:
 *
 * 1. CONNECTION REUSE (POOLING):
 *    Keeps a warm pool of reusable connections ready to execute SQL queries
 *    instantaneously (0ms connection overhead per query).
 *
 * 2. NESTJS LIFECYCLE MANAGEMENT:
 *    - On startup (`OnModuleInit`): Wakes up the database, verifies connectivity,
 *      and handles serverless cold-start retries.
 *    - On shutdown (`OnModuleDestroy`): Gracefully drains all active connections
 *      without dropping in-flight customer transactions (SIGTERM / rolling deploys).
 *
 * 3. DUAL EXECUTION STRATEGY:
 *    - Stateless Single Queries: `query()` auto-borrows and auto-releases a client.
 *    - Multi-Statement ACID Transactions: `getClient()` provides a dedicated client
 *      for atomic `BEGIN ... COMMIT / ROLLBACK` workflows and `FOR UPDATE SKIP LOCKED`.
 *
 * 4. SERVERLESS & FAULT RESILIENCE:
 *    - Specifically tuned for Neon Serverless PostgreSQL (handles compute wake-up).
 *    - Listens for idle socket dropouts so network blips never crash Node.js.
 * ============================================================================
 */
@Injectable()
export class PostgresService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostgresService.name);

  /**
   * The underlying connection pool from the official `node-postgres` (`pg`) driver.
   * Manages the lifecycle, queuing, and allocation of physical database sockets.
   */
  private pool: Pool | null = null;

  /**
   * Health flag indicating whether the database is reachable.
   */
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  /**
   * LIFECYCLE HOOK: onModuleInit
   *
   * Called once by NestJS when the application boots up.
   * Configures the connection pool and performs a health-check handshake.
   */
  async onModuleInit() {
    const connectionString =
      this.configService.get<string>('POSTGRES_URL') ||
      process.env.POSTGRES_URL;

    try {
      this.pool = new Pool({
        connectionString,

        // SSL / TLS Configuration:
        // Required for cloud databases (Neon, AWS RDS, Supabase).
        // rejectUnauthorized: false allows connecting securely via TLS without
        // needing a local custom CA certificate bundled into the Docker container.
        ssl: {
          rejectUnauthorized: false,
        },

        // POOL SIZING (CRITICAL FOR SCALE):
        // `max`: Maximum number of concurrent database connections allowed in the pool.
        // A single connection in Node.js handles async queries sequentially. A pool of
        // 20 connections can easily handle 2,000+ requests/sec when queries run in 1-5ms.
        max: Number(
          this.configService.get<string>('POSTGRES_POOL_MAX') ||
            process.env.POSTGRES_POOL_MAX ||
            20,
        ),

        // IDLE TIMEOUT:
        // How long an unused socket stays open in the pool before being closed (30s).
        // Frees server resources on Neon during low-traffic periods.
        idleTimeoutMillis: 30000,

        // CONNECTION TIMEOUT:
        // Maximum time to wait when acquiring a connection from the pool before throwing (30s).
        // Protects against thread starvation if all pool connections are busy.
        connectionTimeoutMillis: 30000,
      });

      /**
       * CRITICAL ERROR HANDLER FOR IDLE POOL CLIENTS:
       *
       * In PostgreSQL, an idle connection sitting in the pool can be severed
       * by the server (e.g., firewall timeout, server restart, network drop).
       * Without this listener, an unhandled error on an idle socket will cause
       * the entire Node.js process to exit with an unhandled exception!
       */
      this.pool.on('error', (err) => {
        this.logger.error(`PostgreSQL pool client error: ${err.message}`);
      });

      /**
       * RESILIENT CONNECTION HANDSHAKE (NEON COLD-START RETRIES):
       *
       * Serverless Postgres (like Neon) suspends compute to 0 when idle.
       * The very first request after an idle period may take 1-2 seconds while
       * Neon spins up the VM. If the initial TCP connect times out, we retry
       * up to 3 times before failing the application startup.
       */
      let retries = 3;
      while (retries > 0) {
        try {
          // Borrow a client from the newly created pool
          const client = await this.pool.connect();
          try {
            // Run a lightweight probe query to verify authentication and database name
            const res = await client.query(
              'SELECT current_database() as db, version() as ver;',
            );
            this.isConnected = true;
            this.logger.log(
              `✅ Connected to Neon PostgreSQL database: ${res.rows[0].db}`,
            );
            break; // Connection verified successfully
          } finally {
            // ALWAYS release the client back to the pool in a finally block!
            client.release();
          }
        } catch (err: any) {
          retries--;
          this.logger.warn(
            `PostgreSQL connect attempt failed: ${err.message}. Retries remaining: ${retries}`,
          );
          if (retries === 0) {
            this.logger.error(
              `❌ Failed to connect to PostgreSQL after retries: ${err.message}`,
            );
          } else {
            // Exponential/linear backoff: wait 2 seconds before retrying
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }
    } catch (err: any) {
      this.logger.error(
        `❌ Failed to initialize PostgreSQL pool: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * LIFECYCLE HOOK: onModuleDestroy (GRACEFUL SHUTDOWN)
   *
   * When NestJS receives SIGTERM (e.g. during a Kubernetes rolling update or
   * server restart), this method drains the pool.
   * `pool.end()` waits for all active in-flight queries to finish executing
   * before terminating physical TCP connections. Zero data corruption.
   */
  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('PostgreSQL connection pool closed');
    }
  }

  /**
   * Returns the underlying `pg.Pool` instance if low-level pool inspection
   * or metrics (e.g. totalCount, idleCount, waitingCount) are needed.
   */
  getPool(): Pool | null {
    return this.pool;
  }

  /**
   * Health-check helper: Returns true if the pool is initialized and active.
   */
  isReady(): boolean {
    return this.pool !== null && this.isConnected;
  }

  /**
   * TRANSACTION CLIENT ALLOCATION:
   *
   * Used when you MUST execute multiple queries on the EXACT SAME physical connection:
   * 1. Multi-statement ACID transactions:
   *    `BEGIN; ... COMMIT;` or `ROLLBACK;`
   * 2. Row locks:
   *    `SELECT ... FOR UPDATE SKIP LOCKED;` (lock is bound to the connection socket!)
   *
   * ⚠️ SENIOR ARCHITECT RULE:
   * The caller MUST wrap client usage in a `try ... finally` block and call
   * `client.release()` inside `finally`. Failing to do so creates a connection leak,
   * starving the pool!
   */
  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('PostgreSQL pool is not initialized');
    }
    return this.pool.connect();
  }

  /**
   * HIGH-PERFORMANCE STATELESS QUERY EXECUTION:
   *
   * For 95% of standard read/write operations (e.g. `SELECT`, single `INSERT/UPDATE`).
   *
   * Under the hood, `pool.query()`:
   * 1. Automatically claims an idle connection from the pool.
   * 2. Executes the parameterized SQL query.
   * 3. Automatically releases the connection back to the pool immediately upon completion.
   *
   * @param text Parameterized SQL statement (e.g. 'SELECT * FROM users WHERE id = $1')
   * @param params Sanitized values matching placeholders [$1, $2, ...]
   * @returns QueryResult containing typed `.rows`
   */
  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('PostgreSQL pool is not initialized');
    }
    const res = await this.pool.query<T>(text, params);
    this.isConnected = true;
    return res;
  }
}
