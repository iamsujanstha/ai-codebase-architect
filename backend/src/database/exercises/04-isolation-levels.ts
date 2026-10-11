/**
 * Exercise 4: Isolation Levels
 * 
 * Goal: Understand READ COMMITTED, REPEATABLE READ, and SERIALIZABLE
 */

import { PoolClient } from 'pg';
import { pool } from './db';

async function demonstrateIsolationLevels() {
  console.log('\n=== Exercise 4: Isolation Levels ===\n');

  try {
    // Setup: Create test table
    await pool.query(`
      DROP TABLE IF EXISTS products_isolation_demo CASCADE;
      
      CREATE TABLE products_isolation_demo (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        price DECIMAL(10, 2),
        stock INTEGER
      );

      INSERT INTO products_isolation_demo (name, price, stock) VALUES 
        ('Laptop', 1299.99, 10),
        ('Mouse', 29.99, 50),
        ('Keyboard', 79.99, 30);
    `);

    console.log('Setup: Created products_isolation_demo table\n');

    // Task 1: READ COMMITTED (Default) - Non-Repeatable Reads
    console.log('Task 1: READ COMMITTED (Default Isolation Level)\n');
    console.log('Scenario: Non-repeatable reads are possible\n');

    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      // Transaction 1: Start and read
      await client1.query('BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED');
      console.log('Transaction 1: BEGIN (READ COMMITTED)');

      const read1 = await client1.query(
        'SELECT * FROM products_isolation_demo WHERE name = $1',
        ['Laptop']
      );
      console.log('Transaction 1: First read - Price:', read1.rows[0].price);

      // Transaction 2: Update price while Transaction 1 is still open
      await client2.query(
        'UPDATE products_isolation_demo SET price = 1399.99 WHERE name = $1',
        ['Laptop']
      );
      console.log('Transaction 2: Updated price to 1399.99 (COMMITTED immediately)\n');

      // Transaction 1: Read again (same transaction)
      const read2 = await client1.query(
        'SELECT * FROM products_isolation_demo WHERE name = $1',
        ['Laptop']
      );
      console.log('Transaction 1: Second read - Price:', read2.rows[0].price);

      await client1.query('COMMIT');
      console.log('Transaction 1: COMMIT\n');

      console.log('⚠️  Non-Repeatable Read Occurred:');
      console.log(`   First read:  $${read1.rows[0].price}`);
      console.log(`   Second read: $${read2.rows[0].price}`);
      console.log('   Same query, different result within same transaction!\n');

    } finally {
      client1.release();
      client2.release();
    }

    // Task 2: REPEATABLE READ - Consistent Snapshot
    console.log('\n\nTask 2: REPEATABLE READ (Consistent Snapshot)\n');
    console.log('Scenario: Same query returns same result throughout transaction\n');

    const client3 = await pool.connect();
    const client4 = await pool.connect();

    try {
      // Transaction 1: Start with REPEATABLE READ
      await client3.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      console.log('Transaction 1: BEGIN (REPEATABLE READ)');

      const read1 = await client3.query(
        'SELECT * FROM products_isolation_demo WHERE name = $1',
        ['Mouse']
      );
      console.log('Transaction 1: First read - Price:', read1.rows[0].price);

      // Transaction 2: Update price
      await client4.query(
        'UPDATE products_isolation_demo SET price = 39.99 WHERE name = $1',
        ['Mouse']
      );
      console.log('Transaction 2: Updated price to 39.99 (COMMITTED)\n');

      // Transaction 1: Read again (should see old value)
      const read2 = await client3.query(
        'SELECT * FROM products_isolation_demo WHERE name = $1',
        ['Mouse']
      );
      console.log('Transaction 1: Second read - Price:', read2.rows[0].price);

      await client3.query('COMMIT');
      console.log('Transaction 1: COMMIT\n');

      console.log('✅ Repeatable Read Guaranteed:');
      console.log(`   First read:  $${read1.rows[0].price}`);
      console.log(`   Second read: $${read2.rows[0].price}`);
      console.log('   Same result! Transaction 1 sees consistent snapshot.\n');

      // Verify the update is visible after commit
      const afterCommit = await pool.query(
        'SELECT price FROM products_isolation_demo WHERE name = $1',
        ['Mouse']
      );
      console.log('After Transaction 1 commits:');
      console.log(`   New query sees: $${afterCommit.rows[0].price}\n`);

    } finally {
      client3.release();
      client4.release();
    }

    // Task 3: SERIALIZABLE - Prevent Write Skew
    console.log('\n\nTask 3: SERIALIZABLE (Strictest Isolation)\n');
    console.log('Scenario: Prevent write skew - both transactions read, both write\n');

    const client5 = await pool.connect();
    const client6 = await pool.connect();

    try {
      // Reset stock
      await pool.query('UPDATE products_isolation_demo SET stock = 10');

      // Transaction 1: Check total stock and decrement
      await client5.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      console.log('Transaction 1: BEGIN (SERIALIZABLE)');

      const total1 = await client5.query(
        'SELECT SUM(stock) AS total FROM products_isolation_demo'
      );
      console.log('Transaction 1: Total stock =', total1.rows[0].total);

      // Transaction 2: Also check total stock and decrement
      await client6.query('BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE');
      console.log('Transaction 2: BEGIN (SERIALIZABLE)');

      const total2 = await client6.query(
        'SELECT SUM(stock) AS total FROM products_isolation_demo'
      );
      console.log('Transaction 2: Total stock =', total2.rows[0].total, '\n');

      // Both read same total (90), both decide to decrement
      await client5.query(
        'UPDATE products_isolation_demo SET stock = stock - 5 WHERE name = $1',
        ['Laptop']
      );
      console.log('Transaction 1: Decremented Laptop stock by 5');

      await client6.query(
        'UPDATE products_isolation_demo SET stock = stock - 5 WHERE name = $1',
        ['Mouse']
      );
      console.log('Transaction 2: Decremented Mouse stock by 5\n');

      // Commit Transaction 1
      await client5.query('COMMIT');
      console.log('Transaction 1: COMMIT succeeded\n');

      // Try to commit Transaction 2
      try {
        await client6.query('COMMIT');
        console.log('Transaction 2: COMMIT succeeded\n');
        console.log('❌ Both transactions succeeded (write skew not prevented)');
      } catch (error: any) {
        console.log('Transaction 2: COMMIT failed!');
        console.log(`   Error: ${error.message}\n`);
        console.log('✅ SERIALIZABLE Prevented Write Skew:');
        console.log('   PostgreSQL detected conflicting reads/writes');
        console.log('   One transaction must retry\n');
        await client6.query('ROLLBACK');
      }

    } finally {
      client5.release();
      client6.release();
    }

    // Task 4: Phantom Reads (Prevented in PostgreSQL's REPEATABLE READ)
    console.log('\n\nTask 4: Phantom Reads\n');
    console.log('Note: PostgreSQL\'s REPEATABLE READ prevents phantom reads\n');
    console.log('(This is stronger than the SQL standard requires)\n');

    const client7 = await pool.connect();
    const client8 = await pool.connect();

    try {
      await client7.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      console.log('Transaction 1: BEGIN (REPEATABLE READ)');

      const count1 = await client7.query(
        'SELECT COUNT(*) FROM products_isolation_demo WHERE price > 50'
      );
      console.log('Transaction 1: Count of products > $50 =', count1.rows[0].count);

      // Transaction 2: Insert new expensive product
      await client8.query(`
        INSERT INTO products_isolation_demo (name, price, stock)
        VALUES ('Monitor', 299.99, 20)
      `);
      console.log('Transaction 2: Inserted Monitor ($299.99) - COMMITTED\n');

      // Transaction 1: Count again
      const count2 = await client7.query(
        'SELECT COUNT(*) FROM products_isolation_demo WHERE price > 50'
      );
      console.log('Transaction 1: Count again =', count2.rows[0].count);

      await client7.query('COMMIT');
      console.log('Transaction 1: COMMIT\n');

      console.log('✅ Phantom Read Prevented:');
      console.log(`   First count:  ${count1.rows[0].count}`);
      console.log(`   Second count: ${count2.rows[0].count}`);
      console.log('   PostgreSQL\'s REPEATABLE READ prevents phantom reads!\n');

    } finally {
      client7.release();
      client8.release();
    }

    // Summary Table
    console.log('\n\n=== Isolation Level Comparison ===\n');
    console.log('┌────────────────────┬──────────────┬────────────────────┬──────────────┐');
    console.log('│ Isolation Level    │ Dirty Read   │ Non-Repeatable Read│ Phantom Read │');
    console.log('├────────────────────┼──────────────┼────────────────────┼──────────────┤');
    console.log('│ READ COMMITTED     │ ❌ Prevented │ ✅ Possible         │ ✅ Possible   │');
    console.log('│ REPEATABLE READ    │ ❌ Prevented │ ❌ Prevented        │ ❌ Prevented* │');
    console.log('│ SERIALIZABLE       │ ❌ Prevented │ ❌ Prevented        │ ❌ Prevented  │');
    console.log('└────────────────────┴──────────────┴────────────────────┴──────────────┘');
    console.log('\n* PostgreSQL\'s REPEATABLE READ is stronger than SQL standard\n');

    // Cleanup
    await pool.query('DROP TABLE IF EXISTS products_isolation_demo CASCADE');

  } catch (error) {
    console.error('Error:', error);
  }
}

function printInterviewQuestions() {
  console.log('\n=== Interview Questions ===\n');

  console.log('Q1: "Explain isolation levels and when to use each"\n');
  console.log('A: "PostgreSQL has three practical isolation levels. READ COMMITTED is the default');
  console.log('and most common—each query sees committed data as of query start. This allows');
  console.log('non-repeatable reads but is fast. I use it for most cases. REPEATABLE READ gives');
  console.log('a consistent snapshot—once a transaction starts, it sees the same data throughout,');
  console.log('even if other transactions commit. I use this for checkout to ensure product prices');
  console.log('don\'t change mid-transaction, or for financial reports where consistency matters.');
  console.log('SERIALIZABLE is strictest—it detects conflicts and aborts one transaction if two');
  console.log('might interfere. I use this for banking or inventory where race conditions are');
  console.log('unacceptable. The tradeoff is performance: READ COMMITTED is fastest, SERIALIZABLE');
  console.log('is slowest with highest abort rate needing retry logic."\n');

  console.log('Q2: "What\'s the difference between REPEATABLE READ and SERIALIZABLE?"\n');
  console.log('A: "Both prevent non-repeatable reads, but SERIALIZABLE also prevents write skew—a');
  console.log('subtle anomaly where two transactions read overlapping data and make conflicting');
  console.log('writes based on what they read. Example: Two transactions check if SUM(balance) > 1000,');
  console.log('both see $1000, both withdraw $600. Final balance is -$200. REPEATABLE READ allows');
  console.log('this; SERIALIZABLE detects it and aborts one transaction. The detection uses predicate');
  console.log('locks—tracking not just rows read, but the conditions used. Tradeoff: SERIALIZABLE is');
  console.log('slower and has higher abort rate. I use REPEATABLE READ for most cases and SERIALIZABLE');
  console.log('only when write skew must be prevented, like banking."\n');

  console.log('Q3: "How does PostgreSQL implement REPEATABLE READ?"\n');
  console.log('A: "PostgreSQL uses MVCC—Multi-Version Concurrency Control. Each transaction gets a');
  console.log('snapshot at BEGIN. When reading a row, PostgreSQL checks the transaction ID (XID) that');
  console.log('created/modified it. If the XID is after the snapshot, that version is invisible to');
  console.log('the transaction. This allows concurrent readers and writers without blocking—readers');
  console.log('see old versions, writers create new versions. Dead tuples (old versions) are cleaned');
  console.log('up by VACUUM. The genius is: readers never block writers, writers never block readers.');
  console.log('The tradeoff is disk space—multiple versions exist until vacuumed—and XID wraparound');
  console.log('risk if VACUUM doesn\'t run."\n');
}

if (require.main === module) {
  demonstrateIsolationLevels()
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

export { demonstrateIsolationLevels };
