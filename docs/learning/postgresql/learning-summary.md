# PostgreSQL learning summary

The older “complete” and “mastery complete” notes repeated progress claims and pointed to migration steps that no longer describe the running application. This page keeps their useful topic map without presenting those claims as verified proficiency.

Use the materials to practice:

- Relational modeling, constraints, and transaction boundaries.
- B-tree, GIN, partial, and composite index trade-offs.
- `EXPLAIN ANALYZE`, query planning, and measured query improvements.
- MVCC, isolation anomalies, row locks, deadlocks, and retry boundaries.
- Idempotency, outbox processing, pool behavior, and production operations.
- PostgreSQL vector search concepts, while distinguishing implemented adapters from enabled runtime paths.

The [interview exercises](POSTGRESQL_INTERVIEW_EXERCISES.md) and [runnable exercises](../../../backend/src/database/exercises/README.md) provide practice. Verify every performance claim against a reproducible workload before using it in an interview; example numbers in older material are illustrative unless measured in this repository.
