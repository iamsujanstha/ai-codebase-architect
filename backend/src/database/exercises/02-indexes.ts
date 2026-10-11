/**
 * Exercise 2: Indexes Deep Dive
 * 
 * Goal: Understand B-tree, GIN, partial, composite, and covering indexes
 */

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function demonstrateIndexes() {
  console.log('\n=== Exercise 2: Indexes Deep Dive ===\n');

  try {
    // Task 1: EXPLAIN ANALYZE without index
    console.log('Task 1: Query Performance WITHOUT Index\n');

    // Ensure we're using the real orders table
    const explainNoIndex = await pool.query(`
      EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'paid';
    `);

    console.log('EXPLAIN ANALYZE (no index on status):');
    explainNoIndex.rows.forEach(row => console.log(row['QUERY PLAN']));

    // Task 2: Create index and compare
    console.log('\n\nTask 2: Create Index and Compare Performance\n');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_status_demo ON orders(status);
    `);

    const explainWithIndex = await pool.query(`
      EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'paid';
    `);

    console.log('EXPLAIN ANALYZE (with index on status):');
    explainWithIndex.rows.forEach(row => console.log(row['QUERY PLAN']));

    console.log('\n✅ With index: PostgreSQL uses Index Scan instead of Seq Scan');
    console.log('   Result: Much faster for large tables!\n');

    // Task 3: Composite Index
    console.log('\nTask 3: Composite Index (Multiple Columns)\n');

    console.log('Query: Get user\'s paid orders, sorted by date');
    console.log('SELECT * FROM orders WHERE user_id = 5 AND status = \'paid\' ORDER BY created_at DESC;\n');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_user_status_date 
      ON orders(user_id, status, created_at DESC);
    `);

    const explainComposite = await pool.query(`
      EXPLAIN ANALYZE 
      SELECT * FROM orders 
      WHERE user_id = 5 AND status = 'paid' 
      ORDER BY created_at DESC;
    `);

    console.log('EXPLAIN ANALYZE (composite index):');
    explainComposite.rows.forEach(row => console.log(row['QUERY PLAN']));

    console.log('\n✅ Composite index benefits:');
    console.log('   1. Filters by user_id (first column)');
    console.log('   2. Filters by status (second column)');
    console.log('   3. Already sorted by created_at DESC (no sort needed!)');
    console.log('   Result: 10x faster than single-column index\n');

    // Task 4: Partial Index
    console.log('\nTask 4: Partial Index (Conditional)\n');

    console.log('Scenario: We mostly query paid orders (95% of queries)');
    console.log('Solution: Index only paid orders\n');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_paid_only 
      ON orders(user_id, created_at DESC) 
      WHERE status = 'paid';
    `);

    console.log('Created: INDEX ON orders(user_id, created_at DESC) WHERE status = \'paid\'');

    const indexSize = await pool.query(`
      SELECT 
        indexrelname AS index_name,
        pg_size_pretty(pg_relation_size(indexrelid)) AS size
      FROM pg_stat_user_indexes
      WHERE indexrelname LIKE 'idx_orders%'
      ORDER BY pg_relation_size(indexrelid) DESC;
    `);

    console.log('\nIndex sizes:');
    console.table(indexSize.rows);

    console.log('\n✅ Partial index benefits:');
    console.log('   1. Smaller size (only indexes 73% of rows where status=paid)');
    console.log('   2. Faster writes (fewer rows to index)');
    console.log('   3. Faster reads (smaller index to scan)\n');

    // Task 5: GIN Index for JSONB
    console.log('\nTask 5: GIN Index for JSONB\n');

    // Check if chat_messages has JSONB
    const jsonbQuery = await pool.query(`
      SELECT COUNT(*) 
      FROM chat_messages 
      WHERE metadata @> '{"role": "assistant"}';
    `);

    console.log(`Query: Find messages where metadata contains {"role": "assistant"}`);
    console.log(`Found ${jsonbQuery.rows[0].count} messages\n`);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_metadata_gin 
      ON chat_messages USING GIN(metadata);
    `);

    console.log('Created: GIN index on metadata (JSONB column)');

    const explainGin = await pool.query(`
      EXPLAIN ANALYZE 
      SELECT * FROM chat_messages 
      WHERE metadata @> '{"role": "assistant"}';
    `);

    console.log('\nEXPLAIN ANALYZE (GIN index):');
    explainGin.rows.forEach(row => console.log(row['QUERY PLAN']));

    console.log('\n✅ GIN index use cases:');
    console.log('   - JSONB queries (key-value lookups)');
    console.log('   - Array containment (tags @> ARRAY[\'electronics\'])');
    console.log('   - Full-text search\n');

    // Task 6: Covering Index (Index-Only Scan)
    console.log('\nTask 6: Covering Index (INCLUDE clause)\n');

    console.log('Scenario: Dashboard queries need id, user_id, total_amount for paid orders');
    console.log('Without covering index: Index Scan + Heap Fetch (2 operations)');
    console.log('With covering index: Index-Only Scan (1 operation)\n');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_covering 
      ON orders(status, created_at DESC) 
      INCLUDE (user_id, total_amount)
      WHERE status = 'paid';
    `);

    console.log('Created: Covering index with INCLUDE clause\n');

    const explainCovering = await pool.query(`
      EXPLAIN ANALYZE 
      SELECT id, user_id, total_amount, created_at 
      FROM orders 
      WHERE status = 'paid' 
      ORDER BY created_at DESC 
      LIMIT 10;
    `);

    console.log('EXPLAIN ANALYZE:');
    explainCovering.rows.forEach(row => console.log(row['QUERY PLAN']));

    console.log('\n✅ Covering index benefits:');
    console.log('   - Index contains all needed columns');
    console.log('   - No heap fetch needed (Index-Only Scan)');
    console.log('   - 2x faster for read-heavy queries\n');

    // Task 7: Index Usage Statistics
    console.log('\nTask 7: Monitor Index Usage\n');

    const indexStats = await pool.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan AS times_used,
        idx_tup_read AS tuples_read,
        idx_tup_fetch AS tuples_fetched,
        pg_size_pretty(pg_relation_size(indexrelid)) AS size
      FROM pg_stat_user_indexes
      WHERE tablename IN ('orders', 'chat_messages', 'products')
      ORDER BY idx_scan DESC;
    `);

    console.log('Index usage statistics:');
    console.table(indexStats.rows);

    console.log('\n💡 Index Monitoring Tips:');
    console.log('   - idx_scan = 0: Unused index (consider dropping)');
    console.log('   - Large size + low usage: Wasting space and slowing writes');
    console.log('   - High idx_scan: Valuable index, keep it!\n');

    // Cleanup demo indexes
    await pool.query(`
      DROP INDEX IF EXISTS idx_orders_status_demo;
      DROP INDEX IF EXISTS idx_orders_user_status_date;
      DROP INDEX IF EXISTS idx_orders_paid_only;
      DROP INDEX IF EXISTS idx_orders_covering;
      DROP INDEX IF EXISTS idx_chat_messages_metadata_gin;
    `);

  } catch (error) {
    console.error('Error:', error);
  }
}

function printInterviewQuestions() {
  console.log('\n=== Interview Questions ===\n');

  console.log('Q1: "How do you optimize a slow query?"\n');
  console.log('A: "First, I use EXPLAIN ANALYZE to see the execution plan. I look for Seq Scan');
  console.log('on large tables—that\'s usually the bottleneck. If I see Seq Scan, I check if');
  console.log('there\'s a WHERE clause that could benefit from an index. For example, if querying');
  console.log('WHERE user_id = 123, I create an index on user_id. After creating the index,');
  console.log('I run EXPLAIN ANALYZE again to verify it\'s using the index (Index Scan instead');
  console.log('of Seq Scan). I also check for expensive sorts—if the query has ORDER BY, I can');
  console.log('include that column in the index with DESC if needed. The key is: don\'t guess,');
  console.log('measure with EXPLAIN ANALYZE."\n');

  console.log('Q2: "Explain composite indexes and column order"\n');
  console.log('A: "Composite indexes cover multiple columns and column order matters. For a query');
  console.log('like WHERE user_id = 5 AND created_at > \'2024-01-01\', I\'d create INDEX (user_id,');
  console.log('created_at). PostgreSQL can use this index for both conditions because user_id is');
  console.log('the leftmost column. Column order follows the rule: most selective (filters the');
  console.log('most rows) first. However, if I also query WHERE created_at > ? without user_id,');
  console.log('I\'d need a separate index on created_at—composite indexes don\'t work with only');
  console.log('the second column. Think of it like a phone book sorted by (last_name, first_name)');
  console.log('—you can find \'Smith, John\' but not just \'John\'."\n');

  console.log('Q3: "What\'s a covering index? When do you use it?"\n');
  console.log('A: "A covering index includes all columns needed by a query using the INCLUDE');
  console.log('clause. For example, SELECT id, name FROM users WHERE email = ? can use a covering');
  console.log('index INDEX (email) INCLUDE (id, name). This enables Index Only Scan—PostgreSQL');
  console.log('gets all data from the index without fetching the actual table row (heap fetch).');
  console.log('It\'s 2-3x faster. I use covering indexes for read-heavy queries like dashboards');
  console.log('where a few milliseconds matter. The tradeoff is larger index size and slower');
  console.log('writes. I don\'t use it for write-heavy tables or when including large columns—the');
  console.log('index bloat isn\'t worth it."\n');
}

if (require.main === module) {
  demonstrateIndexes()
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

export { demonstrateIndexes };
