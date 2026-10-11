# Database Learning Roadmap: MongoDB → PostgreSQL

**Your Goal:** Master advanced database concepts for Staff/Principal-level interviews  
**Method:** Hands-on migration from MongoDB to PostgreSQL  
**Timeline:** 3-4 weeks  
**Current Status:** Ready to begin ✅

---

## 🎯 Why This Matters for Your Career

### Interview Reality (2024-2026)

**Common Question:** "Tell me about a time you optimized database performance"

**Weak Answer (MongoDB only):**
> "I added indexes to MongoDB. It made queries faster."

**Strong Answer (PostgreSQL expertise):**
> "I optimized a slow query from 5 seconds to 50ms by analyzing the execution plan with EXPLAIN ANALYZE. The query was doing a sequential scan across 500k rows. I created a composite index on (category, stock) which changed the query plan to an index scan. I also considered a covering index but the tradeoff wasn't worth it—adding price to the index would triple index size for a 10ms gain. The bottleneck was actually a missing WHERE clause that filtered by in-stock products, so I added a partial index on stock > 0. This is a common pattern when you need fast queries on subsets of data. I documented the decision in an ADR showing the before/after EXPLAIN ANALYZE plans."

**Difference:** Generic vs specific, shallow vs deep, no tradeoffs vs explicit tradeoffs.

**MongoDB alone doesn't give you:** Foreign keys, ACID transactions, isolation levels, MVCC, deadlocks, query optimization, EXPLAIN plans, covering indexes, partial indexes.

**PostgreSQL gives you all of these + practical experience explaining them.**

---

## 📚 What You'll Learn (Complete List)

### 1. SQL & Data Modeling ✅

| Concept | MongoDB | PostgreSQL | Interview Value |
|---------|---------|------------|-----------------|
| **Normalization** | N/A (document-based) | 1NF, 2NF, 3NF | "I normalized orders into orders + order_items (3NF)" |
| **Foreign Keys** | References (not enforced) | REFERENCES (enforced) | "Foreign keys ensure data integrity at database level" |
| **Relationships** | Embedded or manual | JOINs (INNER, LEFT, RIGHT) | "I used LEFT JOIN to include users without orders" |
| **Schema** | Flexible (schemaless) | Strict (typed) | "I chose strict schema for data integrity, flexible JSONB for extensibility" |

**Learning Exercise:**
```sql
-- Normalized design (PostgreSQL)
SELECT u.name, COUNT(o.id) AS order_count, SUM(o.total_amount) AS total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'paid'
GROUP BY u.id, u.name
ORDER BY total_spent DESC;

-- MongoDB equivalent (complex aggregation pipeline)
db.users.aggregate([
  {
    $lookup: {
      from: "orders",
      localField: "_id",
      foreignField: "userId",
      as: "orders"
    }
  },
  {
    $addFields: {
      orderCount: { $size: "$orders" },
      totalSpent: { $sum: "$orders.totalAmount" }
    }
  }
]);
```

**Interview Answer:** "I chose normalization because it eliminates data duplication and maintains consistency. The tradeoff is JOINs add latency, but with proper indexes, JOINs are fast (5-10ms). I'd denormalize if read performance is critical and consistency can be eventually consistent."

---

### 2. Indexes & Performance ✅

| Index Type | Use Case | Interview Example |
|------------|----------|-------------------|
| **B-tree** (default) | Equality, range queries | "I used B-tree for user_id lookups (O(log n))" |
| **GIN** | Full-text search, JSONB | "I used GIN with pg_trgm for fuzzy product search" |
| **Partial** | Subset of data | "I indexed featured=true products (5% of data)" |
| **Composite** | Multiple columns | "I indexed (user_id, created_at) for user's recent orders" |
| **Covering** | Include all query columns | "I added price to index to avoid table lookups" |

**Learning Exercise:**
```sql
-- Query without index (slow)
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 123;
-- Seq Scan on orders (cost=0.00..1500.00 rows=100 width=200) (actual time=50.123..50.456 rows=10)

-- Create index
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Query with index (fast)
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 123;
-- Index Scan using idx_orders_user_id (cost=0.29..15.31 rows=10 width=200) (actual time=0.042..0.089 rows=10)

-- 100x faster: 50ms → 0.5ms
```

**Interview Answer:** "I analyzed a slow query using EXPLAIN ANALYZE. It was doing a sequential scan (Seq Scan) across 500k rows. I created a B-tree index on the filtered column, changing the plan to an Index Scan. Query time dropped from 500ms to 5ms. I verified with EXPLAIN ANALYZE that the index was being used. The tradeoff is indexes slow down writes (10-20%), but for read-heavy workloads (90% reads), it's worth it."

---

### 3. Transactions & ACID ✅

| Property | Meaning | Interview Example |
|----------|---------|-------------------|
| **Atomicity** | All-or-nothing | "If payment fails, order rollback is automatic (ROLLBACK)" |
| **Consistency** | Valid state | "Foreign keys prevent orphaned orders (user deleted = orders deleted)" |
| **Isolation** | Concurrent transactions | "I used REPEATABLE READ to prevent dirty reads during checkout" |
| **Durability** | Persisted to disk | "COMMIT ensures data survives crashes" |

**Learning Exercise:**
```sql
-- Atomic transaction
BEGIN;

INSERT INTO orders (user_id, order_number, total_amount) VALUES (1, 'ORD-001', 99.99);
INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (CURRVAL('orders_id_seq'), 5, 2, 49.99);

-- If error here, entire transaction rolls back
UPDATE products SET stock = stock - 2 WHERE id = 5;

COMMIT; -- All succeed or all fail
```

**Interview Answer:** "I wrapped order creation in a transaction: insert order, insert items, decrement stock. If any step fails, ROLLBACK ensures no partial state (no order without items, no decremented stock without order). This is atomicity. MongoDB's multi-document transactions are limited and slower. PostgreSQL's ACID transactions are mature and fast."

---

### 4. Isolation Levels ✅

| Level | Dirty Read | Non-Repeatable Read | Phantom Read | Use Case |
|-------|------------|---------------------|--------------|----------|
| **Read Uncommitted** | ✅ Yes | ✅ Yes | ✅ Yes | Never use (unsafe) |
| **Read Committed** (default) | ❌ No | ✅ Yes | ✅ Yes | Most cases |
| **Repeatable Read** | ❌ No | ❌ No | ✅ Yes | Financial transactions |
| **Serializable** | ❌ No | ❌ No | ❌ No | Banking, inventory |

**Learning Exercise:**
```sql
-- Terminal 1: REPEATABLE READ
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT price FROM products WHERE id = 1; -- $100

-- Terminal 2: Update price
UPDATE products SET price = 150 WHERE id = 1;
COMMIT;

-- Terminal 1: Read again (same transaction)
SELECT price FROM products WHERE id = 1; -- Still $100 (repeatable read)
COMMIT;

-- New transaction
SELECT price FROM products WHERE id = 1; -- Now $150
```

**Interview Answer:** "I use READ COMMITTED for most queries (default). For checkout, I use REPEATABLE READ to ensure product prices don't change mid-transaction—user sees $100, pays $100, not $100 → $150. For inventory management (prevent overselling), I use SELECT FOR UPDATE (row-level lock) with SERIALIZABLE. The tradeoff is stricter isolation = more lock contention. I chose REPEATABLE READ as balance between consistency and performance."

---

### 5. Locks & MVCC ✅

| Concept | Explanation | Interview Example |
|---------|-------------|-------------------|
| **MVCC** | Multi-Version Concurrency Control | "Readers don't block writers (snapshots)" |
| **Row Lock** | Lock specific rows | "SELECT FOR UPDATE locks rows during checkout" |
| **Table Lock** | Lock entire table | "Rare, used for schema changes (ALTER TABLE)" |
| **Deadlock** | Two transactions wait for each other | "PostgreSQL detects and aborts one transaction" |

**Learning Exercise:**
```sql
-- Prevent race condition in checkout
BEGIN;

-- Lock product row (prevent concurrent checkouts)
SELECT stock FROM products WHERE id = 1 FOR UPDATE;
-- stock = 10

-- Decrement stock
UPDATE products SET stock = stock - 1 WHERE id = 1;

COMMIT;

-- Without FOR UPDATE:
-- User A reads stock = 10
-- User B reads stock = 10
-- User A sets stock = 9
-- User B sets stock = 9 (should be 8!)
-- Lost update (race condition)
```

**Interview Answer:** "I use SELECT FOR UPDATE to lock product rows during checkout. This prevents race conditions where two users buy the last item simultaneously. Without locking, both see stock=1, both decrement to 0, but only one should succeed. The lock serializes access—second user waits for first to commit, then sees stock=0 and gets 'Out of Stock' error. The tradeoff is lock contention during high traffic, but data correctness is non-negotiable."

---

### 6. Deadlocks ✅

**Learning Exercise:**
```sql
-- Terminal 1
BEGIN;
UPDATE orders SET status = 'paid' WHERE id = 1; -- Locks row 1

-- Terminal 2
BEGIN;
UPDATE orders SET status = 'paid' WHERE id = 2; -- Locks row 2

-- Terminal 1
UPDATE orders SET status = 'cancelled' WHERE id = 2; -- Waits for Terminal 2

-- Terminal 2
UPDATE orders SET status = 'cancelled' WHERE id = 1; -- Deadlock!
-- ERROR: deadlock detected
-- DETAIL: Process 12345 waits for ShareLock on transaction 67890; blocked by process 12346.
```

**Interview Answer:** "Deadlocks occur when two transactions wait for each other. PostgreSQL detects this via timeout (deadlock_timeout = 1s default) and aborts one transaction. To prevent, I acquire locks in consistent order (always lock order 1 before order 2). For inevitable deadlocks (user-driven), I catch deadlock errors and retry the transaction. The key is: don't fight deadlocks, design to minimize them."

---

### 7. Query Optimization ✅

**Learning Exercise:**
```sql
-- Slow query
SELECT u.name, o.order_number, o.total_amount
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE o.status = 'paid' AND o.created_at > NOW() - INTERVAL '30 days'
ORDER BY o.created_at DESC
LIMIT 10;

-- Analyze
EXPLAIN ANALYZE [query];

-- Optimization steps:
-- 1. Index on (status, created_at)
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);

-- 2. Covering index (avoid table lookup)
CREATE INDEX idx_orders_covering ON orders(user_id, order_number, total_amount, created_at)
WHERE status = 'paid';

-- 3. Materialized view (if query runs frequently)
CREATE MATERIALIZED VIEW recent_paid_orders AS [query];
REFRESH MATERIALIZED VIEW recent_paid_orders; -- Periodic refresh
```

**Interview Answer:** "I optimized a dashboard query from 2 seconds to 50ms. First, EXPLAIN ANALYZE showed a sequential scan on 1M orders. I added a composite index on (status, created_at) with DESC for ORDER BY. Query dropped to 200ms. Still slow. I realized we were fetching user names (JOIN), then filtering. I changed to fetch user_id only, then batch-fetch user names (n+1 to 1 query). Final time: 50ms. The key lesson: EXPLAIN ANALYZE shows the bottleneck, don't guess."

---

### 8. Idempotency ✅

**Learning Exercise:**
```sql
-- Idempotent webhook processing
CREATE TABLE webhook_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL UNIQUE, -- Stripe event ID
  processed_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'processing'
);

-- Insert (atomic, race-safe)
INSERT INTO webhook_events (event_id, status)
VALUES ('evt_abc123', 'processing')
ON CONFLICT (event_id) DO NOTHING
RETURNING id;

-- If RETURNING id is empty, webhook already processed (duplicate)
```

**Interview Answer:** "I handle duplicate webhooks with UNIQUE constraints at database level. When webhook arrives, I INSERT event_id ON CONFLICT DO NOTHING. If insert succeeds, process webhook. If duplicate key error, return success (idempotent). This is atomic—even if two webhooks arrive simultaneously, database ensures only one inserts (unique index prevents race condition). I don't rely on application-level checks because race conditions can bypass them. Database-level atomicity is the only safe way."

---

### 9. Partitioning ✅

**Learning Exercise:**
```sql
-- Partition audit logs by month
CREATE TABLE payment_audit_logs (
  id SERIAL,
  timestamp TIMESTAMPTZ NOT NULL,
  event_type VARCHAR(100),
  ...
) PARTITION BY RANGE (timestamp);

-- Create partitions
CREATE TABLE audit_2024_10 PARTITION OF payment_audit_logs
FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');

CREATE TABLE audit_2024_11 PARTITION OF payment_audit_logs
FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');

-- Queries automatically route to correct partition
SELECT * FROM payment_audit_logs WHERE timestamp > '2024-10-15';
-- Only scans audit_2024_10 (partition pruning)
```

**Interview Answer:** "I partitioned audit logs by month because the table exceeded 100M rows and queries were slow. Partitioning improves performance via partition pruning—queries for October only scan the October partition (10M rows), not the entire table (100M rows). I chose monthly partitions (not daily) because we query by month (reports), and more partitions = more overhead. The tradeoff is maintenance—creating new partitions monthly—but at 100M+ rows, it's worth it."

---

### 10. Replication ✅

**Learning Exercise:**
```sql
-- Streaming replication (built-in)
-- Primary → Replica (read-only)

-- On primary
SELECT * FROM pg_stat_replication;
-- Shows connected replicas, lag

-- On replica
SELECT pg_is_in_recovery();
-- Returns true (read-only mode)

-- Failover (promote replica to primary)
pg_ctl promote -D /var/lib/postgresql/data
```

**Interview Answer:** "I set up streaming replication with 1 primary + 2 replicas for high availability. Replicas are read-only, used for analytics queries (offload primary). Replication lag is <100ms (asynchronous). If primary fails, I promote a replica to primary (failover). This gives 99.99% uptime. The tradeoff is replicas add cost ($100/month each) and complexity (monitoring lag, handling failover). For read-heavy workloads (analytics), it's worth it—offloads 50% of queries from primary."

---

## 🛣️ 4-Week Learning Plan

### Week 1: SQL Foundations + Migration Setup

**Goals:**
- Set up Neon PostgreSQL
- Run initial migration
- Learn basic SQL (SELECT, WHERE, JOINs)
- Implement dual-write pattern

**Tasks:**
- [ ] Run `neon login` and link project
- [ ] Execute `001-initial-schema.sql` migration
- [ ] Verify tables created (SELECT * FROM users)
- [ ] Practice 20 SQL queries (see POSTGRES_SETUP_COMMANDS.md)
- [ ] Implement dual-write for users (write to MongoDB + PostgreSQL)

**Success Metric:** Can write SQL queries with JOINs, understand EXPLAIN output

---

### Week 2: Indexes + Transactions

**Goals:**
- Master indexes (types, when to use)
- Understand ACID transactions
- Learn isolation levels
- Test concurrency scenarios

**Tasks:**
- [ ] Create 10 indexes on tables
- [ ] Use EXPLAIN ANALYZE to verify index usage
- [ ] Implement transaction for order creation (atomicity)
- [ ] Test isolation levels (READ COMMITTED, REPEATABLE READ)
- [ ] Trigger deadlock and understand resolution

**Success Metric:** Can explain when to use indexes, can design transactions safely

---

### Week 3: Concurrency + Optimization

**Goals:**
- Understand MVCC and locking
- Optimize slow queries
- Implement idempotency
- Handle deadlocks

**Tasks:**
- [ ] Use SELECT FOR UPDATE to prevent race conditions
- [ ] Optimize 3 slow queries with EXPLAIN ANALYZE
- [ ] Implement idempotent webhook processing
- [ ] Create materialized view for analytics
- [ ] Test deadlock scenarios and prevention

**Success Metric:** Can debug and fix slow queries, understand concurrency control

---

### Week 4: Advanced Topics + Cutover

**Goals:**
- Learn partitioning
- Understand replication
- Backfill MongoDB data
- Cut over to PostgreSQL

**Tasks:**
- [ ] Partition audit logs by month (if >10M rows)
- [ ] Set up read replica (optional, Neon feature)
- [ ] Backfill all MongoDB data to PostgreSQL
- [ ] Verify data consistency (MongoDB vs PostgreSQL)
- [ ] Switch to PostgreSQL as primary database
- [ ] Archive MongoDB (keep 30 days, then delete)

**Success Metric:** PostgreSQL is primary, MongoDB archived, system running smoothly

---

## 📊 Interview Readiness Checklist

After 4 weeks, you should be able to answer:

### System Design Questions:
- [ ] "Design a database schema for an e-commerce platform"
- [ ] "How would you optimize this slow query?"
- [ ] "Explain normalization and when you'd denormalize"
- [ ] "How do you handle high read traffic?"

### Concurrency Questions:
- [ ] "What's a race condition and how do you prevent it?"
- [ ] "Explain isolation levels and when to use each"
- [ ] "How do you handle deadlocks?"
- [ ] "What's MVCC and why does it matter?"

### Performance Questions:
- [ ] "How do you debug a slow query?"
- [ ] "When would you use a covering index?"
- [ ] "Explain partitioning and when it's useful"
- [ ] "How do you handle database scaling?"

### Production Questions:
- [ ] "How do you handle database migrations with zero downtime?"
- [ ] "Explain your backup and disaster recovery strategy"
- [ ] "How do you ensure data consistency?"
- [ ] "How do you monitor database performance?"

---

## 🎯 Career Impact

### Before PostgreSQL Migration:
**Interview:** "How do you optimize database queries?"  
**You:** "I add indexes to MongoDB"  
**Rating:** Junior-level answer

### After PostgreSQL Migration:
**Interview:** "How do you optimize database queries?"  
**You:** "I use EXPLAIN ANALYZE to identify bottlenecks. Recently optimized a query from 2s to 50ms. It was doing a Seq Scan on 500k rows because of a missing composite index on (category, stock). I considered a covering index but decided against it—adding price would triple index size for a 10ms gain, not worth it. I also identified a missing WHERE clause filtering in-stock products, so I created a partial index on stock > 0. This is common when querying subsets. I documented the before/after plans in an ADR. The key is: don't guess, measure with EXPLAIN ANALYZE."  
**Rating:** Staff/Principal-level answer

**Difference:** Specific metrics, tradeoff analysis, tools used, alternatives considered, documented reasoning.

---

## 📚 Resources

### Official Docs:
- **PostgreSQL Tutorial:** https://www.postgresqltutorial.com/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **Neon Docs:** https://neon.tech/docs

### Books:
- **"SQL Performance Explained"** by Markus Winand (best for optimization)
- **"Designing Data-Intensive Applications"** by Martin Kleppmann (distributed systems)

### Tools:
- **pgAdmin:** GUI for PostgreSQL management
- **DBeaver:** Universal database tool
- **Neon Console:** Web-based SQL editor

---

## ✅ Success Metrics

After completing this learning path, you'll have:

- ✅ **Practical PostgreSQL experience** (not just theory)
- ✅ **Production migration experience** (dual-write, backfill, cutover)
- ✅ **Deep database knowledge** (ACID, MVCC, indexes, locks)
- ✅ **Interview-ready answers** (metrics, tradeoffs, alternatives)
- ✅ **Staff-level expertise** (optimization, concurrency, transactions)

---

## 🚀 Ready to Start!

**Your Path:**
1. Read: POSTGRESQL_MIGRATION_GUIDE.md (architecture overview)
2. Execute: POSTGRES_SETUP_COMMANDS.md (hands-on setup)
3. Learn: NEON_SETUP.md (cloud configuration)
4. Practice: SQL exercises in each guide
5. Migrate: Dual-write → backfill → cutover

**First Command:**
```bash
neon login
```

**Timeline:**
- Week 1: Setup + SQL basics
- Week 2: Indexes + transactions
- Week 3: Concurrency + optimization
- Week 4: Advanced topics + cutover

**You've got this!** 🎓

---

**Current Status:** ✅ Ready to begin  
**Next Step:** Run `neon login`
