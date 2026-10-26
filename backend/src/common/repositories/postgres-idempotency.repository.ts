import { Injectable, Logger } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service';
import {
  IdempotencyRecord,
  IIdempotencyRepository,
} from './idempotency.repository.interface';

@Injectable()
export class PostgresIdempotencyRepository implements IIdempotencyRepository {
  private readonly logger = new Logger(PostgresIdempotencyRepository.name);

  constructor(private readonly pg: PostgresService) {}

  async findKey(key: string): Promise<IdempotencyRecord | null> {
    const sql = `
      SELECT key, status, response, expires_at, created_at
      FROM idempotency_keys
      WHERE key = $1
      LIMIT 1;
    `;
    const res = await this.pg.query<IdempotencyRecord>(sql, [key]);
    return res.rows[0] ?? null;
  }

  async saveKey(
    key: string,
    statusCode: number,
    body: any,
    expiryHours: number = 24,
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000);
      const sql = `
        INSERT INTO idempotency_keys (key, status, response, expires_at, created_at)
        VALUES ($1, 'processed', $2::jsonb, $3, NOW())
        ON CONFLICT (key) DO UPDATE
          SET status = 'processed',
              response = EXCLUDED.response,
              expires_at = EXCLUDED.expires_at;
      `;
      await this.pg.query(sql, [
        key,
        JSON.stringify({ statusCode, body }),
        expiresAt,
      ]);
    } catch (e: any) {
      this.logger.warn(`Could not cache idempotency key ${key}: ${e?.message}`);
    }
  }
}
