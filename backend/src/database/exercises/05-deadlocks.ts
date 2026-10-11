/**
 * Exercise 5: Deadlocks & Prevention
 * 
 * Goal: Understand deadlocks, how to trigger them, prevent them, and handle them
 */

import { PoolClient } from 'pg';
import { pool } from './db';

// Retry logic for deadlock recovery
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  description = 'Operation'
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      // PostgreSQL deadlock error code: 40P01
      if (error.code === '40P01' && i < maxRetries - 1) {
        const delay = 100 * Math.pow(2, i); // Exponential backoff
        console.log(`   ⚠️  Deadlock detected, retrying in ${delay}ms (attempt ${i + 2}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`${description} failed after ${maxRetries} attempts`);
}

async function demonstrateDeadlocks() {
  console.log('\n=== Exercise 5: Deadlocks & Prevention ===\n');

  try {
    // Setup: Create test accounts table
    await pool.query(`
      DROP TABLE IF EXISTS accounts_deadlock_demo CASCADE;
      
      CREATE TABLE accounts_deadlock_demo (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        balance DECIMAL(10, 2)
      );

      INSERT INTO accounts_deadlock_demo (name, balance) VALUES 
        ('Alice', 1000.00),
        ('Bob', 2000.00),
        ('Charlie', 3000.00);
    `);

    console.log('Setup: Created accounts_deadlock_demo table\n');
    const initial = await pool.query('SELECT * FROM accounts_deadlock_demo ORDER BY id');
    console.table(initial.rows);

    // Task 1: Trigger a Deadlock
    console.log('\n\nTask 1: Triggering a Deadlock\n');
    console.log('Scenario: Two transactions acquire locks in different order\n');

    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      // Transaction 1: Lock Alice, then try to lock Bob
      await client1.query('BEGIN');
      console.log('Transaction 1: BEGIN');
      await client1.query(
        'UPDATE accounts_deadlock_demo SET balance = balance + 100 WHERE name = $1',
        ['Alice']
      );
      console.log('Transaction 1: ✓ Locked Alice, updated balance');

      // Small delay to simulate processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Transaction 2: Lock Bob, then try to lock Alice
      await client2.query('BEGIN');
      console.log('Transaction 2: BEGIN');
      await client2.query(
        'UPDATE accounts_deadlock_demo SET balance = balance + 200 WHERE name = $1',
        ['Bob']
      );
      console.log('Transaction 2: ✓ Locked Bob, updated balance\n');

      // Now create the circular dependency
      console.log('Creating circular dependency...\n');

      // Transaction 1 tries to lock Bob (held by Transaction 2)
      const promise1 = client1.query(
        'UPDATE accounts_deadlock_demo SET balance = balance + 50 WHERE name = $1',
        ['Bob']
      ).then(() => {
        console.log('Transaction 1: ✓ Locked Bob');
        return client1.query('COMMIT');
      }).catch((error) => {
        console.log('Transaction 1: ❌ Deadlock detected!');
        console.log(`   Error: ${error.message}`);
        return client1.query('ROLLBACK');
      });

      // Transaction 2 tries to lock Alice (held by Transaction 1)
      const promise2 = client2.query(
        'UPDATE accounts_deadlock_demo SET balance = balance + 75 WHERE name = $1',
        ['Alice']
      ).then(() => {
        console.log('Transaction 2: ✓ Locked Alice');
        return client2.query('COMMIT');
      }).catch((error) => {
        console.log('Transaction 2: ❌ Already rolled back by deadlock');
        return client2.query('ROLLBACK');
      });

      console.log('Transaction 1: Waiting for Bob lock (held by Transaction 2)...');
      console.log('Transaction 2: Waiting for Alice lock (held by Transaction 1)...');
      console.log('💀 DEADLOCK! Both waiting for each other.\n');
      console.log('PostgreSQL will detect this and abort one transaction...\n');

      await Promise.all([promise1, promise2]);

      console.log('\n✅ Result: PostgreSQL detected deadlock and aborted one transaction');
      console.log('   Detection time: ~1 second (deadlock_timeout setting)\n');

    } finally {
      client1.release();
      client2.release();
    }

    // Task 2: Prevention Strategy 1 - Consistent Lock Order
    console.log('\n\nTask 2: Prevention - Consistent Lock Order\n');
    console.log('Strategy: Always acquire locks in the same order (e.g., by ID)\n');

    const client3 = await pool.connect();
    const client4 = await pool.connect();

    try {
      // Reset balances
      await pool.query(`
        UPDATE accounts_deadlock_demo SET balance = 1000.00 WHERE name = 'Alice';
        UPDATE accounts_deadlock_demo SET balance = 2000.00 WHERE name = 'Bob';
      `);

      // Transaction 1: Lock in ascending order (Alice=1, Bob=2)
      await client3.query('BEGIN');
      console.log('Transaction 1: BEGIN');
      await client3.query(
        'UPDATE accounts_deadlock_demo SET balance = balance + 100 WHERE id = 1'
      );
      console.log('Transaction 1: ✓ Locked Account 1 (Alice)');
      
      await new Promise(resolve => setTimeout(resolve, 100));

      // Transaction 2: Also lock in ascending order (Alice=1, Bob=2)
      await client4.query('BEGIN');
      console.log('Transaction 2: BEGIN');
      console.log('Transaction 2: Attempting to lock Account 1 (Alice)...');
      console.log('Transaction 2: ⏳ Waiting (Transaction 1 holds the lock)\n');

      // Start Transaction 2's lock attempt (will wait)
      const promise2 = client4.query(
        'UPDATE accounts_deadlock_demo SET balance = balance + 200 WHERE id = 1'
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Transaction 1 continues to Bob (ascending order)
      await client3.query(
        'UPDATE accounts_deadlock_demo SET balance = balance + 50 WHERE id = 2'
      );
      console.log('Transaction 1: ✓ Locked Account 2 (Bob)');
      await client3.query('COMMIT');
      console.log('Transaction 1: COMMIT\n');

      // Now Transaction 2 can proceed
      await promise2;
      console.log('Transaction 2: ✓ Locked Account 1 (Alice) - lock released');
      await client4.query(
        'UPDATE accounts_deadlock_demo SET balance = balance + 75 WHERE id = 2'
      );
      console.log('Transaction 2: ✓ Locked Account 2 (Bob)');
      await client4.query('COMMIT');
      console.log('Transaction 2: COMMIT\n');

      console.log('✅ No Deadlock:');
      console.log('   Both transactions locked in same order (1 → 2)');
      console.log('   Transaction 2 waited, then proceeded after Transaction 1 committed\n');

    } finally {
      client3.release();
      client4.release();
    }

    // Task 3: Prevention Strategy 2 - Lock All Upfront
    console.log('\n\nTask 3: Prevention - Lock All Resources Upfront\n');
    console.log('Strategy: SELECT FOR UPDATE all rows at start of transaction\n');

    const client5 = await pool.connect();
    const client6 = await pool.connect();

    try {
      // Transaction 1: Lock all accounts upfront
      await client5.query('BEGIN');
      console.log('Transaction 1: BEGIN');
      await client5.query(
        'SELECT * FROM accounts_deadlock_demo WHERE id IN (1, 2) FOR UPDATE'
      );
      console.log('Transaction 1: ✓ Locked both accounts upfront (FOR UPDATE)');

      await new Promise(resolve => setTimeout(resolve, 100));

      // Transaction 2: Try to lock all accounts upfront
      await client6.query('BEGIN');
      console.log('Transaction 2: BEGIN');
      console.log('Transaction 2: Attempting to lock both accounts...');
      console.log('Transaction 2: ⏳ Waiting (Transaction 1 holds locks)\n');

      const promise2 = client6.query(
        'SELECT * FROM accounts_deadlock_demo WHERE id IN (1, 2) FOR UPDATE'
      );

      await new Promise(resolve => setTimeout(resolve, 500));

      // Transaction 1 does its work
      await client5.query('UPDATE accounts_deadlock_demo SET balance = balance + 100 WHERE id = 1');
      await client5.query('UPDATE accounts_deadlock_demo SET balance = balance + 50 WHERE id = 2');
      console.log('Transaction 1: ✓ Updated both accounts');
      await client5.query('COMMIT');
      console.log('Transaction 1: COMMIT\n');

      // Transaction 2 can now proceed
      await promise2;
      console.log('Transaction 2: ✓ Acquired locks after Transaction 1 released');
      await client6.query('UPDATE accounts_deadlock_demo SET balance = balance + 200 WHERE id = 1');
      await client6.query('COMMIT');
      console.log('Transaction 2: COMMIT\n');

      console.log('✅ No Deadlock:');
      console.log('   All locks acquired at transaction start (SELECT FOR UPDATE)');
      console.log('   No partial lock acquisition → no circular wait\n');

    } finally {
      client5.release();
      client6.release();
    }

    // Task 4: Retry Logic (Defensive Programming)
    console.log('\n\nTask 4: Retry Logic with Exponential Backoff\n');
    console.log('Strategy: Catch deadlock errors and retry automatically\n');

    let attemptCount = 0;

    try {
      await withRetry(async () => {
        attemptCount++;
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          console.log(`Attempt ${attemptCount}: BEGIN`);

          // Simulate some work that might deadlock
          await client.query(
            'UPDATE accounts_deadlock_demo SET balance = balance + 10 WHERE id = 1'
          );
          console.log(`Attempt ${attemptCount}: Updated account`);

          // Simulate conditional deadlock (first attempt fails, second succeeds)
          if (attemptCount === 1) {
            throw { code: '40P01', message: 'deadlock detected' };
          }

          await client.query('COMMIT');
          console.log(`Attempt ${attemptCount}: COMMIT\n`);
        } finally {
          client.release();
        }
      }, 3, 'Update Account');

      console.log('✅ Operation succeeded after retry\n');

    } catch (error) {
      console.error('❌ Operation failed after all retries\n');
    }

    // Show retry logic implementation
    console.log('Retry Logic Pattern:\n');
    console.log('```typescript');
    console.log('async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3) {');
    console.log('  for (let i = 0; i < maxRetries; i++) {');
    console.log('    try {');
    console.log('      return await fn();');
    console.log('    } catch (error: any) {');
    console.log('      if (error.code === \'40P01\' && i < maxRetries - 1) {');
    console.log('        // Deadlock detected, retry with exponential backoff');
    console.log('        await delay(100 * Math.pow(2, i));');
    console.log('        continue;');
    console.log('      }');
    console.log('      throw error;');
    console.log('    }');
    console.log('  }');
    console.log('}');
    console.log('```\n');

    // Cleanup
    await pool.query('DROP TABLE IF EXISTS accounts_deadlock_demo CASCADE');

  } catch (error) {
    console.error('Error:', error);
  }
}

function printInterviewQuestions() {
  console.log('\n=== Interview Questions ===\n');

  console.log('Q1: "What causes deadlocks and how do you prevent them?"\n');
  console.log('A: "Deadlocks occur when two transactions wait for each other\'s locks. Example:');
  console.log('Transaction A locks row 1 and wants row 2; Transaction B locks row 2 and wants row 1.');
  console.log('PostgreSQL detects this after 1 second (deadlock_timeout) and aborts one transaction.');
  console.log('To prevent, I use consistent lock ordering—always acquire locks in the same order,');
  console.log('like ascending ID. Or lock all rows upfront with SELECT FOR UPDATE before any updates.');
  console.log('If prevention isn\'t possible (user-driven actions), I implement retry logic—catch');
  console.log('deadlock error (code 40P01) and retry the transaction with exponential backoff.');
  console.log('Most deadlocks are preventable with careful design, but retry logic is a safety');
  console.log('net for edge cases."\n');

  console.log('Q2: "How would you debug a deadlock in production?"\n');
  console.log('A: "First, I check PostgreSQL logs for deadlock details—it logs both transactions');
  console.log('involved, which queries, and which rows. The log shows the dependency graph: \'Process A');
  console.log('waits for Process B, Process B waits for Process A.\' From this, I identify which');
  console.log('queries are conflicting. Then I check if lock order is inconsistent—maybe one query');
  console.log('updates ORDER BY id ASC, another by DESC. I can also enable log_lock_waits to see');
  console.log('queries waiting for locks before they deadlock. For prevention, I ensure all code');
  console.log('paths lock resources in the same order. If user-driven deadlocks are inevitable,');
  console.log('I add retry logic with exponential backoff."\n');

  console.log('Q3: "Explain the retry pattern for deadlocks"\n');
  console.log('A: "When a deadlock occurs, PostgreSQL aborts one transaction with error code 40P01.');
  console.log('My retry pattern catches this error and re-executes the entire transaction. I use');
  console.log('exponential backoff—first retry after 100ms, second after 200ms, third after 400ms.');
  console.log('This reduces thundering herd if many transactions deadlock simultaneously. I limit');
  console.log('retries to 3 attempts to avoid infinite loops. The tradeoff is: retries add latency');
  console.log('but prevent user-facing errors. For high-contention scenarios, I prefer preventing');
  console.log('deadlocks with consistent lock ordering rather than relying on retries."\n');
}

if (require.main === module) {
  demonstrateDeadlocks()
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

export { demonstrateDeadlocks };
