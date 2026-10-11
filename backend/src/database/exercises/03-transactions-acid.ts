/**
 * Exercise 3: Transactions & ACID
 *
 * Goal: Understand Atomicity, Consistency, Isolation, Durability
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
