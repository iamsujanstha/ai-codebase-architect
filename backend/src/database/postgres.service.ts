import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class PostgresService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostgresService.name);
  private pool: Pool | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) { }

  async onModuleInit() {
    const connectionString =
      this.configService.get<string>('POSTGRES_URL') ||
      process.env.POSTGRES_URL

    try {
      this.pool = new Pool({
        connectionString,
        ssl: {
          rejectUnauthorized: false,
        },
        max: Number(
          this.configService.get<string>('POSTGRES_POOL_MAX') ||
            process.env.POSTGRES_POOL_MAX ||
            20,
        ),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 30000,
      });

      this.pool.on('error', (err) => {
        this.logger.error(`PostgreSQL pool client error: ${err.message}`);
      });

      // Verify connection with retries for serverless cold start
      let retries = 3;
      while (retries > 0) {
        try {
          const client = await this.pool.connect();
          try {
            const res = await client.query(
              'SELECT current_database() as db, version() as ver;',
            );
            this.isConnected = true;
            this.logger.log(
              `✅ Connected to Neon PostgreSQL database: ${res.rows[0].db}`,
            );
            break;
          } finally {
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

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('PostgreSQL connection pool closed');
    }
  }

  getPool(): Pool | null {
    return this.pool;
  }

  isReady(): boolean {
    return this.pool !== null;
  }

  async getClient(): Promise<import('pg').PoolClient> {
    if (!this.pool) {
      throw new Error('PostgreSQL pool is not initialized');
    }
    return this.pool.connect();
  }

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
