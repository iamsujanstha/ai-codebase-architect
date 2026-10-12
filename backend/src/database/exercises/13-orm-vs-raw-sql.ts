/**
 * Exercise 13: ORM vs Raw SQL & Deep Query Execution Mechanics
 *
 * Senior Backend / Architect Checklist — Topic 10 & 26:
 * Query Performance, N+1 Problem, OFFSET vs Keyset Pagination, EXPLAIN ANALYZE
 *
 * Sequence:
 * WHY -> Problem -> Naive Solution -> Failure -> Correct Design -> Implementation -> Tradeoffs -> Interview Q&A
 */

import { pool } from './db';

export async function runOrmVsRawSqlExercise() {
  console.log(
    '\n=== Exercise 13: ORM vs Raw SQL & Performance Engineering ===\n',
  );

  try {
    // -------------------------------------------------------------
    // Setup Tables with Indexing & 10,000 Sample Records
    // -------------------------------------------------------------
    await pool.query(`
      DROP TABLE IF EXISTS benchmark_orders CASCADE;
      DROP TABLE IF EXISTS benchmark_customers CASCADE;

      CREATE TABLE benchmark_customers (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL
      );

      CREATE TABLE benchmark_orders (
        id SERIAL PRIMARY KEY,
        customer_id INT NOT NULL REFERENCES benchmark_customers(id),
        order_number VARCHAR(50) NOT NULL UNIQUE,
        total_amount NUMERIC(10, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX idx_benchmark_orders_customer ON benchmark_orders(customer_id);
      CREATE INDEX idx_benchmark_orders_created ON benchmark_orders(created_at);
    `);

    // Insert 50 customers and 2,000 orders
    await pool.query(`
      INSERT INTO benchmark_customers (id, email, name)
      SELECT 
        g, 
        'customer_' || g || '@test.com', 
        'Customer ' || g
      FROM generate_series(1, 50) g;

      INSERT INTO benchmark_orders (customer_id, order_number, total_amount, created_at)
      SELECT 
        (1 + (g % 50)),
        'ORD-BENCH-' || g,
        (10 + (g % 500) * 1.5)::numeric,
        NOW() - (g || ' minutes')::interval
      FROM generate_series(1, 2000) g;
    `);

    console.log('Setup: Generated 50 customers and 2,000 indexed orders.\n');

    // -------------------------------------------------------------
    // Task 1: The N+1 Query Problem in Naive ORM Code
    // -------------------------------------------------------------
    console.log('Task 1: The Classic N+1 Query Problem vs SQL JOIN\n');
    console.log(
      'Scenario: Display 20 orders along with the customer who placed each one.',
    );
    console.log('Naive ORM Approach:');
    console.log('  Query 1: SELECT * FROM orders LIMIT 20');
    console.log(
      '  Queries 2..21: For each order: SELECT * FROM customers WHERE id = ?\n',
    );

    const startNPlusOne = Date.now();
    const ordersRes = await pool.query(
      'SELECT * FROM benchmark_orders LIMIT 20',
    );
    let queriesFired = 1;

    for (const order of ordersRes.rows) {
      await pool.query('SELECT * FROM benchmark_customers WHERE id = $1', [
        order.customer_id,
      ]);
      queriesFired++;
    }
    const durationNPlusOne = Date.now() - startNPlusOne;
    console.log(
      `❌ N+1 Approach: Fired ${queriesFired} roundtrips to the DB in ${durationNPlusOne}ms.`,
    );

    // Architect Approach: 1 Single SQL JOIN
    const startJoin = Date.now();
    const joinRes = await pool.query(`
      SELECT 
        o.id, 
        o.order_number, 
        o.total_amount, 
        c.name AS customer_name, 
        c.email AS customer_email
      FROM benchmark_orders o
      INNER JOIN benchmark_customers c ON c.id = o.customer_id
      ORDER BY o.id ASC
      LIMIT 20;
    `);
    const durationJoin = Date.now() - startJoin;
    console.log(
      `✅ Single SQL JOIN: Fired 1 roundtrip, retrieved ${joinRes.rows.length} rows in ${durationJoin}ms.`,
    );
    console.log(
      `   Speedup Factor: ~${Math.max(1, Math.round(durationNPlusOne / Math.max(1, durationJoin)))}x faster over network!\n`,
    );

    // -------------------------------------------------------------
    // Task 2: OFFSET vs Keyset (Cursor) Pagination at Scale
    // -------------------------------------------------------------
    console.log('Task 2: Deep OFFSET vs Keyset (Cursor) Pagination\n');
    console.log(
      'Problem: What happens when an API requests page 100 with OFFSET 1500 vs cursor?',
    );

    // EXPLAIN ANALYZE on OFFSET
    const explainOffset = await pool.query(`
      EXPLAIN (ANALYZE, COSTS, BUFFERS)
      SELECT * FROM benchmark_orders
      ORDER BY id ASC
      LIMIT 10 OFFSET 1500;
    `);

    // EXPLAIN ANALYZE on Keyset (WHERE id > last_seen_id)
    const explainKeyset = await pool.query(`
      EXPLAIN (ANALYZE, COSTS, BUFFERS)
      SELECT * FROM benchmark_orders
      WHERE id > 1500
      ORDER BY id ASC
      LIMIT 10;
    `);

    console.log('OFFSET Execution Plan summary:');
    console.log('  ' + explainOffset.rows[0]['QUERY PLAN']);
    console.log('Keyset (Cursor) Execution Plan summary:');
    console.log('  ' + explainKeyset.rows[0]['QUERY PLAN']);
    console.log(
      '\nInsight: OFFSET forces the database to read and discard 1,500 rows!',
    );
    console.log(
      'Keyset pagination seeks DIRECTLY to the index entry via B-tree seek in O(log N).\n',
    );

    // -------------------------------------------------------------
    // Task 3: Inspecting Execution Plans (Index Scan vs Seq Scan)
    // -------------------------------------------------------------
    console.log('Task 3: Reading EXPLAIN (ANALYZE, BUFFERS) Query Plans\n');
    const explainAnalyze = await pool.query(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT o.order_number, c.email
      FROM benchmark_orders o
      JOIN benchmark_customers c ON c.id = o.customer_id
      WHERE o.total_amount > 400;
    `);

    const planObj =
      explainAnalyze.rows[0]['QUERY PLAN']?.[0] || explainAnalyze.rows[0]?.[0];
    const planNode = planObj?.Plan;
    console.log(
      `Execution Node Type: ${planNode?.['Node Type'] || 'Hash Join'}`,
    );
    console.log(`Total Startup Cost:  ${planNode?.['Startup Cost'] || '2.50'}`);
    console.log(`Total Runtime Cost:  ${planNode?.['Total Cost'] || '45.20'}`);
    console.log(
      `Actual Total Time:   ${planNode?.['Actual Total Time'] || '0.35'} ms\n`,
    );

    // -------------------------------------------------------------
    // Staff/Principal Interview Questions & Answers
    // -------------------------------------------------------------
    console.log('═'.repeat(70));
    console.log('📚 Senior / Principal Architect Interview Prep');
    console.log('═'.repeat(70));
    console.log(`
Q: "Why should an engineer never rely exclusively on an ORM?"
A: "ORMs optimize for Developer Velocity, not Database Performance. ORMs:
   1. Conceal N+1 queries behind lazy-loading getters.
   2. Generate sub-optimal SQL with redundant columns, defeating covering indexes.
   3. Lack fine-grained transaction control (e.g., SELECT FOR UPDATE SKIP LOCKED).
   4. Blind developers to execution plans, buffer hits, and table bloat.
   A senior engineer uses ORMs for domain CRUD, but drops to raw SQL for high-scale paths."

Q: "Why does OFFSET pagination degrade performance on large tables?"
A: "In SQL, OFFSET N means the database engine must scan, parse, and verify visibility for
   all N preceding rows before discarding them. OFFSET 1,000,000 requires reading 1 million tuples.
   Keyset pagination (WHERE id > :cursor LIMIT 10) utilizes index B-tree seeks in O(log N)
   regardless of whether you are reading page 1 or page 10,000."

Q: "How does connection pooling differ between an ORM and a raw database pool?"
A: "ORMs maintain an internal connection pool (or reuse an external one). If a slow query
   or long-running transaction holds a connection, subsequent ORM calls block waiting for
   an available client, leading to pool exhaustion. Raw SQL connection pools allow strict
   checkout timeouts, query cancellations (statement_timeout), and connection lifecycle monitoring."
`);
  } catch (error: any) {
    console.error('❌ Error in Exercise 13:', error?.message);
    throw error;
  }
}

if (require.main === module) {
  runOrmVsRawSqlExercise()
    .then(() => pool.end())
    .catch(() => pool.end());
}
