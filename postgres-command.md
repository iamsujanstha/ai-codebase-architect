# PostgreSQL Terminal Operations & SQL Exercises Runbook

Comprehensive reference for connecting, administering, troubleshooting, and executing SQL commands in **PostgreSQL (Neon Serverless & Local Docker)** for the **Atlas Commerce Lab** architecture.

---

## 🌐 1. Terminal Setup & Connection Matrix

### Option A: Connect via Local `psql` (Homebrew on macOS)

If you have PostgreSQL or `libpq` installed locally:
```bash
# Install psql client if not already installed
brew install libpq
brew link --force libpq

# Export connection string directly from backend/.env
export DATABASE_URL="postgresql://neondb_owner:npg_HkO0lvFZzJ1u@ep-super-rice-b34nlx0w-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

# Connect via psql
psql "$DATABASE_URL"
```

### Option B: Connect via Docker (Zero Local Dependencies)

Run an ephemeral Postgres 16 container with `psql` pre-installed:
```bash
# Connect to remote Neon DB via Docker container
docker run -it --rm postgres:16 psql "postgresql://neondb_owner:npg_HkO0lvFZzJ1u@ep-super-rice-b34nlx0w-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
```

### Option C: Connect via Environment Variable Parameters
```bash
export PGHOST=ep-super-rice-b34nlx0w-pooler.c-4.ap-southeast-1.aws.neon.tech
export PGPORT=5432
export PGUSER=neondb_owner
export PGPASSWORD=npg_HkO0lvFZzJ1u
export PGDATABASE=neondb
export PGSSLMODE=require

# Connect directly using the environment variables
psql
```

### Option D: Run Single Query Directly from Terminal (One-Liner)
```bash
# Run query and exit immediately (-c flag)
psql "$DATABASE_URL" -c "SELECT version();"

# Run query formatted with table borders and execution time
psql "$DATABASE_URL" -c "SELECT current_database(), current_user, now();"
```

### Option E: Execute a `.sql` File from the Terminal
```bash
psql "$DATABASE_URL" -f path/to/script.sql
```

---

## 🛠️ 2. Essential `psql` CLI Meta-Commands Cheat Sheet

All meta-commands in `psql` begin with a backslash `\` (no semicolon needed at the end):

| Command | Description | Example / Output |
| :--- | :--- | :--- |
| `\l` or `\l+` | List all databases (with sizes & collations) | Lists `neondb`, `postgres`, etc. |
| `\c <dbname>` | Connect / switch to another database | `\c neondb` |
| `\dt` or `\dt+` | List all tables in current schema | Shows tables with owners & row counts |
| `\d <table_name>` | Describe table schema (columns, types, constraints) | `\d users` or `\d product_embeddings` |
| `\d+ <table_name>`| Detailed description (indexes, storage, foreign keys) | `\d+ orders` |
| `\di` or `\di+` | List all indexes and their storage size | Displays B-tree, HNSW, and GIN indexes |
| `\dn` | List all schemas | Shows `public`, `pg_catalog`, etc. |
| `\df` | List all stored functions / procedures | `\df` |
| `\dx` | List all installed PostgreSQL extensions | Shows `vector`, `uuid-ossp`, etc. |
| `\timing on` | Toggle SQL execution time timer on/off | Outputs `Time: 1.450 ms` after every query |
| `\x auto` | Toggle expanded table view (record-by-record display) | Crucial for viewing wide tables like JSONB/vector |
| `\q` | Exit / quit `psql` session | `\q` |

---

## 🧩 3. Extensions Setup (Vector & UUIDs)

Neon PostgreSQL supports `pgvector` for AI similarity search and `uuid-ossp` for primary keys:

```sql
-- 1. Enable pgvector for embedding similarity search (HNSW / IVFFlat)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Enable UUID generation functions (e.g. uuid_generate_v4())
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3. Enable trigram matching for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Verify installed extensions and version
SELECT extname, extversion FROM pg_extension;
```

---

## 📚 4. Consolidated SQL Exercise Commands (Section-by-Section)

All SQL scenarios from the database exercise suite (`01-data-modeling.ts` to `14-outbox-pattern.ts`), formatted for direct terminal execution.

---

### Exercise 1: Data Modeling, Normalization (1NF, 2NF, 3NF) & Denormalization

#### 1. Normalized 3NF Schema (OLTP - Write-Optimized)
```sql
DROP TABLE IF EXISTS order_items_3nf CASCADE;
DROP TABLE IF EXISTS orders_3nf CASCADE;
DROP TABLE IF EXISTS products_3nf CASCADE;
DROP TABLE IF EXISTS customers_3nf CASCADE;

CREATE TABLE customers_3nf (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE products_3nf (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price NUMERIC(10, 2) NOT NULL
);

CREATE TABLE orders_3nf (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers_3nf(id),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE order_items_3nf (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders_3nf(id),
  product_id INT NOT NULL REFERENCES products_3nf(id),
  quantity INT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL
);
```

#### 2. Querying 3NF with Joins:
```sql
SELECT 
  o.id AS order_id,
  c.name AS customer_name,
  SUM(oi.quantity * oi.unit_price) AS order_total
FROM orders_3nf o
JOIN customers_3nf c ON o.customer_id = c.id
JOIN order_items_3nf oi ON o.id = oi.order_id
GROUP BY o.id, c.name;
```

#### 3. Denormalized Schema (OLAP / High-Throughput Read Cache)
```sql
DROP TABLE IF EXISTS customer_orders_denormalized CASCADE;

CREATE TABLE customer_orders_denormalized (
  order_id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL,
  customer_name VARCHAR(100) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  order_total NUMERIC(10, 2) NOT NULL,
  items_summary JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast O(1) Read without table joins
SELECT * FROM customer_orders_denormalized WHERE customer_id = 101;
```

---

### Exercise 2: Indexes Deep Dive (B-Tree, Partial, Covering, GIN & Vector)

#### 1. Setup Test Products Table
```sql
DROP TABLE IF EXISTS exercise_products CASCADE;

CREATE TABLE exercise_products (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB,
  embedding vector(1536) -- OpenAI embedding dimension
);
```

#### 2. Composite Index (Equality Column First, Range Column Second)
```sql
CREATE INDEX idx_products_cat_price ON exercise_products (category, price);

-- Matches index prefix:
EXPLAIN ANALYZE 
SELECT * FROM exercise_products WHERE category = 'Electronics' AND price > 100;
```

#### 3. Partial Index (Index Only a Subset of Rows)
```sql
-- Indexes ONLY active rows (cuts index size dramatically)
CREATE INDEX idx_active_products ON exercise_products (price) WHERE is_active = true;

EXPLAIN ANALYZE
SELECT id, price FROM exercise_products WHERE is_active = true AND price < 50;
```

#### 4. Covering Index (`INCLUDE` Clause for Index-Only Scans)
```sql
-- Satisfies query directly inside the B-tree leaf without touching table heap!
CREATE INDEX idx_products_covering ON exercise_products (category) INCLUDE (title, price);

EXPLAIN ANALYZE
SELECT category, title, price FROM exercise_products WHERE category = 'Books';
```

#### 5. GIN Index for JSONB Metadata
```sql
CREATE INDEX idx_products_metadata_gin ON exercise_products USING GIN (metadata);

-- Query using JSON containment operator (@>)
SELECT * FROM exercise_products WHERE metadata @> '{"brand": "Apple"}';
```

#### 6. HNSW Vector Index for Semantic Search (`pgvector`)
```sql
CREATE INDEX idx_products_hnsw ON exercise_products 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Cosine Distance query (<=>)
SELECT id, title, 1 - (embedding <=> '[0.012, -0.045, ...]'::vector) AS similarity
FROM exercise_products
ORDER BY embedding <=> '[0.012, -0.045, ...]'::vector
LIMIT 5;
```

---

### Exercise 3: Transactions & ACID Guarantees

#### Atomicity & Balance Transfer with Savepoint
```sql
DROP TABLE IF EXISTS bank_accounts CASCADE;

CREATE TABLE bank_accounts (
  id SERIAL PRIMARY KEY,
  holder_name VARCHAR(100) NOT NULL,
  balance NUMERIC(12, 2) NOT NULL CHECK (balance >= 0)
);

INSERT INTO bank_accounts (holder_name, balance) VALUES 
('Alice', 1000.00),
('Bob', 500.00);

-- Safe Atomic Transfer:
BEGIN;

UPDATE bank_accounts SET balance = balance - 200.00 WHERE holder_name = 'Alice';
UPDATE bank_accounts SET balance = balance + 200.00 WHERE holder_name = 'Bob';

SAVEPOINT audit_checkpoint;

-- Suppose audit logging fails or needs revert:
-- ROLLBACK TO SAVEPOINT audit_checkpoint;

COMMIT;

SELECT * FROM bank_accounts;
```

---

### Exercise 4: Isolation Levels & Concurrency Anomalies

```sql
-- Check current isolation level
SHOW transaction_isolation;

-- 1. Read Committed (Default in PostgreSQL)
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
SELECT balance FROM bank_accounts WHERE id = 1;
COMMIT;

-- 2. Repeatable Read (Prevents Non-Repeatable Reads & Phantom Reads)
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT SUM(balance) FROM bank_accounts;
-- Any concurrent UPDATE committed after this transaction started will NOT be seen
COMMIT;

-- 3. Serializable (Strict serial execution, aborts on serialization anomaly)
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT * FROM bank_accounts WHERE balance > 500;
COMMIT;
```

---

### Exercise 5: Deadlocks — Detection & Prevention

#### Terminal Session 1:
```sql
BEGIN;
UPDATE bank_accounts SET balance = balance - 50 WHERE id = 1;
-- Wait before executing next line:
-- UPDATE bank_accounts SET balance = balance + 50 WHERE id = 2;
```

#### Terminal Session 2 (Simultaneously):
```sql
BEGIN;
UPDATE bank_accounts SET balance = balance - 50 WHERE id = 2;
-- This will wait for Session 1:
UPDATE bank_accounts SET balance = balance + 50 WHERE id = 1;
```

#### Query Active Locks & Identify Deadlocks:
```sql
SELECT 
  blocked_locks.pid AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS current_statement_in_blocking_process
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

#### Deadlock Rule:
Always lock rows in **deterministic primary key order**:
```sql
-- Always sort IDs: WHERE id IN (1, 2) ORDER BY id
```

---

### Exercise 6: Idempotency & Upsert Operations

#### 1. Idempotent Payment Webhook Table
```sql
DROP TABLE IF EXISTS payment_events CASCADE;

CREATE TABLE payment_events (
  id SERIAL PRIMARY KEY,
  idempotency_key VARCHAR(128) UNIQUE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2. Atomic Upsert (`INSERT ... ON CONFLICT DO UPDATE`)
```sql
INSERT INTO payment_events (idempotency_key, amount, currency, status)
VALUES ('evt_stripe_99812', 49.99, 'USD', 'PENDING')
ON CONFLICT (idempotency_key)
DO UPDATE SET
  status = EXCLUDED.status,
  created_at = NOW()
RETURNING *;
```

#### 3. Idempotent Deduplication (`DO NOTHING`)
```sql
INSERT INTO payment_events (idempotency_key, amount, currency, status)
VALUES ('evt_stripe_99812', 49.99, 'USD', 'PENDING')
ON CONFLICT (idempotency_key) DO NOTHING;
```

---

### Exercise 7: Locks & MVCC (`FOR UPDATE`, `SKIP LOCKED`, `NOWAIT`)

```sql
DROP TABLE IF EXISTS ticket_inventory CASCADE;

CREATE TABLE ticket_inventory (
  id SERIAL PRIMARY KEY,
  seat_number VARCHAR(10) UNIQUE NOT NULL,
  is_booked BOOLEAN NOT NULL DEFAULT false,
  locked_by VARCHAR(50)
);

INSERT INTO ticket_inventory (seat_number) VALUES ('A1'), ('A2'), ('A3'), ('A4');
```

#### 1. Exclusive Row Lock (`FOR UPDATE`)
```sql
BEGIN;
SELECT * FROM ticket_inventory 
WHERE seat_number = 'A1' 
FOR UPDATE;

UPDATE ticket_inventory SET is_booked = true, locked_by = 'user_1' WHERE seat_number = 'A1';
COMMIT;
```

#### 2. Fail Immediately If Row Locked (`NOWAIT`)
```sql
SELECT * FROM ticket_inventory 
WHERE seat_number = 'A1' 
FOR UPDATE NOWAIT;
```

#### 3. High-Concurrency Queue Worker (`FOR UPDATE SKIP LOCKED`)
```sql
-- Picks the first unlocked seat without blocking or waiting for other workers:
BEGIN;
SELECT * FROM ticket_inventory 
WHERE is_booked = false 
ORDER BY id 
LIMIT 1 
FOR UPDATE SKIP LOCKED;
```

---

### Exercise 8: Data Integrity Constraints

```sql
DROP TABLE IF EXISTS users_constrained CASCADE;
DROP TABLE IF EXISTS orders_constrained CASCADE;

CREATE TABLE users_constrained (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  age INT CHECK (age >= 18), -- Check Constraint
  role VARCHAR(20) CHECK (role IN ('ADMIN', 'CUSTOMER', 'VENDOR'))
);

CREATE TABLE orders_constrained (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users_constrained(id) ON DELETE CASCADE,
  order_total NUMERIC(10, 2) CHECK (order_total > 0),
  status VARCHAR(20) DEFAULT 'DRAFT'
);

-- Partial Unique Constraint:
-- A user can only have ONE 'ACTIVE' cart at any time
CREATE UNIQUE INDEX idx_single_active_cart ON orders_constrained (user_id) 
WHERE status = 'ACTIVE';
```

---

### Exercise 9: Query Optimization with `EXPLAIN (ANALYZE, BUFFERS)`

```sql
-- View plan, buffer cache hits, and exact timing:
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, COSTS)
SELECT * FROM exercise_products 
WHERE category = 'Electronics' AND price > 500;
```

**Key Execution Node Meanings:**
- `Seq Scan`: Full table scan (misses index, slow on large datasets).
- `Index Scan`: Navigates B-tree and fetches corresponding rows from table pages.
- `Index Only Scan`: Reads all required data directly from the index leaves (optimal!).
- `Bitmap Index Scan` + `Bitmap Heap Scan`: Gathers page references from index then reads heap in physical disk order.
- `Buffers: shared hit=4 read=1`: `hit` means served from RAM (`shared_buffers`), `read` means disk read.

---

### Exercise 10: Declarative Table Partitioning (RANGE)

```sql
DROP TABLE IF EXISTS exercise_audit_logs CASCADE;

-- Master table
CREATE TABLE exercise_audit_logs (
  id SERIAL,
  event_name VARCHAR(100) NOT NULL,
  user_id INT NOT NULL,
  created_at DATE NOT NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Partitions by Year
CREATE TABLE exercise_audit_logs_2025 PARTITION OF exercise_audit_logs
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE exercise_audit_logs_2026 PARTITION OF exercise_audit_logs
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- Default catch-all partition
CREATE TABLE exercise_audit_logs_default PARTITION OF exercise_audit_logs
  DEFAULT;

-- Insert records (automatically routed to correct partition)
INSERT INTO exercise_audit_logs (event_name, user_id, created_at) VALUES
  ('USER_LOGIN', 101, '2025-04-12'),
  ('PAYMENT_PROCESSED', 102, '2026-02-15');

-- Verify Partition Pruning (Planner only scans the 2026 partition table!)
EXPLAIN ANALYZE
SELECT * FROM exercise_audit_logs 
WHERE created_at = '2026-02-15';
```

---

### Exercise 11: Replication & High Availability

```sql
-- Check current replication status and WAL sender processes
SELECT pid, usename, application_name, client_addr, state, sync_state 
FROM pg_stat_replication;

-- Check WAL position and replication lag
SELECT 
  client_addr, 
  pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS lag_bytes 
FROM pg_stat_replication;

-- Logical Replication: Create Publication on Publisher
CREATE PUBLICATION app_events_pub FOR TABLE payment_events, domain_orders;

-- Logical Replication: Create Subscription on Subscriber (Replica node)
-- CREATE SUBSCRIPTION app_events_sub 
--   CONNECTION 'host=master.db port=5432 user=replicator dbname=neondb' 
--   PUBLICATION app_events_pub;
```

---

### Exercise 12: SQL Fundamentals, Advanced Window Functions & CTEs

```sql
DROP TABLE IF EXISTS employee_hierarchy CASCADE;
DROP TABLE IF EXISTS daily_sales_analytics CASCADE;

CREATE TABLE employee_hierarchy (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  manager_id INT REFERENCES employee_hierarchy(id),
  department VARCHAR(100),
  salary NUMERIC(10, 2)
);

CREATE TABLE daily_sales_analytics (
  id SERIAL PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  sale_date DATE NOT NULL,
  revenue NUMERIC(10, 2) NOT NULL,
  units_sold INT NOT NULL
);

INSERT INTO employee_hierarchy (id, name, manager_id, department, salary) VALUES
  (1, 'Alice (CTO)', NULL, 'Executive', 250000),
  (2, 'Bob (VP Eng)', 1, 'Engineering', 190000),
  (3, 'Charlie (Lead)', 2, 'Core Platform', 155000),
  (4, 'David (Sr Dev)', 3, 'Core Platform', 125000);

INSERT INTO daily_sales_analytics (category, sale_date, revenue, units_sold) VALUES
  ('Electronics', '2026-10-01', 5000, 10),
  ('Electronics', '2026-10-02', 7500, 15),
  ('Electronics', '2026-10-03', 6000, 12),
  ('Books', '2026-10-01', 1200, 30),
  ('Books', '2026-10-02', 1800, 45);
```

#### 1. Window Functions (Running Totals & Rank)
```sql
SELECT 
  category,
  sale_date,
  revenue,
  -- Running total within each category
  SUM(revenue) OVER (PARTITION BY category ORDER BY sale_date) AS running_total,
  -- Day-over-day previous day comparison
  LAG(revenue, 1) OVER (PARTITION BY category ORDER BY sale_date) AS prev_day_revenue,
  -- Revenue rank within category
  DENSE_RANK() OVER (PARTITION BY category ORDER BY revenue DESC) AS rank_in_cat
FROM daily_sales_analytics;
```

#### 2. Recursive CTE (Traversing Organization Tree)
```sql
WITH RECURSIVE OrgTree AS (
  -- Anchor member: The Top Manager
  SELECT id, name, manager_id, 1 AS depth, CAST(name AS VARCHAR(255)) AS path
  FROM employee_hierarchy
  WHERE manager_id IS NULL

  UNION ALL

  -- Recursive member: Subordinates
  SELECT e.id, e.name, e.manager_id, o.depth + 1, CAST(o.path || ' -> ' || e.name AS VARCHAR(255))
  FROM employee_hierarchy e
  JOIN OrgTree o ON e.manager_id = o.id
)
SELECT * FROM OrgTree ORDER BY depth, id;
```

---

### Exercise 13: ORM vs Raw SQL Benchmarks & Anti-Patterns

#### High-Performance Batch Array Unnesting (Avoiding N individual INSERT statements)
```sql
-- Inserts 10,000 rows in a single round-trip:
INSERT INTO exercise_products (title, category, price)
SELECT 
  'Product ' || i,
  CASE WHEN i % 2 = 0 THEN 'Electronics' ELSE 'Apparel' END,
  (i * 1.5)::NUMERIC(10, 2)
FROM generate_series(1, 1000) AS i;
```

#### Solving the N+1 Query Problem in Pure SQL
```sql
-- Bad (N+1): Query all orders, then loop and query items per order in app code.
-- Good (Single Query with JSON Aggregation):
SELECT 
  o.id,
  o.order_date,
  COALESCE(
    json_agg(
      json_build_object(
        'product_id', oi.product_id,
        'quantity', oi.quantity,
        'price', oi.unit_price
      )
    ) FILTER (WHERE oi.id IS NOT NULL), '[]'
  ) AS items
FROM orders_3nf o
LEFT JOIN order_items_3nf oi ON o.id = oi.order_id
GROUP BY o.id;
```

---

### Exercise 14: Transactional Outbox Pattern

```sql
DROP TABLE IF EXISTS domain_orders CASCADE;
DROP TABLE IF EXISTS outbox_events CASCADE;

CREATE TABLE domain_orders (
  id SERIAL PRIMARY KEY,
  customer_id VARCHAR(50) NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'CREATED',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE outbox_events (
  id SERIAL PRIMARY KEY,
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_outbox_pending ON outbox_events(status, created_at)
WHERE status = 'PENDING';
```

#### Atomic Business Action + Event Outbox Generation:
```sql
BEGIN;

-- 1. Insert Order
INSERT INTO domain_orders (customer_id, total_amount, status)
VALUES ('cust_101', 199.99, 'CREATED')
RETURNING id;

-- 2. Insert corresponding event into Outbox in same ACID transaction
INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
VALUES (
  'ORDER', 
  '1', 
  'ORDER_CREATED', 
  '{"order_id": 1, "customer_id": "cust_101", "total": 199.99}'::jsonb
);

COMMIT;
```

#### Outbox Worker Polling Query (Safe for Multiple Concurrent Dispatchers):
```sql
BEGIN;

-- Lock and pick up to 10 pending events without worker collisions:
SELECT id, aggregate_id, event_type, payload
FROM outbox_events
WHERE status = 'PENDING'
ORDER BY created_at ASC
LIMIT 10
FOR UPDATE SKIP LOCKED;

-- Mark as processed after publishing to Kafka/RabbitMQ/SQS:
UPDATE outbox_events
SET status = 'PROCESSED', processed_at = NOW()
WHERE id = 1;

COMMIT;
```

---

## 🔍 5. Production Diagnostics & Troubleshooting Runbook

### 1. View Currently Running Queries & Execution Times
```sql
SELECT 
  pid, 
  now() - query_start AS duration, 
  state, 
  query 
FROM pg_stat_activity 
WHERE state != 'idle' 
ORDER BY duration DESC;
```

### 2. Kill / Cancel a Hanging Query or Transaction
```sql
-- Graceful cancel of running query
SELECT pg_cancel_backend(<PID>);

-- Force terminate connection / kill backend transaction
SELECT pg_terminate_backend(<PID>);
```

### 3. Check Table & Index Disk Sizes
```sql
SELECT 
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS data_size,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

### 4. Check Cache Hit Ratio (Target: > 99% in Production)
```sql
SELECT 
  sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) * 100.0 AS cache_hit_ratio
FROM pg_statio_user_tables;
```

### 5. Check Dead Tuples & Trigger Vacuum
```sql
SELECT 
  relname, 
  n_live_tup, 
  n_dead_tup, 
  round(n_dead_tup::numeric / (n_live_tup + n_dead_tup + 0.0001) * 100, 2) AS dead_tuple_percent,
  last_vacuum, 
  last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;

-- Run vacuum and update planner statistics manually
VACUUM (VERBOSE, ANALYZE);
```
