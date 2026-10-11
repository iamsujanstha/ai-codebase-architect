import { getPool } from './db';

/**
 * EXERCISE 11: Replication, WAL (Write-Ahead Logging), & Architecture
 * 
 * MongoDB vs PostgreSQL:
 * - MongoDB Replica Sets:
 *   - Replicates via the `local.oplog.rs` collection.
 *   - Automatic failover using internal Raft-like elections (Primary + Secondaries).
 *   - Read preferences: primary, primaryPreferred, secondary, nearest.
 * 
 * - PostgreSQL Replication:
 *   - Write-Ahead Log (WAL): Before any page is modified in RAM or written to disk,
 *     the change is sequentially written to the WAL for crash-safety and replication.
 *   - Physical Streaming Replication: Primary streams binary byte-level WAL chunks to Standby nodes.
 *   - Logical Replication: Uses Publications and Subscriptions to stream decoded row changes (useful for cross-version or selective table replication).
 *   - Neon Architecture: Separates compute from storage! Postgres runs as a stateless compute node,
 *     streaming WAL to distributed "Safekeepers", while "Pageservers" manage tiered storage in S3.
 * 
 * Concepts Demonstrated:
 * 1. Current WAL Location (`pg_current_wal_lsn()`)
 * 2. System Replication views (`pg_stat_replication`, `pg_stat_wal`)
 * 3. Architecture comparisons and failover dynamics
 */
export async function runReplicationExercise(): Promise<void> {
  const pool = getPool();
  console.log('\n======================================================');
  console.log('--- EXERCISE 11: PostgreSQL Replication & WAL ---');
  console.log('======================================================\n');

  try {
    // 1. Inspect WAL Status
    console.log('--- 1. Current WAL Location (Log Sequence Number) ---');
    try {
      const walRes = await pool.query(`SELECT pg_current_wal_lsn() as current_lsn, pg_is_in_recovery() as in_recovery;`);
      console.log(`Current LSN:      ${walRes.rows[0].current_lsn}`);
      console.log(`Is in Recovery:   ${walRes.rows[0].in_recovery} (false = Primary / Compute Writer)`);
    } catch (err: any) {
      console.log(`Note on WAL query: ${err.message}`);
    }

    // 2. Inspect WAL Statistics
    console.log('\n--- 2. WAL Generation Statistics ---');
    try {
      const walStats = await pool.query(`
        SELECT wal_records, wal_bytes, wal_buffers_full
        FROM pg_stat_wal;
      `);
      if (walStats.rows.length > 0) {
        console.log(`WAL Records:      ${walStats.rows[0].wal_records}`);
        console.log(`WAL Bytes:        ${walStats.rows[0].wal_bytes}`);
        console.log(`WAL Buffers Full: ${walStats.rows[0].wal_buffers_full}`);
      }
    } catch {
      console.log('pg_stat_wal stats not available or restricted on this instance.');
    }

    // 3. Inspect Active Replication Standbys
    console.log('\n--- 3. Active Streaming Replication Clients ---');
    try {
      const repStats = await pool.query(`
        SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn, sync_state
        FROM pg_stat_replication;
      `);
      if (repStats.rows.length === 0) {
        console.log('ℹ️  No external physical streaming standbys connected (In Neon, Safekeepers manage WAL durability externally).');
      } else {
        repStats.rows.forEach(r => console.log('Standby:', r));
      }
    } catch {
      console.log('Replication view access restricted by provider policy.');
    }

    // 4. Theoretical Comparison Matrix
    console.log('\n--- 4. Summary Matrix: MongoDB Replica Sets vs PostgreSQL Replication ---');
    console.log(`
┌─────────────────────┬────────────────────────────────┬────────────────────────────────┐
│ Dimension           │ MongoDB                        │ PostgreSQL                     │
├─────────────────────┼────────────────────────────────┼────────────────────────────────┤
│ Mechanism           │ Logical Oplog (JSON-like ops)  │ Physical WAL / Logical Streams │
│ Architecture        │ Primary + Secondaries          │ Primary + Standby Replicas     │
│ Failover            │ Automated Raft Elections       │ Managed by Patroni/PgBouncer   │
│ In Neon Postgres    │ N/A                            │ Decoupled Compute & Safekeepers│
│ Read Scalability    │ Read Preferences (secondary)   │ Read Replica endpoints         │
│ Consistency         │ Tunable: 'majority', 'local'   │ Sync or Async standby commit   │
└─────────────────────┴────────────────────────────────┴────────────────────────────────┘
    `);
  } catch (error) {
    console.error('❌ Exercise 11 failed:', error);
    throw error;
  }
}

if (require.main === module) {
  runReplicationExercise().then(() => process.exit(0)).catch(() => process.exit(1));
}
