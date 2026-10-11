# PostgreSQL Interview Preparation - Hands-On Exercises

**Goal:** Master Staff/Principal-level database concepts through practical implementation  
**Format:** Each topic has theory + hands-on exercises + interview questions

---

## 📚 Exercise Structure

Each exercise includes:
1. **Theory** - What it is and why it matters
2. **Hands-On Code** - Runnable TypeScript/SQL examples
3. **Interview Questions** - With perfect answers
4. **Common Pitfalls** - What goes wrong and how to fix it

---

## 🎯 Topics Covered

### 1. Data Modeling & Normalization ✅
- [x] Normalization (1NF, 2NF, 3NF)
- [x] Foreign keys and relationships
- [x] Denormalization tradeoffs
- [x] Data anomalies (insert, update, delete)

**Exercise:** `01-data-modeling.ts` ✅ Implemented

### 2. Indexes Deep Dive ✅
- [x] B-tree indexes (default)
- [x] GIN indexes (full-text, JSONB)
- [x] Partial indexes
- [x] Composite indexes
- [x] Covering indexes
- [x] Index-only scans
- [x] EXPLAIN ANALYZE

**Exercise:** `02-indexes.ts` ✅ Implemented

### 3. Transactions & ACID ✅
- [x] Atomicity (all-or-nothing)
- [x] Consistency (constraints enforced)
- [x] Isolation (concurrent transactions)
- [x] Durability (WAL)
- [x] BEGIN, COMMIT, ROLLBACK
- [x] Savepoints

**Exercise:** `03-transactions-acid.ts` ✅ Implemented

### 4. Isolation Levels ✅
- [x] READ UNCOMMITTED (dirty reads)
- [x] READ COMMITTED (default)
- [x] REPEATABLE READ (consistent snapshot)
- [x] SERIALIZABLE (fully isolated)
- [x] Non-repeatable reads and phantom reads

**Exercise:** `04-isolation-levels.ts` ✅ Implemented

### 5. Deadlocks & Prevention ✅
- [x] What causes deadlocks
- [x] Detecting deadlocks
- [x] Preventing deadlocks (lock ordering)
- [x] Handling deadlock errors
- [x] Retry logic with exponential backoff

**Exercise:** `05-deadlocks.ts` ✅ Implemented

### 6. Idempotency ✅
- [x] UNIQUE constraints
- [x] ON CONFLICT DO NOTHING
- [x] Idempotency keys
- [x] Webhook processing
- [x] Race condition protection

**Exercise:** `06-idempotency.ts` ✅ Implemented

### 7. Locks
- [ ] READ UNCOMMITTED (dirty reads)
- [ ] READ COMMITTED (default)
- [ ] REPEATABLE READ (consistent snapshot)
- [ ] SERIALIZABLE (fully isolated)

**Exercise:** `06-isolation-levels.ts`

### 7. Locks
- [ ] Row-level locks
- [ ] Table-level locks
- [ ] SELECT FOR UPDATE
- [ ] NOWAIT and SKIP LOCKED

**Exercise:** `07-locks.ts`

### 8. MVCC (Multi-Version Concurrency Control)
- [ ] How PostgreSQL handles concurrency
- [ ] Transaction snapshots
- [ ] Vacuum and dead tuples
- [ ] XID wraparound

**Exercise:** `08-mvcc.ts`

### 9. Deadlocks
- [ ] What causes deadlocks
- [ ] Detecting deadlocks
- [ ] Preventing deadlocks
- [ ] Handling deadlock errors

**Exercise:** `09-deadlocks.ts`

### 10. Concurrency
- [ ] Race conditions
- [ ] Lost updates
- [ ] Phantom reads
- [ ] SELECT FOR UPDATE

**Exercise:** `10-concurrency.ts`

### 11. Idempotency
- [ ] UNIQUE constraints
- [ ] ON CONFLICT
- [ ] Idempotency keys
- [ ] Webhook processing

**Exercise:** `11-idempotency.ts`

### 12. Constraints
- [ ] PRIMARY KEY
- [ ] FOREIGN KEY
- [ ] UNIQUE
- [ ] CHECK
- [ ] NOT NULL
- [ ] EXCLUDE

**Exercise:** `12-constraints.ts`

### 13. Query Optimization
- [ ] EXPLAIN ANALYZE
- [ ] Index selection
- [ ] Query rewriting
- [ ] Join order
- [ ] Statistics

**Exercise:** `13-query-optimization.ts`

### 14. Replication
- [ ] Streaming replication
- [ ] Logical replication
- [ ] Read replicas
- [ ] Failover

**Exercise:** `14-replication.ts`

### 15. Partitioning
- [ ] Range partitioning
- [ ] List partitioning
- [ ] Hash partitioning
- [ ] Partition pruning

**Exercise:** `15-partitioning.ts`

---

## 🚀 How to Use

### Run All Exercises (Sequentially)
```bash
cd backend
npx ts-node src/database/exercises/run-all.ts
```

### Run Specific Exercise
```bash
# Exercise 1: Data Modeling & Normalization
npx ts-node src/database/exercises/01-data-modeling.ts

# Exercise 2: Indexes Deep Dive
npx ts-node src/database/exercises/02-indexes.ts

# Exercise 3: Transactions & ACID
npx ts-node src/database/exercises/03-transactions-acid.ts
```

### What Each Exercise Demonstrates

**Exercise 1: Data Modeling** (✅ Implemented)
- Denormalized vs normalized design
- 1NF, 2NF, 3NF with examples
- When to denormalize (price_at_purchase)
- Update, insert, delete anomalies

**Exercise 2: Indexes** (✅ Implemented)
- EXPLAIN ANALYZE for query optimization
- B-tree, GIN, partial, composite indexes
- Covering indexes with INCLUDE clause
- Index usage statistics

**Exercise 3: Transactions & ACID** (✅ Implemented)
- Atomicity: All-or-nothing transfers
- Consistency: CHECK constraints enforced
- Isolation: Concurrent transactions
- Durability: WAL and crash recovery
- Savepoints for partial rollback

---

## 📊 Progress Tracking

### Week 1: Foundations
- [ ] SQL Fundamentals
- [ ] Data Modeling
- [ ] Indexes
- [ ] Transactions

### Week 2: Concurrency
- [ ] ACID Properties
- [ ] Isolation Levels
- [ ] Locks
- [ ] MVCC

### Week 3: Advanced
- [ ] Deadlocks
- [ ] Concurrency Patterns
- [ ] Idempotency
- [ ] Constraints

### Week 4: Production
- [ ] Query Optimization
- [ ] Replication
- [ ] Partitioning

---

## 🎯 Interview Readiness Checklist

After completing all exercises, you should be able to:

- [ ] Explain normalization with examples (1NF, 2NF, 3NF)
- [ ] Design schemas with foreign keys and constraints
- [ ] Create appropriate indexes for queries
- [ ] Use EXPLAIN ANALYZE to optimize queries
- [ ] Implement ACID transactions correctly
- [ ] Explain isolation levels and when to use each
- [ ] Prevent race conditions with locks
- [ ] Understand MVCC and how PostgreSQL handles concurrency
- [ ] Debug and prevent deadlocks
- [ ] Implement idempotency for webhooks
- [ ] Optimize slow queries systematically
- [ ] Design partitioned tables for scale
- [ ] Explain replication strategies

---

## 📚 Additional Resources

- PostgreSQL Documentation: https://www.postgresql.org/docs/
- Use The Index, Luke: https://use-the-index-luke.com/
- PostgreSQL Wiki: https://wiki.postgresql.org/

---

**Start with Exercise 02: Data Modeling**
