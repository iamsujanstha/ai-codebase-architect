import { getPool } from './db';

/**
 * EXERCISE 10: Table Partitioning & Partition Pruning
 *
 * MongoDB vs PostgreSQL:
 * - MongoDB: Partitioning across shards is done via Shard Keys (hashed or range), routing via mongos.
 *   On a single instance, MongoDB cannot easily partition a single collection into physical sub-tables.
 * - PostgreSQL: Declarative table partitioning (RANGE, LIST, HASH).
 *   A master table routes inserts to underlying partition tables based on boundary expressions.
 *   During queries, PostgreSQL performs "Partition Pruning" — completely skipping partitions outside
 *   the WHERE clause bounds, drastically cutting I/O.
 *
 * Concepts Demonstrated:
 * 1. Declarative RANGE Partitioning (e.g., historical logs/events by date)
 * 2. Automatic routing to partitions on INSERT
 * 3. Partition Pruning observed via EXPLAIN
 */
export async function runPartitioningExercise(): Promise<void> {
  const pool = getPool();
  console.log('\n======================================================');
  console.log('--- EXERCISE 10: Table Partitioning & Pruning ---');
  console.log('======================================================\n');

  try {
    // 1. Create a partitioned master table
    await pool.query(`
      DROP TABLE IF EXISTS exercise_audit_logs CASCADE;

      CREATE TABLE exercise_audit_logs (
        id SERIAL,
        event_name VARCHAR(100) NOT NULL,
        user_id INT NOT NULL,
        created_at DATE NOT NULL,
        PRIMARY KEY (id, created_at)
      ) PARTITION BY RANGE (created_at);

      -- Create individual partition tables for 2025 and 2026
      CREATE TABLE exercise_audit_logs_2025 PARTITION OF exercise_audit_logs
        FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

      CREATE TABLE exercise_audit_logs_2026 PARTITION OF exercise_audit_logs
        FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

      -- Create default partition for any out-of-range dates
      CREATE TABLE exercise_audit_logs_default PARTITION OF exercise_audit_logs
        DEFAULT;
    `);
    console.log(
      '✅ Created partitioned table `exercise_audit_logs` with partitions: 2025, 2026, default.',
    );

    // 2. Insert records across different date boundaries
    await pool.query(`
      INSERT INTO exercise_audit_logs (event_name, user_id, created_at) VALUES
        ('USER_LOGIN', 101, '2025-04-12'),
        ('PAYMENT_PROCESSED', 102, '2025-09-20'),
        ('PASSWORD_RESET', 103, '2026-02-15'),
        ('FEATURE_FLAG_TOGGLE', 104, '2026-11-01'),
        ('LEGACY_ARCHIVE_EVENT', 999, '2024-12-31');
    `);
    console.log(
      '✅ Inserted records across 2024, 2025, and 2026 into master table.',
    );

    // 3. Inspect which partition stores which rows directly
    const p2025 = await pool.query(
      'SELECT count(*) FROM exercise_audit_logs_2025;',
    );
    const p2026 = await pool.query(
      'SELECT count(*) FROM exercise_audit_logs_2026;',
    );
    const pDef = await pool.query(
      'SELECT count(*) FROM exercise_audit_logs_default;',
    );

    console.log(`\nPartition Distribution:`);
    console.log(`  - exercise_audit_logs_2025:    ${p2025.rows[0].count} rows`);
    console.log(`  - exercise_audit_logs_2026:    ${p2026.rows[0].count} rows`);
    console.log(
      `  - exercise_audit_logs_default: ${pDef.rows[0].count} rows (2024 legacy date)`,
    );

    // 4. Demonstrate Partition Pruning using EXPLAIN
    console.log(
      '\n--- Partition Pruning Demonstration (EXPLAIN query for 2026 only) ---',
    );
    const prunePlan = await pool.query(`
      EXPLAIN
      SELECT * FROM exercise_audit_logs
      WHERE created_at >= '2026-01-01' AND created_at < '2026-12-31';
    `);
    prunePlan.rows.forEach((r) => console.log('  ', r['QUERY PLAN']));
    console.log(
      '👉 Notice PostgreSQL ONLY scans `exercise_audit_logs_2026` and prunes `2025` & `default` completely!',
    );

    // Clean up
    await pool.query(`DROP TABLE IF EXISTS exercise_audit_logs CASCADE;`);
    console.log('\n✅ Cleaned up partition tables.');
  } catch (error) {
    console.error('❌ Exercise 10 failed:', error);
    throw error;
  }
}

if (require.main === module) {
  runPartitioningExercise()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
