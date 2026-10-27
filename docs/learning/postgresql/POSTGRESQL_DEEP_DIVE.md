# PostgreSQL internals for this codebase

This guide connects PostgreSQL internals to the raw `pg` repositories and SQL migrations in `backend/src`. Run exercises only against a disposable local database.

## MVCC and snapshots

PostgreSQL keeps old row versions when an `UPDATE` creates a new tuple. A transaction reads the version visible to its snapshot, while concurrent transactions can write newer versions. This multi-version concurrency control (MVCC) avoids readers blocking ordinary writers; it does not eliminate write conflicts or the need to vacuum dead tuples.

```mermaid
sequenceDiagram
  participant A as Transaction A
  participant B as Transaction B
  participant PG as PostgreSQL
  A->>PG: BEGIN; SELECT stock (snapshot S1)
  B->>PG: UPDATE stock; COMMIT (new tuple)
  A->>PG: SELECT stock (still sees S1 under repeatable read)
  A->>PG: COMMIT
  PG->>PG: VACUUM can later reclaim obsolete tuple
```

At `READ COMMITTED`, each statement gets a fresh snapshot. At `REPEATABLE READ`, the transaction keeps a stable snapshot and can receive a serialization error when concurrent writes conflict. `SERIALIZABLE` detects executions that cannot be ordered safely and asks the application to retry the whole transaction. Never retry only the final statement after a serialization failure.

## WAL and durability

Before dirty data pages are flushed, PostgreSQL records the change in the write-ahead log (WAL). A commit acknowledgement means the WAL commit record is durable according to `synchronous_commit` and the configured storage. Checkpoints later write dirty pages; crash recovery replays WAL after the last checkpoint. WAL makes transactions recoverable, but it does not make a multi-system SMTP or HTTP effect transactional. That is why the paid order and outbox row are committed together and external effects are processed later.

## Indexes and planner decisions

B-tree indexes support equality, range, and ordered scans. GIN indexes accelerate containment and multi-valued data such as JSONB. pgvector supports approximate nearest-neighbor indexes: HNSW generally trades more memory and build time for strong recall at low latency; IVFFlat partitions vectors into lists and requires representative training data plus a tuned probe count. Neither index should be selected by name alone: compare recall and p95 latency on the actual embedding distribution.

The planner estimates row counts from statistics, then compares sequential scans, index scans, and joins. Use `EXPLAIN (ANALYZE, BUFFERS)` on representative data to compare estimates with actual rows and identify I/O. `ANALYZE` refreshes statistics; `EXPLAIN ANALYZE` executes the query, so do not run a mutating statement casually against production.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, created_at
FROM orders
WHERE user_id = 42
ORDER BY created_at DESC
LIMIT 50;
```

## Locks, claims, and deadlocks

Row locks protect updates to selected tuples. `FOR UPDATE SKIP LOCKED` lets concurrent workers skip rows another transaction is already claiming. The outbox repository uses a CTE and a single `UPDATE ... RETURNING`, so selection and state transition are one statement. A lease timestamp recovers work after a process dies; a UUID claim token prevents an old worker from finalizing a reclaimed event.

Deadlocks occur when transactions take locks in different orders. Keep transactions short, update rows in a consistent order, and retry SQLSTATE `40P01` only around an idempotent transaction. A lock timeout limits how long a request can wait, but setting it too low can turn normal contention into avoidable failures.

## Pooling, migrations, vacuum, and partitioning

Each `pg.Pool` client is a database connection. Increasing pool size can worsen overload because PostgreSQL must schedule more active backends. Set a measured per-instance maximum that fits the database connection budget across all replicas. Always release checked-out clients in `finally`; a missing release can exhaust the pool even when queries are fast.

Migrations are schema changes with lock behavior. Additive columns and indexes are usually safer than rewriting a large table in one blocking operation. Use `CREATE INDEX CONCURRENTLY` where the migration runner supports non-transactional statements; PostgreSQL forbids that command inside a transaction block. Vacuum reclaims dead tuples and maintains visibility maps; sustained update churn with a lagging vacuum can cause table and index bloat.

Partition only when measured retention, maintenance, or pruning needs justify the extra operational complexity. Partition keys must align with common filters, and unique constraints on partitioned tables have key restrictions.

## Common pitfalls

- Assuming MVCC prevents lost updates; it primarily controls visibility, not business invariants.
- Treating `SKIP LOCKED` as a lease; row locks end when the statement transaction ends.
- Increasing pool size to fix slow queries; this can amplify database overload.
- Creating an ANN vector index without recall measurements or matching the query operator.
- Running `EXPLAIN ANALYZE` on production writes.
- Adding an index without checking write amplification and migration lock behavior.

## Break It On Purpose

Use `backend/src/database/exercises/07-locks-mvcc.ts` and `04-isolation-levels.ts` with a disposable `TEST_POSTGRES_URL`. Open two `psql` sessions. In session A, `BEGIN; SELECT ... FOR UPDATE` one test row and leave the transaction open. In session B, try to update that row and observe it wait. Repeat with a worker-style `FOR UPDATE SKIP LOCKED` query and observe it skip. Then terminate the test worker after claim and confirm the lease makes the row claimable after the configured cutoff. Never point this exercise at production.

## Senior/Staff interview questions

1. **What does MVCC buy you?** It lets readers use snapshots without blocking ordinary writers; tuple cleanup still depends on vacuum.
2. **Does `READ COMMITTED` prevent lost updates?** No. Use conditional updates, explicit locks, or a stronger transaction protocol for the invariant.
3. **Why WAL?** It records durable changes before data pages are flushed and supports crash recovery and replication.
4. **When would you choose HNSW?** When measured recall/latency favors its graph search and memory/build costs fit the workload.
5. **What does `SKIP LOCKED` guarantee?** Concurrent claimers skip currently locked candidate rows; it does not persist ownership after the statement commits.
6. **How do you recover abandoned work?** Store a lease deadline, reclaim expired rows, and use an ownership token to reject stale completions.
7. **How do you diagnose a slow query?** Compare estimates and actual rows in `EXPLAIN (ANALYZE, BUFFERS)` and check waits, I/O, and index selectivity.
8. **How does pool size affect throughput?** More clients can help until database resources saturate; beyond that they increase contention and queueing.
9. **Why can vacuum fall behind?** Long-lived snapshots, high churn, or insufficient vacuum capacity keep dead tuples from being reclaimed.
10. **How do you make a large index migration safer?** Build concurrently where possible, monitor progress, and separate incompatible operations from transactional migrations.
