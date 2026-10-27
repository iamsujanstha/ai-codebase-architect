import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service';
import {
  CachedIdempotencyResponse,
  IdempotencyClaim,
  IIdempotencyRepository,
} from './idempotency.repository.interface';

type IdempotencyStatus = 'processing' | 'completed' | 'failed';

interface IdempotencyRecord {
  key: string;
  request_hash: string | null;
  status: IdempotencyStatus;
  response: CachedIdempotencyResponse | null;
}

@Injectable()
export class PostgresIdempotencyRepository implements IIdempotencyRepository {
  constructor(private readonly pg: PostgresService) {}

  async claimKey(
    key: string,
    requestHash: string,
    expiresAt: Date,
  ): Promise<IdempotencyClaim> {
    const claimSql = `
      INSERT INTO idempotency_keys (key, request_hash, status, expires_at, created_at)
      VALUES ($1, $2, 'processing', $3, NOW())
      ON CONFLICT (key) DO UPDATE
        SET request_hash = EXCLUDED.request_hash,
            status = 'processing',
            response = NULL,
            expires_at = EXCLUDED.expires_at,
            created_at = NOW()
      WHERE idempotency_keys.expires_at <= NOW()
      RETURNING key;
    `;
    const claimResult = await this.pg.query<{ key: string }>(claimSql, [
      key,
      requestHash,
      expiresAt,
    ]);

    if (claimResult.rows.length > 0) {
      return { kind: 'claimed' };
    }

    const existing = await this.findActiveKey(key);
    if (
      existing?.request_hash === requestHash &&
      existing.status === 'completed' &&
      existing.response
    ) {
      return { kind: 'replay', response: existing.response };
    }

    return { kind: 'conflict' };
  }

  async completeKey(
    key: string,
    requestHash: string,
    response: CachedIdempotencyResponse,
  ): Promise<void> {
    const sql = `
      UPDATE idempotency_keys
      SET status = 'completed', response = $3::jsonb
      WHERE key = $1 AND request_hash = $2 AND status = 'processing';
    `;
    const result = await this.pg.query(sql, [
      key,
      requestHash,
      JSON.stringify(response),
    ]);

    if (result.rowCount !== 1) {
      throw new Error('Idempotency claim could not be completed');
    }
  }

  async failKey(key: string, requestHash: string): Promise<void> {
    const sql = `
      UPDATE idempotency_keys
      SET status = 'failed'
      WHERE key = $1 AND request_hash = $2 AND status = 'processing';
    `;
    await this.pg.query(sql, [key, requestHash]);
  }

  private async findActiveKey(key: string): Promise<IdempotencyRecord | null> {
    const sql = `
      SELECT key, request_hash, status, response
      FROM idempotency_keys
      WHERE key = $1 AND expires_at > NOW()
      LIMIT 1;
    `;
    const result = await this.pg.query<IdempotencyRecord>(sql, [key]);
    return result.rows[0] ?? null;
  }
}
