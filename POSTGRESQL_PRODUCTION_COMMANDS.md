# PostgreSQL Production Commands Reference

**Quick Reference for Production DBAs and Developers**  
**Most commonly used commands for daily operations**

---

## 📊 Table of Contents

1. [Database & Connection Management](#database--connection-management)
2. [Query Performance & Optimization](#query-performance--optimization)
3. [Index Management](#index-management)
4. [Table Management & Maintenance](#table-management--maintenance)
5. [Monitoring & Statistics](#monitoring--statistics)
6. [User & Permission Management](#user--permission-management)
7. [Backup & Recovery](#backup--recovery)
8. [Replication & High Availability](#replication--high-availability)
9. [Transaction & Lock Management](#transaction--lock-management)
10. [Common Production Queries](#common-production-queries)

---

## Database & Connection Management

### List All Databases
```sql
-- Show all databases
SELECT datname, pg_size_pretty(pg_database_size(datname)) AS size
FROM pg_database
ORDER BY pg_database_size(datname) DESC;

-- Simple list
\l
```

### Connect to Database
```sql
-- From psql
\c database_name

-- Connection string
psql -h hostname -p 5432 -U username -d database_name
```

### Current Database Info
```sql
-- Current database
SELECT current_database();

-- Current user
SELECT current_user;

-- Database size
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Connection info
SELECT * FROM pg_stat_activity WHERE datname = current_database();
```

### Active Connections
```sql
-- Count connections by database
SELECT datname, count(*) as connections
FROM pg_stat_activity
GROUP BY datname
ORDER BY connections DESC;

-- Detailed connection info
SELECT 
    pid,
    usename,
    application_name,
    client_addr,
    backend_start,
    state,
    query
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY backend_start;

-- Kill specific connection
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE pid = 12345;

-- Kill all connections to a database
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'your_database' AND pid != pg_backend_pid();
```

---

## Query Performance & Optimization

### EXPLAIN ANALYZE
```sql
-- Basic query plan
EXPLAIN SELECT * FROM orders WHERE user_id = 123;

-- With actual execution times
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 123;

-- Detailed output with buffers
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) 
SELECT * FROM orders WHERE user_id = 123;

-- JSON format (for tooling)
EXPLAIN (ANALYZE, FORMAT JSON) 
SELECT * FROM orders WHERE user_id = 123;
```

### Slow Query Monitoring
```sql
-- Enable slow query logging (postgresql.conf)
-- log_min_duration_statement = 1000  # Log queries > 1 second

-- View pg_stat_statements (requires extension)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Top 10 slowest queries
SELECT 
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time,
    rows
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Most frequently called queries
SELECT 
    query,
    calls,
    total_exec_time / 1000 AS total_seconds,
    mean_exec_time,
    stddev_exec_time
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;

-- Queries consuming most total time
SELECT 
    query,
    calls,
    total_exec_time / 1000 / 60 AS total_minutes,
    mean_exec_time,
    rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Reset statistics
SELECT pg_stat_statements_reset();
```

### Query Tuning
```sql
-- Update table statistics for query planner
ANALYZE table_name;

-- Update all tables
ANALYZE;

-- Verbose analysis
ANALYZE VERBOSE table_name;

-- Force statistics refresh
VACUUM ANALYZE table_name;
```

---

## Index Management

### List All Indexes
```sql
-- Indexes for a specific table
SELECT 
    indexname,
    indexdef,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_indexes
WHERE tablename = 'orders'
ORDER BY indexname;

-- All indexes with size
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Index Usage Statistics
```sql
-- Unused indexes (never scanned)
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan AS times_used,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0 
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Index hit rate (should be > 95%)
SELECT 
    sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0) * 100 AS index_hit_rate
FROM pg_statio_user_indexes;

-- Most used indexes
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC
LIMIT 20;
```

### Create Indexes
```sql
-- Basic B-tree index
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Composite index
CREATE INDEX idx_orders_user_status ON orders(user_id, status);

-- Partial index
CREATE INDEX idx_orders_pending ON orders(user_id) WHERE status = 'pending';

-- Covering index
CREATE INDEX idx_orders_covering ON orders(user_id) INCLUDE (total_amount, created_at);

-- GIN index for JSONB
CREATE INDEX idx_orders_metadata_gin ON orders USING GIN(metadata);

-- Create index concurrently (doesn't lock table)
CREATE INDEX CONCURRENTLY idx_orders_created_at ON orders(created_at);

-- Unique index
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- Expression index
CREATE INDEX idx_users_lower_email ON users(LOWER(email));

-- DESC index for sorting
CREATE INDEX idx_orders_created_desc ON orders(created_at DESC);
```

### Drop Indexes
```sql
-- Drop index
DROP INDEX idx_orders_user_id;

-- Drop concurrently (doesn't lock table)
DROP INDEX CONCURRENTLY idx_orders_user_id;

-- Drop if exists
DROP INDEX IF EXISTS idx_orders_user_id;
```

### Rebuild Indexes
```sql
-- Rebuild specific index
REINDEX INDEX idx_orders_user_id;

-- Rebuild all indexes on table
REINDEX TABLE orders;

-- Rebuild concurrently (PostgreSQL 12+)
REINDEX INDEX CONCURRENTLY idx_orders_user_id;
```

---

## Table Management & Maintenance

### Table Size Information
```sql
-- Largest tables
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 20;

-- Table with row count
SELECT 
    schemaname,
    tablename,
    n_live_tup AS live_rows,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC;
```

### VACUUM Operations
```sql
-- Check table bloat
SELECT 
    schemaname,
    tablename,
    n_live_tup AS live_rows,
    n_dead_tup AS dead_rows,
    ROUND(n_dead_tup * 100.0 / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS bloat_percent,
    last_vacuum,
    last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 20;

-- Manual vacuum
VACUUM table_name;

-- Vacuum with analysis
VACUUM ANALYZE table_name;

-- Verbose vacuum
VACUUM VERBOSE table_name;

-- Full vacuum (rewrites table, requires exclusive lock)
VACUUM FULL table_name;

-- Vacuum all tables
VACUUM;

-- Autovacuum settings (per table)
ALTER TABLE orders SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.05
);
```

### Table Maintenance
```sql
-- Update statistics
ANALYZE table_name;

-- Check for corrupt indexes
SELECT * FROM pg_class WHERE relname = 'table_name';

-- Estimate row count (fast but approximate)
SELECT reltuples::bigint FROM pg_class WHERE relname = 'table_name';

-- Accurate row count (slow for large tables)
SELECT COUNT(*) FROM table_name;

-- Check table definition
\d+ table_name

-- Table structure
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;
```

---

## Monitoring & Statistics

### Database Health Check
```sql
-- Overall database health
SELECT 
    'connections' AS metric,
    count(*) AS value
FROM pg_stat_activity
UNION ALL
SELECT 
    'active_queries',
    count(*)
FROM pg_stat_activity
WHERE state = 'active'
UNION ALL
SELECT 
    'idle_in_transaction',
    count(*)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
UNION ALL
SELECT 
    'database_size',
    pg_database_size(current_database())::bigint;
```

### Cache Hit Ratio
```sql
-- Buffer cache hit ratio (should be > 90%)
SELECT 
    sum(heap_blks_hit) / nullif(sum(heap_blks_hit + heap_blks_read), 0) * 100 AS cache_hit_ratio
FROM pg_statio_user_tables;

-- Per-table cache hit ratio
SELECT 
    schemaname,
    tablename,
    heap_blks_hit,
    heap_blks_read,
    ROUND(heap_blks_hit * 100.0 / NULLIF(heap_blks_hit + heap_blks_read, 0), 2) AS cache_hit_percent
FROM pg_statio_user_tables
WHERE heap_blks_hit + heap_blks_read > 0
ORDER BY cache_hit_percent;
```

### Replication Lag
```sql
-- On primary server
SELECT 
    client_addr,
    state,
    sync_state,
    pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn) AS sent_lag_bytes,
    pg_wal_lsn_diff(pg_current_wal_lsn(), write_lsn) AS write_lag_bytes,
    pg_wal_lsn_diff(pg_current_wal_lsn(), flush_lsn) AS flush_lag_bytes,
    pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS replay_lag_bytes,
    extract(epoch from (now() - replay_lag)) AS replay_lag_seconds
FROM pg_stat_replication;

-- On standby server
SELECT 
    now() - pg_last_xact_replay_timestamp() AS replication_lag;
```

### Long-Running Queries
```sql
-- Queries running > 5 minutes
SELECT 
    pid,
    now() - query_start AS duration,
    usename,
    query,
    state
FROM pg_stat_activity
WHERE state != 'idle'
  AND now() - query_start > interval '5 minutes'
ORDER BY duration DESC;

-- Kill long-running query
SELECT pg_cancel_backend(pid);  -- Graceful
SELECT pg_terminate_backend(pid);  -- Forceful
```

---

## User & Permission Management

### User Management
```sql
-- List all users/roles
SELECT 
    rolname,
    rolsuper,
    rolinherit,
    rolcreaterole,
    rolcreatedb,
    rolcanlogin
FROM pg_roles
ORDER BY rolname;

-- Create user
CREATE USER username WITH PASSWORD 'password';

-- Create user with privileges
CREATE USER app_user WITH 
    PASSWORD 'secure_password' 
    LOGIN 
    NOCREATEDB 
    NOCREATEROLE;

-- Alter user password
ALTER USER username WITH PASSWORD 'new_password';

-- Grant superuser
ALTER USER username WITH SUPERUSER;

-- Drop user
DROP USER username;
```

### Permission Management
```sql
-- Grant database access
GRANT CONNECT ON DATABASE mydb TO username;

-- Grant schema usage
GRANT USAGE ON SCHEMA public TO username;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO username;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO username;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO username;

-- Grant future permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public 
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO username;

-- Revoke permissions
REVOKE INSERT ON orders FROM username;

-- Check user permissions
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'username';
```

---

## Backup & Recovery

### Logical Backup (pg_dump)
```bash
# Backup single database
pg_dump -h hostname -U username -d database_name -f backup.sql

# Backup with compression
pg_dump -h hostname -U username -d database_name | gzip > backup.sql.gz

# Custom format (recommended)
pg_dump -h hostname -U username -Fc database_name -f backup.dump

# Specific table
pg_dump -h hostname -U username -d database_name -t table_name -f table_backup.sql

# Schema only
pg_dump -h hostname -U username -d database_name --schema-only -f schema.sql

# Data only
pg_dump -h hostname -U username -d database_name --data-only -f data.sql

# All databases
pg_dumpall -h hostname -U username -f all_databases.sql
```

### Restore
```bash
# Restore SQL dump
psql -h hostname -U username -d database_name -f backup.sql

# Restore custom format
pg_restore -h hostname -U username -d database_name backup.dump

# Restore with parallelism
pg_restore -h hostname -U username -d database_name -j 4 backup.dump

# Restore specific table
pg_restore -h hostname -U username -d database_name -t table_name backup.dump

# Restore with clean (drop existing objects)
pg_restore -h hostname -U username -d database_name --clean backup.dump
```

### Point-in-Time Recovery (PITR)
```sql
-- Check WAL archiving status
SHOW archive_mode;
SHOW archive_command;

-- Current WAL location
SELECT pg_current_wal_lsn();

-- Create restore point
SELECT pg_create_restore_point('before_migration');

-- List restore points
SELECT * FROM pg_available_extension_versions WHERE name = 'pg_restore_point';
```

---

## Replication & High Availability

### Replication Status
```sql
-- On primary: Check replication slots
SELECT * FROM pg_replication_slots;

-- On primary: Check active replicas
SELECT 
    client_addr,
    state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn,
    sync_state
FROM pg_stat_replication;

-- On standby: Check recovery status
SELECT pg_is_in_recovery();

-- On standby: Last received WAL
SELECT pg_last_wal_receive_lsn();

-- On standby: Last replayed WAL
SELECT pg_last_wal_replay_lsn();
```

### Failover & Promotion
```sql
-- Promote standby to primary
SELECT pg_promote();

-- Or from command line
pg_ctl promote -D /path/to/data
```

---

## Transaction & Lock Management

### Current Transactions
```sql
-- Active transactions
SELECT 
    pid,
    usename,
    xact_start,
    now() - xact_start AS duration,
    state,
    query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start;
```

### Lock Monitoring
```sql
-- Current locks
SELECT 
    locktype,
    database,
    relation::regclass AS table_name,
    mode,
    granted,
    pid,
    query
FROM pg_locks
JOIN pg_stat_activity USING (pid)
WHERE relation IS NOT NULL;

-- Blocked queries
SELECT 
    blocked.pid AS blocked_pid,
    blocked.query AS blocked_query,
    blocking.pid AS blocking_pid,
    blocking.query AS blocking_query
FROM pg_stat_activity AS blocked
JOIN pg_locks AS blocked_locks ON blocked.pid = blocked_locks.pid
JOIN pg_locks AS blocking_locks ON 
    blocked_locks.locktype = blocking_locks.locktype
    AND blocked_locks.relation = blocking_locks.relation
    AND blocked_locks.pid != blocking_locks.pid
    AND NOT blocking_locks.granted
JOIN pg_stat_activity AS blocking ON blocking.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- Waiting queries
SELECT 
    pid,
    wait_event_type,
    wait_event,
    state,
    query
FROM pg_stat_activity
WHERE wait_event IS NOT NULL
  AND state != 'idle';
```

---

## Common Production Queries

### Find Duplicate Rows
```sql
SELECT email, COUNT(*)
FROM users
GROUP BY email
HAVING COUNT(*) > 1;
```

### Delete Duplicates (Keep First)
```sql
DELETE FROM users a USING (
    SELECT MIN(ctid) as ctid, email
    FROM users
    GROUP BY email
    HAVING COUNT(*) > 1
) b
WHERE a.email = b.email
  AND a.ctid <> b.ctid;
```

### Upsert (Insert or Update)
```sql
INSERT INTO products (sku, name, price)
VALUES ('ABC123', 'Product Name', 99.99)
ON CONFLICT (sku)
DO UPDATE SET 
    name = EXCLUDED.name,
    price = EXCLUDED.price,
    updated_at = NOW();
```

### Bulk Insert with COPY
```sql
-- From CSV file
COPY orders (user_id, total_amount, status)
FROM '/path/to/orders.csv'
WITH (FORMAT csv, HEADER true);

-- To CSV file
COPY (SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '7 days')
TO '/path/to/recent_orders.csv'
WITH (FORMAT csv, HEADER true);
```

### JSON Queries
```sql
-- Extract JSON field
SELECT id, metadata->>'status' AS status
FROM orders
WHERE metadata @> '{"paid": true}';

-- Update JSON field
UPDATE orders
SET metadata = jsonb_set(metadata, '{status}', '"shipped"')
WHERE id = 123;

-- Array containment
SELECT * FROM products
WHERE tags @> '["electronics"]';
```

### Window Functions
```sql
-- Row number
SELECT 
    name,
    price,
    ROW_NUMBER() OVER (ORDER BY price DESC) AS rank
FROM products;

-- Running total
SELECT 
    created_at::date,
    total_amount,
    SUM(total_amount) OVER (ORDER BY created_at::date) AS running_total
FROM orders;

-- Percentile
SELECT 
    user_id,
    total_spent,
    PERCENT_RANK() OVER (ORDER BY total_spent) AS percentile
FROM user_stats;
```

### Date/Time Queries
```sql
-- Today's records
SELECT * FROM orders WHERE created_at::date = CURRENT_DATE;

-- Last 7 days
SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '7 days';

-- Group by date
SELECT 
    created_at::date AS date,
    COUNT(*) AS order_count,
    SUM(total_amount) AS revenue
FROM orders
GROUP BY created_at::date
ORDER BY date DESC;

-- Date truncation
SELECT 
    DATE_TRUNC('hour', created_at) AS hour,
    COUNT(*) AS orders_per_hour
FROM orders
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour;
```

### Common CTEs
```sql
-- Recursive CTE (tree traversal)
WITH RECURSIVE category_tree AS (
    -- Base case
    SELECT id, name, parent_id, 0 AS level
    FROM categories
    WHERE parent_id IS NULL
    
    UNION ALL
    
    -- Recursive case
    SELECT c.id, c.name, c.parent_id, ct.level + 1
    FROM categories c
    JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT * FROM category_tree;

-- Multiple CTEs
WITH 
    active_users AS (
        SELECT * FROM users WHERE status = 'active'
    ),
    recent_orders AS (
        SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '30 days'
    )
SELECT 
    u.name,
    COUNT(o.id) AS order_count
FROM active_users u
LEFT JOIN recent_orders o ON u.id = o.user_id
GROUP BY u.id, u.name;
```

---

## Performance Best Practices

### Query Optimization Checklist
```sql
-- ✅ Use EXPLAIN ANALYZE to understand query plan
-- ✅ Create indexes on WHERE, JOIN, and ORDER BY columns
-- ✅ Use LIMIT when appropriate
-- ✅ Avoid SELECT * (specify needed columns)
-- ✅ Use EXISTS instead of IN for subqueries
-- ✅ Use connection pooling (PgBouncer)
-- ✅ Run VACUUM ANALYZE regularly
-- ✅ Monitor slow queries with pg_stat_statements
-- ✅ Use covering indexes for frequently queried columns
-- ✅ Partition large tables (100M+ rows)
```

### Configuration Tuning
```sql
-- Check current settings
SHOW ALL;
SHOW shared_buffers;
SHOW work_mem;

-- Important settings (in postgresql.conf)
-- shared_buffers = 25% of RAM (up to 8GB)
-- effective_cache_size = 50-75% of RAM
-- work_mem = RAM / max_connections / 4
-- maintenance_work_mem = RAM / 16 (up to 2GB)
-- random_page_cost = 1.1 (for SSD)
-- effective_io_concurrency = 200 (for SSD)
-- max_connections = 100-300
-- autovacuum = on
```

---

## Emergency Commands

### Database is Slow
```sql
-- 1. Check long-running queries
SELECT * FROM pg_stat_activity WHERE state != 'idle' AND now() - query_start > interval '1 minute';

-- 2. Check locks
SELECT * FROM pg_locks WHERE NOT granted;

-- 3. Check bloat
SELECT * FROM pg_stat_user_tables WHERE n_dead_tup > 10000;

-- 4. Run VACUUM ANALYZE
VACUUM ANALYZE;
```

### Database is Full
```sql
-- Check database size
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Find largest tables
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC LIMIT 10;

-- Clean up old data
DELETE FROM logs WHERE created_at < NOW() - INTERVAL '90 days';

-- VACUUM FULL to reclaim space
VACUUM FULL table_name;
```

### Connection Pool Exhausted
```sql
-- Check connection count
SELECT count(*) FROM pg_stat_activity;

-- Kill idle connections
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'idle' 
  AND state_change < NOW() - INTERVAL '10 minutes';

-- Increase max_connections (postgresql.conf)
-- max_connections = 200
```

---

## Quick Reference Card

| Task | Command |
|------|---------|
| Connect | `psql -h host -U user -d database` |
| List databases | `\l` |
| List tables | `\dt` |
| Describe table | `\d+ table_name` |
| Quit psql | `\q` |
| Run SQL file | `\i file.sql` |
| Show queries | `SELECT * FROM pg_stat_activity;` |
| Kill query | `SELECT pg_cancel_backend(pid);` |
| Table size | `SELECT pg_size_pretty(pg_total_relation_size('table'));` |
| Vacuum | `VACUUM ANALYZE table_name;` |
| Create index | `CREATE INDEX idx_name ON table(column);` |
| Explain query | `EXPLAIN ANALYZE SELECT ...;` |

---

**Keep this file handy for daily PostgreSQL operations!** 🚀
