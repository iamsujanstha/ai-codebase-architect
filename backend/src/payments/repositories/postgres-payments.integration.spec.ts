import { randomUUID } from 'crypto';
import { Client, Pool } from 'pg';
import type { PoolClient } from 'pg';
import { PostgresService } from '../../database/postgres.service';
import { PostgresPaymentsRepository } from './postgres-payments.repository';

const testPostgresUrl = process.env.TEST_POSTGRES_URL;
const describePostgresIntegration = testPostgresUrl ? describe : describe.skip;
const OUTBOX_BATCH_SIZE = 4;
const OUTBOX_MAX_ATTEMPTS = 5;
const STOCK_DECREMENT = 3;
const INITIAL_STOCK = 10;
const PROCESSING_LEASE_MILLISECONDS = 5 * 60 * 1_000;
const LEASE_RECLAIM_GRACE_MILLISECONDS = 60 * 1_000;
const POOL_MAX_CONNECTIONS = 1;
const POOL_WAIT_TIMEOUT_MILLISECONDS = 250;

describePostgresIntegration('PostgresPaymentsRepository integration', () => {
  let firstClient: Client;
  let secondClient: Client;

  beforeAll(async () => {
    firstClient = new Client({ connectionString: testPostgresUrl });
    secondClient = new Client({ connectionString: testPostgresUrl });
    await Promise.all([firstClient.connect(), secondClient.connect()]);
  });

  afterAll(async () => {
    await Promise.all([firstClient.end(), secondClient.end()]);
  });

  it('assigns each available outbox event to at most one concurrent worker', async () => {
    const aggregateId = randomUUID();
    const now = new Date();
    const staleClaimBefore = new Date(
      now.getTime() - PROCESSING_LEASE_MILLISECONDS,
    );
    await insertOutboxEvents(firstClient, aggregateId, OUTBOX_BATCH_SIZE);

    try {
      const [firstBatch, secondBatch] = await Promise.all([
        createRepository(firstClient).claimPendingOutboxEvents(
          OUTBOX_BATCH_SIZE,
          now,
          staleClaimBefore,
        ),
        createRepository(secondClient).claimPendingOutboxEvents(
          OUTBOX_BATCH_SIZE,
          now,
          staleClaimBefore,
        ),
      ]);
      const claimedIds = [...firstBatch, ...secondBatch].map(
        (event) => event.id,
      );

      expect(claimedIds).toHaveLength(OUTBOX_BATCH_SIZE);
      expect(new Set(claimedIds).size).toBe(OUTBOX_BATCH_SIZE);
    } finally {
      await deleteOutboxEvents(firstClient, aggregateId);
    }
  });

  it('reclaims expired leases and rejects completion by the previous owner', async () => {
    const aggregateId = randomUUID();
    const claimedAt = new Date();
    const eventId = await insertOutboxEvents(firstClient, aggregateId, 1);

    try {
      const firstClaim = await createRepository(
        firstClient,
      ).claimPendingOutboxEvents(
        1,
        claimedAt,
        new Date(claimedAt.getTime() - PROCESSING_LEASE_MILLISECONDS),
      );
      const reclaimTime = new Date(
        claimedAt.getTime() +
          PROCESSING_LEASE_MILLISECONDS +
          LEASE_RECLAIM_GRACE_MILLISECONDS,
      );
      const reclaimed = await createRepository(
        secondClient,
      ).claimPendingOutboxEvents(
        1,
        reclaimTime,
        new Date(claimedAt.getTime() + LEASE_RECLAIM_GRACE_MILLISECONDS),
      );

      expect(firstClaim[0].id).toBe(eventId);
      expect(reclaimed[0].id).toBe(eventId);
      expect(reclaimed[0].claim_token).not.toBe(firstClaim[0].claim_token);
      await expect(
        createRepository(firstClient).markOutboxEventProcessed(
          eventId,
          firstClaim[0].claim_token,
        ),
      ).rejects.toThrow('Outbox event claim was lost before completion');
    } finally {
      await deleteOutboxEvents(firstClient, aggregateId);
    }
  });

  it('applies the inventory decrement only once per outbox event', async () => {
    const aggregateId = randomUUID();
    const productName = `lease-test-${randomUUID()}`;
    const eventId = await insertOutboxEvents(firstClient, aggregateId, 1);
    const productResult = await firstClient.query<{ id: number }>(
      `INSERT INTO products (name, price, category, stock)
       VALUES ($1, 10, 'test', $2)
       RETURNING id;`,
      [productName, INITIAL_STOCK],
    );
    const productId = productResult.rows[0].id;
    const inventoryPool = new Pool({ connectionString: testPostgresUrl });
    const repository = new PostgresPaymentsRepository({
      getClient: () => inventoryPool.connect(),
    } as unknown as PostgresService);

    try {
      const stockChange = [{ productId, quantity: STOCK_DECREMENT }];
      await repository.decrementProductStock(eventId, stockChange);
      await repository.decrementProductStock(eventId, stockChange);

      const product = await firstClient.query<{ stock: number }>(
        'SELECT stock FROM products WHERE id = $1;',
        [productId],
      );
      expect(Number(product.rows[0].stock)).toBe(
        INITIAL_STOCK - STOCK_DECREMENT,
      );
    } finally {
      await inventoryPool.end();
      await firstClient.query('DELETE FROM products WHERE id = $1;', [
        productId,
      ]);
      await deleteOutboxEvents(firstClient, aggregateId);
    }
  });

  it('fails pool acquisition within its configured wait limit when saturated', async () => {
    const pool = new Pool({
      connectionString: testPostgresUrl,
      max: POOL_MAX_CONNECTIONS,
      connectionTimeoutMillis: POOL_WAIT_TIMEOUT_MILLISECONDS,
    });
    let heldClient: PoolClient | undefined;

    try {
      heldClient = await pool.connect();
      await expect(pool.connect()).rejects.toThrow(
        'timeout exceeded when trying to connect',
      );
    } finally {
      heldClient?.release();
      await pool.end();
    }
  });
});

function createRepository(client: Client): PostgresPaymentsRepository {
  return new PostgresPaymentsRepository({
    query: client.query.bind(client) as PostgresService['query'],
  } as unknown as PostgresService);
}

async function insertOutboxEvents(
  client: Client,
  aggregateId: string,
  count: number,
): Promise<number> {
  const insertedIds: number[] = [];
  for (let eventIndex = 0; eventIndex < count; eventIndex += 1) {
    const result = await client.query<{ id: number }>(
      `INSERT INTO outbox_events (
         aggregate_id, aggregate_type, event_type, payload, status, max_attempts
       ) VALUES ($1, 'test', 'test.event', '{}'::jsonb, 'pending', $2)
       RETURNING id;`,
      [aggregateId, OUTBOX_MAX_ATTEMPTS],
    );
    insertedIds.push(result.rows[0].id);
  }
  return insertedIds[0];
}

async function deleteOutboxEvents(
  client: Client,
  aggregateId: string,
): Promise<void> {
  await client.query('DELETE FROM outbox_events WHERE aggregate_id = $1;', [
    aggregateId,
  ]);
}
