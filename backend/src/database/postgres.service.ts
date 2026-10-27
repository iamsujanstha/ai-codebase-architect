import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import {
  getPostgresSslConfig,
  getRequiredPostgresUrl,
} from './database-connection';

const MAX_CONNECTION_ATTEMPTS = 3;
const CONNECTION_RETRY_DELAY_MILLISECONDS = 2000;

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
  async onModuleInit(): Promise<void> {
    const connectionString = getRequiredPostgresUrl(
      this.configService.get<string>('POSTGRES_URL'),
    );
    const pool = new Pool({
      connectionString,
      ssl: getPostgresSslConfig(this.configService.get<string>('POSTGRES_SSL')),
      max: Number(
        this.configService.get<string>('POSTGRES_POOL_MAX') ||
          process.env.POSTGRES_POOL_MAX ||
          20,
      ),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
    });
    this.pool = pool;

    pool.on('error', (error) => {
      this.logger.error(`PostgreSQL pool client error: ${error.message}`);
    });

    let lastConnectionError: unknown;

    for (let attempt = 1; attempt <= MAX_CONNECTION_ATTEMPTS; attempt += 1) {
      let client: PoolClient | undefined;

      try {
        client = await pool.connect();
        const result = await client.query<{ database_name: string }>(
          'SELECT current_database() AS database_name;',
        );
        this.isConnected = true;
        this.logger.log(
          `Connected to PostgreSQL database: ${result.rows[0].database_name}`,
        );
        return;
      } catch (error: unknown) {
        lastConnectionError = error;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const attemptsRemaining = MAX_CONNECTION_ATTEMPTS - attempt;
        this.logger.warn(
          `PostgreSQL connect attempt failed: ${errorMessage}. Retries remaining: ${attemptsRemaining}`,
        );
      } finally {
        client?.release();
      }

      if (attempt < MAX_CONNECTION_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, CONNECTION_RETRY_DELAY_MILLISECONDS),
        );
      }
    }

    await pool.end();
    this.pool = null;
    this.isConnected = false;
    this.logger.error(
      `Failed to connect to PostgreSQL after ${MAX_CONNECTION_ATTEMPTS} attempts`,
    );
    throw lastConnectionError;
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
      this.pool = null;
      this.isConnected = false;
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
  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('PostgreSQL pool is not initialized');
    }
    const res = await this.pool.query<T>(text, params);
    this.isConnected = true;
    return res;
  }
}
