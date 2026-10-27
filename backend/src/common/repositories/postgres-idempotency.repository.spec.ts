import { PostgresService } from '../../database/postgres.service';
import { PostgresIdempotencyRepository } from './postgres-idempotency.repository';

describe('PostgresIdempotencyRepository', () => {
  it('claims a key using an atomic insert and expired-key replacement', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ key: 'scoped-key' }] });
    const repository = new PostgresIdempotencyRepository(
      { query } as unknown as PostgresService,
    );

    const claim = await repository.claimKey(
      'scoped-key',
      'request-fingerprint',
      new Date('2026-10-28T00:00:00.000Z'),
    );

    expect(claim).toEqual({ kind: 'claimed' });
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (key) DO UPDATE');
    expect(query.mock.calls[0][0]).toContain(
      'WHERE idempotency_keys.expires_at <= NOW()',
    );
  });

  it('replays a completed response for the same request fingerprint', async () => {
    const response = { body: { checkoutUrl: 'https://pay.test' } };
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            key: 'scoped-key',
            request_hash: 'request-fingerprint',
            status: 'completed',
            response,
          },
        ],
      });
    const repository = new PostgresIdempotencyRepository(
      { query } as unknown as PostgresService,
    );

    const claim = await repository.claimKey(
      'scoped-key',
      'request-fingerprint',
      new Date('2026-10-28T00:00:00.000Z'),
    );

    expect(claim).toEqual({ kind: 'replay', response });
    expect(query.mock.calls[1][0]).toContain('expires_at > NOW()');
  });

  it('rejects a key that belongs to another request fingerprint', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            key: 'scoped-key',
            request_hash: 'different-fingerprint',
            status: 'completed',
            response: { body: {} },
          },
        ],
      });
    const repository = new PostgresIdempotencyRepository(
      { query } as unknown as PostgresService,
    );

    const claim = await repository.claimKey(
      'scoped-key',
      'request-fingerprint',
      new Date('2026-10-28T00:00:00.000Z'),
    );

    expect(claim).toEqual({ kind: 'conflict' });
  });

  it('uses only valid lifecycle statuses and requires one completed claim', async () => {
    const query = jest.fn().mockResolvedValue({ rowCount: 1 });
    const repository = new PostgresIdempotencyRepository(
      { query } as unknown as PostgresService,
    );

    await repository.completeKey('scoped-key', 'request-fingerprint', {
      body: { checkoutUrl: 'https://pay.test' },
    });

    expect(query.mock.calls[0][0]).toContain("status = 'completed'");
    expect(query.mock.calls[0][0]).toContain("status = 'processing'");
  });
});
