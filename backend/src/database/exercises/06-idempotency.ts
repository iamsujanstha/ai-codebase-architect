/**
 * Exercise 6: Idempotency
 *
 * Goal: Understand idempotent operations and prevent duplicate processing
 */

import { randomUUID } from 'crypto';
import { pool } from './db';

async function demonstrateIdempotency() {
  console.log('\n=== Exercise 6: Idempotency ===\n');

  try {
    // Setup: Create tables for idempotency patterns
    await pool.query(`
      DROP TABLE IF EXISTS webhook_events CASCADE;
      DROP TABLE IF EXISTS payments CASCADE;
      DROP TABLE IF EXISTS idempotency_keys_demo CASCADE;
      
      CREATE TABLE webhook_events (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(255) NOT NULL UNIQUE,
        event_type VARCHAR(100),
        payload JSONB,
        processed_at TIMESTAMPTZ,
        status VARCHAR(20) DEFAULT 'processing',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE payments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE idempotency_keys_demo (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(20) DEFAULT 'processing',
        response JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    console.log('Setup: Created tables for idempotency demonstration\n');

    // Task 1: Idempotent Webhook Processing
    console.log('Task 1: Idempotent Webhook Processing\n');
    console.log('Scenario: Stripe sends webhook twice due to retry\n');

    const webhookId = `evt_${randomUUID()}`;

    // First webhook delivery
    console.log(`Webhook 1: Processing event ${webhookId}`);
    const result1 = await pool.query(
      `
      INSERT INTO webhook_events (event_id, event_type, payload)
      VALUES ($1, $2, $3)
      ON CONFLICT (event_id) DO NOTHING
      RETURNING id, event_id
    `,
      [webhookId, 'payment.succeeded', { amount: 9999 }],
    );

    if (result1.rows.length > 0) {
      console.log('✓ First delivery: Inserted and processing...');

      // Simulate processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      await pool.query(
        `
        UPDATE webhook_events
        SET status = 'completed', processed_at = NOW()
        WHERE event_id = $1
      `,
        [webhookId],
      );

      console.log('✓ Processing completed\n');
    }

    // Second webhook delivery (duplicate)
    console.log(`Webhook 2: Processing same event ${webhookId} (duplicate)`);
    const result2 = await pool.query(
      `
      INSERT INTO webhook_events (event_id, event_type, payload)
      VALUES ($1, $2, $3)
      ON CONFLICT (event_id) DO NOTHING
      RETURNING id, event_id
    `,
      [webhookId, 'payment.succeeded', { amount: 9999 }],
    );

    if (result2.rows.length === 0) {
      console.log(
        '✓ Duplicate detected: ON CONFLICT prevented duplicate processing',
      );

      // Fetch existing result
      const existing = await pool.query(
        'SELECT * FROM webhook_events WHERE event_id = $1',
        [webhookId],
      );

      console.log('✓ Returned cached result from first processing\n');
      console.log('Webhook status:', existing.rows[0].status);
    }

    console.log('\n✅ Idempotency Achieved:');
    console.log('   - UNIQUE constraint on event_id prevents duplicates');
    console.log('   - ON CONFLICT DO NOTHING returns 0 rows for duplicates');
    console.log('   - Second webhook receives same result as first\n');

    // Verify
    const webhookCount = await pool.query(
      'SELECT COUNT(*) FROM webhook_events WHERE event_id = $1',
      [webhookId],
    );
    console.log(`Only ${webhookCount.rows[0].count} row exists (not 2)\n`);

    // Task 2: Idempotent Payment Creation
    console.log('\n\nTask 2: Idempotent Payment Creation\n');
    console.log('Scenario: User double-clicks "Pay Now" button\n');

    const idempotencyKey = `payment-${randomUUID()}`;
    const userId = 123;
    const amount = 49.99;

    // Function to create payment idempotently
    async function createPayment(
      key: string,
      uid: number,
      amt: number,
    ): Promise<any> {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Try to insert idempotency key
        const keyResult = await client.query(
          `
          INSERT INTO idempotency_keys_demo (key, status)
          VALUES ($1, 'processing')
          ON CONFLICT (key) DO NOTHING
          RETURNING id
        `,
          [key],
        );

        if (keyResult.rows.length === 0) {
          // Duplicate request, return cached response
          console.log('   ⚠️  Duplicate request detected (key already exists)');

          const cached = await client.query(
            'SELECT * FROM idempotency_keys_demo WHERE key = $1',
            [key],
          );

          await client.query('COMMIT');

          console.log('   ✓ Returned cached response from first request');
          return JSON.parse(cached.rows[0].response);
        }

        console.log('   ✓ First request with this key, processing payment...');

        // Create payment
        const payment = await client.query(
          `
          INSERT INTO payments (user_id, amount, status)
          VALUES ($1, $2, 'completed')
          RETURNING *
        `,
          [uid, amt],
        );

        // Store response in idempotency key
        const response = payment.rows[0];
        await client.query(
          `
          UPDATE idempotency_keys_demo
          SET status = 'completed', response = $1
          WHERE key = $2
        `,
          [JSON.stringify(response), key],
        );

        await client.query('COMMIT');

        console.log('   ✓ Payment created successfully');
        return response;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    // First click
    console.log('First click:');
    const payment1 = await createPayment(idempotencyKey, userId, amount);
    console.log(`   Payment ID: ${payment1.id}, Amount: $${payment1.amount}\n`);

    // Second click (duplicate)
    console.log('Second click (duplicate):');
    const payment2 = await createPayment(idempotencyKey, userId, amount);
    console.log(`   Payment ID: ${payment2.id}, Amount: $${payment2.amount}\n`);

    console.log('✅ Same payment returned:');
    console.log(`   First:  ID ${payment1.id}`);
    console.log(`   Second: ID ${payment2.id}`);
    console.log('   Only one payment was created!\n');

    // Verify only one payment exists
    const paymentCount = await pool.query(
      'SELECT COUNT(*) FROM payments WHERE user_id = $1 AND amount = $2',
      [userId, amount],
    );
    console.log(`Total payments created: ${paymentCount.rows[0].count}\n`);

    // Task 3: Race Condition Protection
    console.log('\n\nTask 3: Race Condition Protection\n');
    console.log('Scenario: Two simultaneous webhook deliveries\n');

    const raceWebhookId = `evt_race_${randomUUID()}`;

    // Simulate concurrent requests
    console.log('Simulating 2 simultaneous webhook deliveries...\n');

    const promises = [
      pool.query(
        `
        INSERT INTO webhook_events (event_id, event_type, payload)
        VALUES ($1, $2, $3)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING id, event_id, created_at
      `,
        [raceWebhookId, 'payment.succeeded', { amount: 1234 }],
      ),

      pool.query(
        `
        INSERT INTO webhook_events (event_id, event_type, payload)
        VALUES ($1, $2, $3)
        ON CONFLICT (event_id) DO NOTHING
        RETURNING id, event_id, created_at
      `,
        [raceWebhookId, 'payment.succeeded', { amount: 1234 }],
      ),
    ];

    const results = await Promise.all(promises);

    const succeeded = results.filter((r) => r.rows.length > 0);
    const failed = results.filter((r) => r.rows.length === 0);

    console.log(`✅ ${succeeded.length} request succeeded (inserted row)`);
    console.log(
      `✅ ${failed.length} request(s) failed gracefully (duplicate detected)`,
    );
    console.log(
      '\nUNIQUE constraint ensured atomicity even with concurrent requests!\n',
    );

    // Task 4: Idempotency Key Expiration
    console.log('\n\nTask 4: Idempotency Key Cleanup\n');
    console.log('Strategy: Add TTL to prevent unbounded growth\n');

    await pool.query(`
      -- Add timestamp for cleanup
      ALTER TABLE idempotency_keys_demo ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
      
      -- Set expiration (24 hours)
      UPDATE idempotency_keys_demo SET expires_at = NOW() + INTERVAL '24 hours';
    `);

    console.log('Added expires_at column for TTL management\n');

    console.log('Cleanup query:\n');
    console.log('```sql');
    console.log('DELETE FROM idempotency_keys_demo');
    console.log('WHERE expires_at < NOW()');
    console.log("  AND status = 'completed';");
    console.log('```\n');

    console.log('Schedule this with cron or a background job daily.\n');

    // Task 5: ON CONFLICT strategies
    console.log('\n\nTask 5: ON CONFLICT Strategies\n');

    console.log('Strategy 1: DO NOTHING (ignore duplicates)\n');
    console.log('```sql');
    console.log('INSERT INTO webhook_events (event_id, payload)');
    console.log('VALUES ($1, $2)');
    console.log('ON CONFLICT (event_id) DO NOTHING;');
    console.log('```\n');

    console.log('Strategy 2: DO UPDATE (upsert)\n');
    console.log('```sql');
    console.log('INSERT INTO user_preferences (user_id, theme)');
    console.log('VALUES ($1, $2)');
    console.log('ON CONFLICT (user_id)');
    console.log('DO UPDATE SET theme = EXCLUDED.theme;');
    console.log('```\n');

    console.log('Strategy 3: WHERE clause (conditional upsert)\n');
    console.log('```sql');
    console.log('INSERT INTO products (sku, price)');
    console.log('VALUES ($1, $2)');
    console.log('ON CONFLICT (sku)');
    console.log('DO UPDATE SET price = EXCLUDED.price');
    console.log("WHERE products.updated_at < NOW() - INTERVAL '1 hour';");
    console.log('```\n');

    // Cleanup
    await pool.query(`
      DROP TABLE IF EXISTS webhook_events CASCADE;
      DROP TABLE IF EXISTS payments CASCADE;
      DROP TABLE IF EXISTS idempotency_keys_demo CASCADE;
    `);
  } catch (error) {
    console.error('Error:', error);
  }
}

function printInterviewQuestions() {
  console.log('\n=== Interview Questions ===\n');

  console.log('Q1: "How do you handle duplicate webhooks?"\n');
  console.log(
    'A: "I use the webhook event ID as an idempotency key with a UNIQUE constraint in',
  );
  console.log(
    'the database. When a webhook arrives, I INSERT INTO webhook_events (event_id) VALUES (?)',
  );
  console.log(
    "ON CONFLICT DO NOTHING RETURNING id. If the insert returns 0 rows, it's a duplicate—I",
  );
  console.log(
    'return 200 OK immediately. If it succeeds, I process the webhook and update the status',
  );
  console.log(
    "to 'completed.' The unique constraint ensures atomicity even if two webhooks arrive",
  );
  console.log(
    'simultaneously—only one INSERT succeeds. The tradeoff is requiring a database roundtrip',
  );
  console.log(
    "before processing, but that's necessary for correctness. I also set a TTL (24 hours)",
  );
  console.log('on idempotency keys to avoid unbounded growth."\n');

  console.log('Q2: "What if processing fails midway?"\n');
  console.log(
    'A: "If processing fails after inserting the idempotency key, the key remains in',
  );
  console.log(
    "'processing' state forever, blocking retries. To handle this, I add a timestamp and",
  );
  console.log(
    "a cleanup job. If a key is in 'processing' state for > 5 minutes, I consider it stale",
  );
  console.log(
    'and allow reprocessing. Or I delete the key on failure so retries can proceed. The',
  );
  console.log(
    'tradeoff is: if cleanup is too aggressive, genuine slow processing might be reprocessed',
  );
  console.log(
    '(not idempotent). If too conservative, failed webhooks block forever. I err on the side',
  );
  console.log(
    "of reprocessing—it's better to process twice than not at all, especially with financial",
  );
  console.log('webhooks where missing events is unacceptable."\n');

  console.log('Q3: "Explain ON CONFLICT DO NOTHING vs DO UPDATE"\n');
  console.log(
    'A: "ON CONFLICT DO NOTHING ignores duplicate inserts—if a row with the same unique key',
  );
  console.log(
    'exists, do nothing and return. I use this for true idempotency where duplicates should',
  );
  console.log(
    'be rejected, like webhook event IDs or payment idempotency keys. DO UPDATE performs an',
  );
  console.log(
    'upsert—insert if new, update if exists. I use this for user preferences or cache-like',
  );
  console.log(
    'tables where the latest value should win. Example: INSERT INTO user_preferences (user_id,',
  );
  console.log(
    "theme) VALUES (1, 'dark') ON CONFLICT (user_id) DO UPDATE SET theme = EXCLUDED.theme.",
  );
  console.log(
    'The tradeoff is: DO NOTHING is simpler and clearer for idempotency, DO UPDATE is better',
  );
  console.log('for last-write-wins semantics."\n');
}

if (require.main === module) {
  demonstrateIdempotency()
    .then(() => {
      printInterviewQuestions();
      pool.end();
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      pool.end();
      process.exit(1);
    });
}

export { demonstrateIdempotency };
