import { getPool } from './db';

/**
 * EXERCISE 09: Query Optimization & EXPLAIN ANALYZE
 *
 * MongoDB vs PostgreSQL:
 * - MongoDB: `db.collection.explain("executionStats")` gives winningPlan (COLLSCAN vs IXSCAN).
 * - PostgreSQL: `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS)` provides deep relational planner execution stats:
 *   cost estimates, actual execution time, buffer hits (shared hit vs read from disk), join mechanisms
 *   (Nested Loop, Hash Join, Merge Join), and sort spills.
 *
 * Concepts Demonstrated:
 * 1. Sequential Scan vs Index Scan
 * 2. Hash Join vs Nested Loop Join
 * 3. Buffer Hits and Execution Planning
 */
export async function runQueryOptimizationExercise(): Promise<void> {
  const pool = getPool();
  console.log('\n===========================================================');
  console.log('--- EXERCISE 09: Query Optimization & EXPLAIN ANALYZE ---');
  console.log('===========================================================\n');

  try {
    // 1. Setup sample dataset with 5,000 rows to observe planner decisions
    await pool.query(`
      DROP TABLE IF EXISTS exercise_opt_orders CASCADE;
      DROP TABLE IF EXISTS exercise_opt_users CASCADE;

      CREATE TABLE exercise_opt_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        country VARCHAR(50) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE exercise_opt_orders (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        status VARCHAR(20) NOT NULL
      );

      -- Populate 5,000 users
      INSERT INTO exercise_opt_users (username, country)
      SELECT 
        'user_' || i, 
        CASE WHEN i % 5 = 0 THEN 'USA' WHEN i % 5 = 1 THEN 'GERMANY' WHEN i % 5 = 2 THEN 'JAPAN' ELSE 'OTHER' END
      FROM generate_series(1, 2000) AS i;

      -- Populate 6,000 orders
      INSERT INTO exercise_opt_orders (user_id, amount, status)
      SELECT 
        (i % 2000) + 1,
        (i % 500) + 10.50,
        CASE WHEN i % 3 = 0 THEN 'COMPLETED' ELSE 'PENDING' END
      FROM generate_series(1, 4000) AS i;
    `);
    console.log(
      '✅ Generated 2,000 users and 4,000 orders for query planner analysis.',
    );

    // 2. Unindexed Query: Sequential Scan
    console.log('\n--- 1. Query Plan WITHOUT Index (Seq Scan) ---');
    const seqPlan = await pool.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT * FROM exercise_opt_users WHERE country = 'JAPAN';
    `);
    seqPlan.rows.forEach((r) => console.log('  ', r['QUERY PLAN']));

    // 3. Add Index and Compare: Index Scan / Bitmap Index Scan
    console.log(
      '\n--- 2. Creating Index on country & Re-running EXPLAIN ANALYZE ---',
    );
    await pool.query(
      `CREATE INDEX idx_opt_users_country ON exercise_opt_users(country);`,
    );

    const idxPlan = await pool.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT * FROM exercise_opt_users WHERE country = 'JAPAN';
    `);
    idxPlan.rows.forEach((r) => console.log('  ', r['QUERY PLAN']));

    // 4. Join Query Planning: Hash Join vs Nested Loop
    console.log(
      '\n--- 3. Analyzing Join Strategy (Hash Join between Users and Orders) ---',
    );
    const joinPlan = await pool.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT u.username, u.country, SUM(o.amount) as total_spent
      FROM exercise_opt_users u
      JOIN exercise_opt_orders o ON u.id = o.user_id
      WHERE u.country = 'USA'
      GROUP BY u.username, u.country;
    `);
    joinPlan.rows.forEach((r) => console.log('  ', r['QUERY PLAN']));

    // Clean up
    await pool.query(`
      DROP TABLE IF EXISTS exercise_opt_orders CASCADE;
      DROP TABLE IF EXISTS exercise_opt_users CASCADE;
    `);
    console.log('\n✅ Cleaned up optimization tables.');
  } catch (error) {
    console.error('❌ Exercise 09 failed:', error);
    throw error;
  }
}

if (require.main === module) {
  runQueryOptimizationExercise()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
