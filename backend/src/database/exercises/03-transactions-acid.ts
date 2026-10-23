/**
 * Exercise 3: Transactions & ACID
 *
 * Goal: Understand Atomicity, Consistency, Isolation, Durability
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY THIS MATTERS (Production Importance)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Transactions are the difference between "the database says the money moved"
 * and "the money actually moved." Without ACID guarantees, concurrent operations
 * can corrupt financial records, lose inventory, or double-charge customers.
 *
 * Real-world failures:
 *
 * 1. ATOMICITY FAILURE (Partial Transfer):
 *    A fintech app debited Account A ($500 → $0) but crashed before crediting
 *    Account B. Without a transaction wrapping both operations, $500 vanished.
 *    With BEGIN/COMMIT, either both succeed or both roll back — money never disappears.
 *
 * 2. CONSISTENCY FAILURE (Negative Inventory):
 *    A flash sale processed 200 orders for a product with stock = 50.
 *    Without CHECK constraints inside transactions, stock went to -150.
 *    Customers received "order confirmed" emails for products that didn't exist.
 *    Fix: `CHECK (stock >= 0)` constraint + transaction isolation.
 *
 * 3. DURABILITY FAILURE (Lost Confirmed Orders):
 *    A startup used an in-memory database for orders. Server crashed. All orders
 *    from the last 4 hours were gone — customers were charged but no record existed.
 *    PostgreSQL's WAL guarantees that once COMMIT returns, the data survives even
 *    a power failure because the WAL is fsynced to disk before acknowledgment.
 *
 * In Atlas Commerce Lab:
 *   - Payment processing uses transactions: debit stock → create order → create
 *     payment audit log → all within a single BEGIN/COMMIT block.
 *   - The idempotency middleware wraps payment creation in transactions to prevent
 *     double-charging when webhooks fire twice.
 *   - Savepoints are used in bulk operations so a single product failure doesn't
 *     roll back the entire import batch.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FROM SCRATCH (How Transactions Work Internally)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Step 1 — BEGIN: PostgreSQL assigns a Transaction ID (XID). All subsequent
 *   operations are tagged with this XID so the engine knows which changes belong
 *   to which transaction.
 *
 * Step 2 — Write Operations: When you INSERT/UPDATE/DELETE:
 *   a) The change is written to the WAL (Write-Ahead Log) in shared memory.
 *   b) The table page in shared_buffers (RAM) is modified with the new tuple.
 *   c) The old tuple is NOT deleted — it's marked with xmax = current XID.
 *      Other transactions can still see the old version (MVCC).
 *
 * Step 3 — COMMIT:
 *   a) The WAL records are fsynced to disk (this is the durability guarantee).
 *   b) The transaction's status is set to "committed" in pg_xact (the commit log).
 *   c) The modified data pages are NOT immediately written to disk — they stay in
 *      shared_buffers and are lazily flushed by the background writer / checkpointer.
 *   Key insight: COMMIT is fast because it only fsyncs sequential WAL bytes, not
 *   random table pages scattered across disk.
 *
 * Step 4 — ROLLBACK:
 *   a) The WAL records for this transaction are discarded/marked aborted.
 *   b) No cleanup needed on table pages — the new tuples have xmin = aborted XID,
 *      so they're automatically invisible to all other transactions.
 *   c) VACUUM will eventually reclaim the dead tuples.
 *
 * Savepoints (Nested Transactions):
 *   SAVEPOINT sp1; — Marks a restore point within the transaction.
 *   ROLLBACK TO sp1; — Undoes everything after sp1, but keeps the outer transaction alive.
 *   Use case: Processing 100 orders in a batch. If order #47 fails, rollback to the
 *   savepoint and continue with order #48, instead of aborting all 100.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTERVIEW Q&A (Senior / Staff Level)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Q1: "Explain ACID with a real example from your system."
 * A:  In our payment flow: BEGIN → decrement product stock → insert order row →
 *     insert payment audit log → COMMIT.
 *     - Atomicity: If audit log insert fails, stock decrement rolls back automatically.
 *     - Consistency: CHECK(stock >= 0) prevents overselling even under concurrency.
 *     - Isolation: Two users buying the last item — only one succeeds, the other
 *       sees the updated stock and gets a "sold out" error.
 *     - Durability: Once COMMIT returns 200 to the client, the WAL is on disk.
 *       Even if the server crashes 1ms later, the order survives on restart.
 *
 * Q2: "How does PostgreSQL achieve durability without writing every change to disk?"
 * A:  WAL (Write-Ahead Logging). Changes are written sequentially to the WAL file
 *     and fsynced on COMMIT. Table data pages stay in RAM (shared_buffers) and are
 *     lazily flushed by the checkpointer. On crash recovery, PostgreSQL replays the
 *     WAL to reconstruct any committed transactions whose data pages weren't flushed.
 *     This is why sequential WAL writes are fast (append-only) while random table
 *     page writes would be slow (scattered disk I/O).
 *
 * Q3: "What's the difference between ROLLBACK and ROLLBACK TO SAVEPOINT?"
 * A:  ROLLBACK aborts the entire transaction — all changes are discarded.
 *     ROLLBACK TO SAVEPOINT undoes only the work done after the savepoint, keeping
 *     the outer transaction alive. Use case: batch processing where you want to
 *     skip a failed item without losing all previous successful items.
 *     Follow-up: "Are savepoints expensive?"
 *     → Each savepoint is tracked in memory with a SubTransaction ID. Having hundreds
 *       of active savepoints can cause performance issues (pg_subtrans contention).
 *       Best practice: use savepoints sparingly, not inside tight loops.
 *
 * Q4: "Can a SELECT statement ever block in PostgreSQL?"
 * A:  Under normal READ COMMITTED isolation, SELECTs never block — they read the
 *     last committed snapshot (MVCC). However, SELECT FOR UPDATE acquires row-level
 *     exclusive locks and WILL block if another transaction holds the lock.
 *     Also, DDL statements (ALTER TABLE) acquire AccessExclusive locks that block
 *     everything, including SELECTs.
 *
 * Q5: "How do you handle long-running transactions in production?"
 * A:  Long transactions are dangerous because they: (1) hold locks that block other
 *     operations, (2) prevent VACUUM from reclaiming dead tuples (causing bloat),
 *     (3) risk XID wraparound on extremely long-lived transactions.
 *     Solutions: Set `idle_in_transaction_session_timeout`, break large operations
 *     into smaller batches, use `statement_timeout` to kill stuck queries, and
 *     monitor `pg_stat_activity` for transactions older than a threshold.
 */

import { pool } from './db';

async function demonstrateTransactionsAndACID() {
  console.log('\n=== Exercise 3: Transactions & ACID ===\n');

  try {
    // Setup: Create test accounts table
    await pool.query(`
      DROP TABLE IF EXISTS accounts_demo CASCADE;
      
      CREATE TABLE accounts_demo (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        balance DECIMAL(10, 2) NOT NULL CHECK (balance >= 0),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      INSERT INTO accounts_demo (user_id, balance) VALUES 
        (1, 1000.00),
        (2, 500.00),
        (3, 250.00);
    `);

    console.log('Setup: Created accounts_demo table\n');
    const initialState = await pool.query(
      'SELECT * FROM accounts_demo ORDER BY user_id',
    );
    console.log('Initial balances:');
    console.table(initialState.rows);

    // Task 1: Demonstrate Atomicity (All-or-Nothing)
    console.log('\n\nTask 1: ATOMICITY (All-or-Nothing)\n');
    console.log('Scenario: Transfer $100 from User 1 to User 2');
    console.log(
      'Without transaction: Money could disappear if crash happens mid-transfer\n',
    );

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      console.log('BEGIN transaction');

      // Deduct from User 1
      await client.query(
        'UPDATE accounts_demo SET balance = balance - $1 WHERE user_id = $2',
        [100, 1],
      );
      console.log('✓ Deducted $100 from User 1');

      // Add to User 2
      await client.query(
        'UPDATE accounts_demo SET balance = balance + $1 WHERE user_id = $2',
        [100, 2],
      );
      console.log('✓ Added $100 to User 2');

      await client.query('COMMIT');
      console.log('COMMIT - Both operations succeeded!\n');

      const afterTransfer = await pool.query(
        'SELECT * FROM accounts_demo ORDER BY user_id',
      );
      console.log('Balances after successful transfer:');
      console.table(afterTransfer.rows);
    } catch (error) {
      await client.query('ROLLBACK');
      console.log('ROLLBACK - Transaction failed, all changes undone\n');
    } finally {
      client.release();
    }

    // Task 2: Demonstrate failed transaction (Atomicity)
    console.log('\n\nTask 2: Failed Transaction (Atomicity Test)\n');
    console.log('Scenario: Try to transfer more money than available');
    console.log('Expected: Transaction should ROLLBACK, no changes made\n');

    const client2 = await pool.connect();

    try {
      await client2.query('BEGIN');
      console.log('BEGIN transaction');

      // Try to deduct $2000 from User 3 (only has $250)
      await client2.query(
        'UPDATE accounts_demo SET balance = balance - $1 WHERE user_id = $2',
        [2000, 3],
      );
      console.log('✓ Attempted to deduct $2000 from User 3');

      // This will fail due to CHECK constraint (balance >= 0)
      await client2.query('COMMIT');
    } catch (error) {
      await client2.query('ROLLBACK');
      console.log('❌ Transaction failed: CHECK constraint violated');
      console.log('ROLLBACK - Balance unchanged (Atomicity!)\n');
    } finally {
      client2.release();
    }

    const afterFailed = await pool.query(
      'SELECT * FROM accounts_demo WHERE user_id = 3',
    );
    console.log('User 3 balance (should be unchanged):');
    console.table(afterFailed.rows);

    // Task 3: Demonstrate Consistency (Constraints Enforced)
    console.log('\n\nTask 3: CONSISTENCY (Constraints Enforced)\n');
    console.log('Scenario: Try to set negative balance');
    console.log('Database enforces CHECK (balance >= 0) constraint\n');

    try {
      await pool.query('BEGIN');
      await pool.query(
        'UPDATE accounts_demo SET balance = -500 WHERE user_id = 1',
      );
      await pool.query('COMMIT');
    } catch (error: any) {
      console.log('❌ Transaction rejected!');
      console.log(`   Reason: ${error.message}`);
      console.log('   Database remains in CONSISTENT state\n');
    }

    // Task 4: Demonstrate Isolation
    console.log('\nTask 4: ISOLATION (Concurrent Transactions)\n');
    console.log('Scenario: Two transactions trying to update same account');
    console.log("Isolation ensures they don't interfere with each other\n");

    // Transaction 1
    const client3 = await pool.connect();
    await client3.query('BEGIN');
    console.log('Transaction 1: BEGIN');
    await client3.query(
      'UPDATE accounts_demo SET balance = balance + 50 WHERE user_id = 1',
    );
    console.log('Transaction 1: Added $50 to User 1');

    // Transaction 2 (simultaneous)
    const client4 = await pool.connect();
    await client4.query('BEGIN');
    console.log('Transaction 2: BEGIN');

    // This will wait for Transaction 1 to complete (row-level lock)
    console.log('Transaction 2: Attempting to update same account...');
    console.log(
      'Transaction 2: Waiting for Transaction 1 to complete (ISOLATION)...\n',
    );

    // Commit Transaction 1
    await client3.query('COMMIT');
    console.log('Transaction 1: COMMIT');
    client3.release();

    // Now Transaction 2 can proceed
    await client4.query(
      'UPDATE accounts_demo SET balance = balance + 100 WHERE user_id = 1',
    );
    console.log('Transaction 2: Added $100 to User 1 (after waiting)');
    await client4.query('COMMIT');
    console.log('Transaction 2: COMMIT\n');
    client4.release();

    const afterIsolation = await pool.query(
      'SELECT * FROM accounts_demo WHERE user_id = 1',
    );
    console.log('User 1 balance (should have both increments):');
    console.table(afterIsolation.rows);
    console.log('✅ Both transactions succeeded without interference!\n');

    // Task 5: Demonstrate Durability
    console.log('\nTask 5: DURABILITY (Survives Crashes)\n');
    console.log('After COMMIT, data is written to Write-Ahead Log (WAL)');
    console.log('Even if server crashes immediately, committed data survives');
    console.log('PostgreSQL replays WAL on restart to recover data\n');

    await pool.query('BEGIN');
    await pool.query(
      'INSERT INTO accounts_demo (user_id, balance) VALUES (99, 10000.00)',
    );
    await pool.query('COMMIT');

    console.log('✓ Inserted User 99 with $10,000');
    console.log('✓ COMMIT completed - Data is DURABLE');
    console.log('  Even if server crashes now, this row will survive\n');

    const durability = await pool.query(
      'SELECT * FROM accounts_demo WHERE user_id = 99',
    );
    console.table(durability.rows);

    // Task 6: Savepoints (Partial Rollback)
    console.log('\n\nTask 6: SAVEPOINTS (Partial Rollback)\n');
    console.log('Scenario: Multi-step process, rollback specific steps only\n');

    const client5 = await pool.connect();

    try {
      await client5.query('BEGIN');
      console.log('BEGIN transaction');

      await client5.query(
        'UPDATE accounts_demo SET balance = balance - 100 WHERE user_id = 1',
      );
      console.log('Step 1: Deducted $100 from User 1');

      await client5.query('SAVEPOINT step1');
      console.log('SAVEPOINT step1 created');

      await client5.query(
        'UPDATE accounts_demo SET balance = balance + 50 WHERE user_id = 2',
      );
      console.log('Step 2: Added $50 to User 2');

      await client5.query('SAVEPOINT step2');
      console.log('SAVEPOINT step2 created');

      // This will fail
      await client5.query(
        'UPDATE accounts_demo SET balance = balance + 9999 WHERE user_id = 3',
      );
      console.log('Step 3: Tried to add $9999 to User 3');
    } catch (error) {
      // Rollback to savepoint (keep Step 1, undo Steps 2 & 3)
      await client5.query('ROLLBACK TO SAVEPOINT step1');
      console.log('\n❌ Step 3 failed, ROLLBACK TO SAVEPOINT step1');
      console.log('   Result: Step 1 kept, Steps 2 & 3 undone\n');

      await client5.query('COMMIT');
      console.log('COMMIT remaining changes');
    } finally {
      client5.release();
    }

    const afterSavepoint = await pool.query(
      'SELECT * FROM accounts_demo WHERE user_id IN (1, 2, 3) ORDER BY user_id',
    );
    console.log('Final balances (only Step 1 applied):');
    console.table(afterSavepoint.rows);

    // Cleanup
    await pool.query('DROP TABLE IF EXISTS accounts_demo CASCADE');
  } catch (error) {
    console.error('Error:', error);
  }
}

function printInterviewQuestions() {
  console.log('\n\n=== Interview Questions ===\n');

  console.log('Q1: "Explain ACID with a real example"\n');
  console.log(
    'A: "ACID ensures database reliability. Let me explain with a payment scenario.',
  );
  console.log(
    'Atomicity: When processing a payment, we insert an order, decrement product stock,',
  );
  console.log(
    'and charge the card. If any step fails, all steps roll back—no partial state.',
  );
  console.log(
    'Consistency: We enforce constraints like stock >= 0. If a transaction tries to',
  );
  console.log(
    "set stock to -1, it's rejected—database stays valid. Isolation: If two users",
  );
  console.log(
    'checkout the last item simultaneously, isolation ensures only one succeeds. We use',
  );
  console.log(
    'SELECT FOR UPDATE to lock the row. Durability: After COMMIT, the order is written',
  );
  console.log(
    "to disk (WAL). Even if the server crashes, the order survives. Without ACID, we'd",
  );
  console.log(
    'have inconsistent data—orders without stock updates, or vice versa."\n',
  );

  console.log('Q2: "What happens if a transaction fails midway?"\n');
  console.log(
    "A: \"If any statement in a transaction fails, the transaction enters an 'aborted'",
  );
  console.log(
    'state and all changes are rolled back. For example, if I BEGIN a transaction,',
  );
  console.log(
    'insert an order, then try to update a non-existent product, the UPDATE fails with',
  );
  console.log(
    'an error. At that point, the order insert is undone—the transaction is rolled back.',
  );
  console.log(
    'I cannot continue the transaction; I must ROLLBACK explicitly and start a new one.',
  );
  console.log(
    "This is atomicity: all-or-nothing. MongoDB's multi-document transactions have",
  );
  console.log(
    'similar behavior, but PostgreSQL\'s ACID transactions are more mature and performant."\n',
  );

  console.log('Q3: "How do you handle concurrent checkouts?"\n');
  console.log(
    'A: "I use SELECT FOR UPDATE to lock the product row during checkout. Here\'s the',
  );
  console.log(
    'flow: BEGIN transaction, SELECT stock FOR UPDATE, check if stock > 0, decrement',
  );
  console.log(
    'stock, COMMIT. The FOR UPDATE lock prevents concurrent transactions from reading',
  );
  console.log(
    'the row until the first commits. If a second user tries to checkout simultaneously,',
  );
  console.log(
    'their SELECT FOR UPDATE waits. After the first user commits, the second sees',
  );
  console.log(
    "updated stock (possibly 0), and gets 'Out of Stock' instead of overselling. The",
  );
  console.log(
    'tradeoff is lock contention—high-traffic products may queue up. For very high',
  );
  console.log(
    "scale, I'd use optimistic locking with version numbers or move to eventual",
  );
  console.log('consistency."\n');
}

if (require.main === module) {
  demonstrateTransactionsAndACID()
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

export { demonstrateTransactionsAndACID };
