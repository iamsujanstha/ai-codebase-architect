import { PostgresService } from '../../database/postgres.service';
import { PostgresPaymentsRepository } from './postgres-payments.repository';

describe('PostgresPaymentsRepository outbox claims', () => {
  it('claims available events atomically and returns a lease token', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 12,
            attempts: 1,
            max_attempts: 5,
            claim_token: 'lease-token',
          },
        ],
      });
    const repository = new PostgresPaymentsRepository({
      query,
    } as unknown as PostgresService);
    const now = new Date('2026-10-28T00:00:00Z');
    const staleClaimBefore = new Date('2026-10-27T23:55:00Z');

    const events = await repository.claimPendingOutboxEvents(
      10,
      now,
      staleClaimBefore,
    );

    expect(events[0]).toMatchObject({
      id: 12,
      attempts: 1,
      claim_token: 'lease-token',
    });
    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('FOR UPDATE SKIP LOCKED'),
      expect.any(Array),
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE outbox_events AS events'),
      expect.any(Array),
    );
  });

  it('rejects completion from a worker that lost its lease', async () => {
    const repository = new PostgresPaymentsRepository({
      query: jest.fn().mockResolvedValue({ rowCount: 0, rows: [] }),
    } as unknown as PostgresService);

    await expect(
      repository.markOutboxEventProcessed(12, 'expired-lease'),
    ).rejects.toThrow('Outbox event claim was lost before completion');
  });

  it('commits inventory only for the first execution of an event', async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({});
    const release = jest.fn();
    const repository = new PostgresPaymentsRepository({
      getClient: jest.fn().mockResolvedValue({
        query: clientQuery,
        release,
      }),
    } as unknown as PostgresService);

    await repository.decrementProductStock(12, [{ productId: 7, quantity: 2 }]);

    expect(clientQuery).toHaveBeenCalledTimes(3);
    expect(clientQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('ON CONFLICT'),
      [12],
    );
    expect(clientQuery).toHaveBeenNthCalledWith(3, 'COMMIT');
    expect(release).toHaveBeenCalledTimes(1);
  });
});
