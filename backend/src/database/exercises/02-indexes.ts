/**
 * Exercise 2: Indexes Deep Dive
 *
 * Goal: Understand B-tree, GIN, partial, composite, and covering indexes
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY THIS MATTERS (Production Importance)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Indexes are the single most impactful performance lever in any relational
 * database. Without an index, PostgreSQL performs a Sequential Scan — reading
 * every single row from disk. With an index, it jumps directly to matching rows.
 *
 * Real-world impact:
 *
 * 1. MISSING INDEX ON FOREIGN KEY:
 *    A ride-sharing app had `rides(driver_id)` without an index. The admin
 *    dashboard query `SELECT * FROM rides WHERE driver_id = ?` scanned 50M rows
 *    on every page load (800ms). Adding `CREATE INDEX idx_rides_driver ON rides(driver_id)`
 *    dropped it to 2ms — a 400x improvement with zero code changes.
 *
 * 2. WRONG INDEX ORDER (Composite Index Trap):
 *    A developer created `CREATE INDEX ON orders(status, created_at)` but the
 *    most common query filtered by `created_at` first and status second.
 *    The index was useless because B-tree indexes are left-to-right: the leftmost
 *    column must appear in the WHERE clause for the index to be used.
 *
 * 3. INDEX BLOAT (Write Penalty):
 *    A logging service added 8 indexes on a high-write table. Write throughput
 *    dropped 60% because every INSERT updated 8 separate B-tree structures.
 *    Rule of thumb: each index adds ~10-15% write overhead.
 *
 * In Atlas Commerce Lab:
 *   - `idx_products_name_trgm` uses GIN trigram index for fuzzy product search.
 *   - `idx_products_category_stock` is a partial composite index (WHERE stock > 0)
 *     to skip out-of-stock products from catalog queries entirely.
 *   - `product_embeddings` uses an HNSW index for vector cosine similarity search.
 *   - `idx_orders_user_created` is a composite index optimized for the "My Orders"
 *     page: `WHERE user_id = ? ORDER BY created_at DESC`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FROM SCRATCH (How B-tree Indexes Work Internally)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * A B-tree index is a balanced tree structure stored on disk as 8KB pages:
 *
 *   Level 0 (Root):     [ ... | key=500 | ... | key=1000 | ... ]
 *                        /                |                  \
 *   Level 1 (Internal): [100,200,300]   [600,700,800]     [1100,1200]
 *                        /    |    \      /    |    \        /    |
 *   Level 2 (Leaf):    [→row] [→row]  [→row] [→row]     [→row] [→row]
 *
 * How a lookup works (e.g., WHERE id = 750):
 *   1. Start at root page. Binary search: 500 < 750 < 1000 → follow middle pointer.
 *   2. Arrive at internal page [600,700,800]. Binary search: 700 < 750 < 800 → follow pointer.
 *   3. Arrive at leaf page. Find key 750 → read the heap tuple pointer (ctid) → fetch row.
 *   Total I/O: 3 page reads (for millions of rows). Sequential scan: thousands of page reads.
 *
 * Index types and when to use each:
 *   - B-tree (default):  Equality (=) and range (<, >, BETWEEN, ORDER BY). 95% of indexes.
 *   - GIN:               Full-text search (tsvector), JSONB containment (@>), array membership.
 *   - GiST:              Geometric/spatial data, range types, nearest-neighbor.
 *   - BRIN:              Append-only tables (logs, events) where data is physically ordered.
 *                         Tiny index size (~1000x smaller than B-tree) but only useful for
 *                         correlated data (e.g., timestamp column on an append-only table).
 *   - HNSW (pgvector):   Approximate nearest-neighbor vector similarity search.
 *
 * Partial indexes — index only the rows you query:
 *   CREATE INDEX idx_active_users ON users(email) WHERE is_active = true;
 *   → Index is 10x smaller if 90% of users are inactive. Faster scans, less RAM.
 *
 * Covering indexes — avoid touching the table entirely:
 *   CREATE INDEX idx_orders_cover ON orders(user_id) INCLUDE (total_amount, status);
 *   → Query `SELECT total_amount, status FROM orders WHERE user_id = ?` is served
 *     entirely from the index (Index-Only Scan). Zero heap page reads.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTERVIEW Q&A (Senior / Staff Level)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Q1: "A query is slow. Walk me through how you'd diagnose and fix it."
 * A:  1. Run `EXPLAIN (ANALYZE, BUFFERS)` to see the actual execution plan.
 *     2. Look for Sequential Scans on large tables — indicates a missing index.
 *     3. Check "Rows Removed by Filter" — high value means the index is not selective.
 *     4. Check "Shared Hit" vs "Shared Read" — reads from disk mean poor cache locality.
 *     5. If a Seq Scan is chosen despite an index existing, check if the query filters
 *        on the wrong column order (composite index) or if the table statistics are stale
 *        (run ANALYZE to refresh planner statistics).
 *
 * Q2: "What's the difference between a composite index and two separate indexes?"
 * A:  A composite index `(a, b)` is a single sorted structure: sorted by `a` first,
 *     then by `b` within each `a` group. It supports: WHERE a = ?, WHERE a = ? AND b = ?,
 *     and WHERE a = ? ORDER BY b. It does NOT efficiently support WHERE b = ? alone.
 *     Two separate indexes can be combined via a Bitmap Index Scan, but this is slower
 *     than a single composite index for multi-column queries.
 *
 * Q3: "When would you NOT add an index?"
 * A:  (1) Small tables (<1000 rows) — Seq Scan is faster than index overhead.
 *     (2) High-write, low-read tables (audit logs) — each index adds write penalty.
 *     (3) Low-selectivity columns (boolean `is_active` with 95% true) — the index
 *     won't reduce scan work enough to justify its cost. Exception: partial index
 *     `WHERE is_active = false` on the rare condition IS effective.
 *
 * Q4: "What is index bloat and how do you fix it?"
 * A:  When rows are updated or deleted, the old index entries become dead but are
 *     not immediately reclaimed. Over time, the index grows much larger than needed,
 *     wasting RAM and slowing scans. Fix: REINDEX CONCURRENTLY (non-blocking rebuild)
 *     or tune autovacuum to run more aggressively on high-churn tables.
 *
 * Q5: "Explain covering indexes and Index-Only Scans."
 * A:  A covering index includes all columns needed by a query via the INCLUDE clause.
 *     When the query can be answered entirely from the index without touching the
 *     heap table, PostgreSQL performs an Index-Only Scan — dramatically faster because
 *     it avoids random I/O to the table pages. The visibility map must confirm rows
 *     are visible (post-VACUUM) for this optimization to trigger.
 */

import { pool } from './db';

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
    explainNoIndex.rows.forEach((row) => console.log(row['QUERY PLAN']));

    // Task 2: Create index and compare
    console.log('\n\nTask 2: Create Index and Compare Performance\n');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_orders_status_demo ON orders(status);
    `);

    const explainWithIndex = await pool.query(`
      EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'paid';
    `);

    console.log('EXPLAIN ANALYZE (with index on status):');
    explainWithIndex.rows.forEach((row) => console.log(row['QUERY PLAN']));

    console.log(
      '\n✅ With index: PostgreSQL uses Index Scan instead of Seq Scan',
    );
    console.log('   Result: Much faster for large tables!\n');

    // Task 3: Composite Index
    console.log('\nTask 3: Composite Index (Multiple Columns)\n');

    console.log("Query: Get user's paid orders, sorted by date");
    console.log(
      "SELECT * FROM orders WHERE user_id = 5 AND status = 'paid' ORDER BY created_at DESC;\n",
    );

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
    explainComposite.rows.forEach((row) => console.log(row['QUERY PLAN']));

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

    console.log(
      "Created: INDEX ON orders(user_id, created_at DESC) WHERE status = 'paid'",
    );

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
    console.log(
      '   1. Smaller size (only indexes 73% of rows where status=paid)',
    );
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

    console.log(
      `Query: Find messages where metadata contains {"role": "assistant"}`,
    );
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
    explainGin.rows.forEach((row) => console.log(row['QUERY PLAN']));

    console.log('\n✅ GIN index use cases:');
    console.log('   - JSONB queries (key-value lookups)');
    console.log("   - Array containment (tags @> ARRAY['electronics'])");
    console.log('   - Full-text search\n');

    // Task 6: Covering Index (Index-Only Scan)
    console.log('\nTask 6: Covering Index (INCLUDE clause)\n');

    console.log(
      'Scenario: Dashboard queries need id, user_id, total_amount for paid orders',
    );
    console.log(
      'Without covering index: Index Scan + Heap Fetch (2 operations)',
    );
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
    explainCovering.rows.forEach((row) => console.log(row['QUERY PLAN']));

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
    console.log(
      '   - Large size + low usage: Wasting space and slowing writes',
    );
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
  console.log(
    'A: "First, I use EXPLAIN ANALYZE to see the execution plan. I look for Seq Scan',
  );
  console.log(
    "on large tables—that's usually the bottleneck. If I see Seq Scan, I check if",
  );
  console.log(
    "there's a WHERE clause that could benefit from an index. For example, if querying",
  );
  console.log(
    'WHERE user_id = 123, I create an index on user_id. After creating the index,',
  );
  console.log(
    "I run EXPLAIN ANALYZE again to verify it's using the index (Index Scan instead",
  );
  console.log(
    'of Seq Scan). I also check for expensive sorts—if the query has ORDER BY, I can',
  );
  console.log(
    "include that column in the index with DESC if needed. The key is: don't guess,",
  );
  console.log('measure with EXPLAIN ANALYZE."\n');

  console.log('Q2: "Explain composite indexes and column order"\n');
  console.log(
    'A: "Composite indexes cover multiple columns and column order matters. For a query',
  );
  console.log(
    "like WHERE user_id = 5 AND created_at > '2024-01-01', I'd create INDEX (user_id,",
  );
  console.log(
    'created_at). PostgreSQL can use this index for both conditions because user_id is',
  );
  console.log(
    'the leftmost column. Column order follows the rule: most selective (filters the',
  );
  console.log(
    'most rows) first. However, if I also query WHERE created_at > ? without user_id,',
  );
  console.log(
    "I'd need a separate index on created_at—composite indexes don't work with only",
  );
  console.log(
    'the second column. Think of it like a phone book sorted by (last_name, first_name)',
  );
  console.log("—you can find 'Smith, John' but not just 'John'.\"\n");

  console.log('Q3: "What\'s a covering index? When do you use it?"\n');
  console.log(
    'A: "A covering index includes all columns needed by a query using the INCLUDE',
  );
  console.log(
    'clause. For example, SELECT id, name FROM users WHERE email = ? can use a covering',
  );
  console.log(
    'index INDEX (email) INCLUDE (id, name). This enables Index Only Scan—PostgreSQL',
  );
  console.log(
    'gets all data from the index without fetching the actual table row (heap fetch).',
  );
  console.log(
    "It's 2-3x faster. I use covering indexes for read-heavy queries like dashboards",
  );
  console.log(
    'where a few milliseconds matter. The tradeoff is larger index size and slower',
  );
  console.log(
    "writes. I don't use it for write-heavy tables or when including large columns—the",
  );
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
