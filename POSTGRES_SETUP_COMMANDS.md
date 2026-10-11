# PostgreSQL Setup - Complete Command List

**Goal:** Set up Neon PostgreSQL and migrate from MongoDB  
**Time:** 30 minutes  
**Current Status:** Neon CLI installed ✅

---

## 📋 Complete Setup Checklist

### Phase 1: Neon Cloud Setup (5 minutes)

```bash
# 1. Login to Neon (opens browser)
neon login

# 2. Link to your existing project
cd /Users/mac/Developer/AI/ai-codebase-architect
neon link --project-id mute-poetry-36023339 --branch production -y

# 3. Get connection string
neon connection-string

# Save this connection string! Example:
# postgres://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require
```

---

### Phase 2: Install Dependencies (5 minutes)

```bash
cd backend

# Install PostgreSQL drivers
npm install pg @types/pg

# Install TypeORM (ORM like Mongoose)
npm install typeorm @nestjs/typeorm

# Install for raw SQL queries (learning)
npm install --save-dev @types/node
```

---

### Phase 3: Configure Environment (2 minutes)

Add to `backend/.env`:
```env
# PostgreSQL (Neon) - REPLACE WITH YOUR CONNECTION STRING
POSTGRES_URL="postgres://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require"

# Database mode (for migration strategy)
DATABASE_MODE="dual-write"
# Options:
#   - mongodb-only: Use only MongoDB (current)
#   - dual-write: Write to both MongoDB and PostgreSQL (migration phase)
#   - postgres-only: Use only PostgreSQL (final state)
```

---

### Phase 4: Run Initial Migration (5 minutes)

```bash
# Connect to Neon and run migration SQL
neon sql-editor

# Or use psql directly
export PGPASSWORD='your-password'
psql "postgres://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require" \
  -f src/database/migrations/001-initial-schema.sql
```

**What this creates:**
- ✅ `users` table (normalized)
- ✅ `products` table (with indexes)
- ✅ `orders` + `order_items` tables (normalized, foreign keys)
- ✅ `chat_threads` + `chat_messages` tables (normalized)
- ✅ `payment_audit_logs` table (JSONB fields)
- ✅ `rate_limits` table (migrating from MongoDB)
- ✅ `idempotency_keys` table (migrating from MongoDB)
- ✅ All indexes for performance
- ✅ Triggers for auto-updating `updated_at`
- ✅ Sample data for testing

---

### Phase 5: Verify Migration (2 minutes)

```bash
# Test connection from backend
neon sql-editor

# Run verification queries:
SELECT * FROM users;
SELECT * FROM products;
SELECT COUNT(*) FROM users;

# Check indexes
SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public';

# Check table sizes
SELECT 
  tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables 
WHERE schemaname = 'public';
```

---

## 🎯 What You'll Learn

### SQL Concepts (Hands-On)

1. **Data Modeling:**
   - Normalization (1NF, 2NF, 3NF)
   - Foreign keys (REFERENCES, ON DELETE CASCADE)
   - Denormalization tradeoffs (order_items storing product name)

2. **Indexes:**
   - B-tree indexes (default, most queries)
   - GIN indexes (full-text search with pg_trgm)
   - Partial indexes (WHERE clause, e.g., `WHERE featured = true`)
   - Composite indexes (multiple columns, e.g., `user_id, created_at`)

3. **Transactions & ACID:**
   - BEGIN, COMMIT, ROLLBACK
   - Atomicity (all-or-nothing)
   - Isolation levels (READ COMMITTED, REPEATABLE READ, SERIALIZABLE)
   - Deadlock detection

4. **Concurrency:**
   - MVCC (Multi-Version Concurrency Control)
   - Row-level locks (FOR UPDATE)
   - Deadlock scenarios
   - Race condition prevention

5. **Advanced Features:**
   - Triggers (auto-update updated_at)
   - Generated columns (subtotal = price × quantity)
   - Check constraints (price >= 0)
   - JSONB for flexible data
   - Materialized views for analytics

---

## 📚 Learning Exercises

### Exercise 1: Your First SQL Query

```sql
-- Simple SELECT
SELECT * FROM users WHERE role = 'admin';

-- With JOIN
SELECT 
  o.order_number,
  u.name AS customer_name,
  o.total_amount,
  o.created_at
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE o.status = 'paid'
ORDER BY o.created_at DESC
LIMIT 10;

-- Aggregation
SELECT 
  category,
  COUNT(*) AS product_count,
  AVG(price) AS avg_price,
  SUM(stock) AS total_stock
FROM products
GROUP BY category
ORDER BY product_count DESC;
```

---

### Exercise 2: Understanding Indexes

```sql
-- Query WITHOUT index (slow)
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 1;
-- Result: Seq Scan (scans entire table)

-- Create index
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Query WITH index (fast)
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 1;
-- Result: Index Scan (uses index)

-- Compare performance
-- Without index: 500ms (100k rows scanned)
-- With index: 5ms (10 rows scanned)
```

---

### Exercise 3: Transactions (ACID)

```sql
-- Start transaction
BEGIN;

-- Insert user
INSERT INTO users (email, name, role)
VALUES ('test@example.com', 'Test User', 'user')
RETURNING id;

-- Insert order for that user
INSERT INTO orders (user_id, order_number, total_amount, status)
VALUES (CURRVAL('users_id_seq'), 'ORD-TEST-001', 99.99, 'pending');

-- Insert order items
INSERT INTO order_items (order_id, product_id, name, price, quantity)
VALUES (CURRVAL('orders_id_seq'), 1, 'Laptop Pro 15', 1299.99, 1);

-- Check everything
SELECT * FROM users WHERE email = 'test@example.com';
SELECT * FROM orders WHERE order_number = 'ORD-TEST-001';
SELECT * FROM order_items WHERE order_id = CURRVAL('orders_id_seq');

-- If everything looks good:
COMMIT;

-- If something wrong:
-- ROLLBACK;
```

---

### Exercise 4: Isolation Levels

Open two terminal windows:

**Terminal 1:**
```sql
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
SELECT * FROM products WHERE id = 1;
-- price = 1299.99
```

**Terminal 2:**
```sql
UPDATE products SET price = 999.99 WHERE id = 1;
COMMIT;
```

**Terminal 1 (continue):**
```sql
SELECT * FROM products WHERE id = 1;
-- With READ COMMITTED: price = 999.99 (sees update)
-- With REPEATABLE READ: price = 1299.99 (no change)
COMMIT;
```

---

### Exercise 5: Deadlock Detection

**Terminal 1:**
```sql
BEGIN;
UPDATE orders SET status = 'paid' WHERE id = 1;
-- (locks row 1)
```

**Terminal 2:**
```sql
BEGIN;
UPDATE orders SET status = 'paid' WHERE id = 2;
-- (locks row 2)
```

**Terminal 1:**
```sql
UPDATE orders SET status = 'cancelled' WHERE id = 2;
-- (waits for lock on row 2)
```

**Terminal 2:**
```sql
UPDATE orders SET status = 'cancelled' WHERE id = 1;
-- ERROR: deadlock detected
-- PostgreSQL automatically aborts one transaction
```

---

## 🚀 Next Steps After Setup

### Week 1: SQL Basics
- [ ] Practice SELECT, WHERE, ORDER BY, LIMIT
- [ ] Learn JOINs (INNER, LEFT, RIGHT, FULL OUTER)
- [ ] Practice aggregations (COUNT, SUM, AVG, GROUP BY)
- [ ] Understand indexes with EXPLAIN ANALYZE

### Week 2: Transactions & Concurrency
- [ ] Practice BEGIN, COMMIT, ROLLBACK
- [ ] Test isolation levels (READ COMMITTED, REPEATABLE READ)
- [ ] Trigger deadlocks and understand resolution
- [ ] Implement idempotency with UNIQUE constraints

### Week 3: Advanced Features
- [ ] Create materialized views for analytics
- [ ] Use JSONB for flexible data
- [ ] Implement full-text search with pg_trgm
- [ ] Optimize slow queries with EXPLAIN ANALYZE

### Week 4: Production Patterns
- [ ] Implement dual-write (MongoDB + PostgreSQL)
- [ ] Backfill MongoDB data to PostgreSQL
- [ ] Migrate rate limiting from MongoDB to PostgreSQL
- [ ] Cut over to PostgreSQL as primary database

---

## 🛠️ Useful Neon Commands

```bash
# List all projects
neon projects list

# List all branches
neon branches list

# Create new branch (like git branch)
neon branches create --name staging

# Get connection string for specific branch
neon connection-string --branch staging

# Open SQL editor in browser
neon sql-editor

# Monitor database
neon monitor

# View logs
neon logs

# Get database size
neon db-size
```

---

## 🎓 Database Comparison: MongoDB vs PostgreSQL

| Feature | MongoDB | PostgreSQL |
|---------|---------|------------|
| **Data Model** | Document (JSON) | Relational (tables) |
| **Schema** | Flexible | Strict |
| **Queries** | JavaScript-like | SQL |
| **Relationships** | Manual (references) | Foreign keys |
| **Transactions** | Limited | Full ACID |
| **Joins** | $lookup (slow) | Native JOINs (fast) |
| **Indexes** | B-tree, text | B-tree, GIN, GiST, BRIN |
| **Concurrency** | Document-level locks | MVCC (row-level) |
| **Constraints** | Application-level | Database-level |
| **Best For** | Rapid prototyping, flexible schemas | Complex queries, data integrity |

**MongoDB Example:**
```javascript
// Embedded (denormalized)
{
  _id: ObjectId("..."),
  email: "user@example.com",
  orders: [
    { orderNumber: "ORD-001", items: [...], total: 99.99 },
    { orderNumber: "ORD-002", items: [...], total: 149.99 }
  ]
}
```

**PostgreSQL Example:**
```sql
-- Normalized (separate tables)
users:       { id: 1, email: "user@example.com" }
orders:      { id: 1, user_id: 1, order_number: "ORD-001", total: 99.99 }
order_items: { id: 1, order_id: 1, product_id: 5, quantity: 2 }
```

**Tradeoff:**
- MongoDB: Faster reads (one query), harder to maintain consistency
- PostgreSQL: Slower reads (JOINs), better data integrity

---

## 📊 Success Criteria

After completing this setup and learning exercises, you'll be able to:

✅ Write complex SQL queries with JOINs, CTEs, window functions  
✅ Design normalized schemas (3NF) with foreign keys  
✅ Create and optimize indexes for query performance  
✅ Explain ACID properties and isolation levels  
✅ Debug deadlocks and lock conflicts  
✅ Use transactions safely in production  
✅ Optimize slow queries with EXPLAIN ANALYZE  
✅ Implement idempotency with database constraints  
✅ Understand MVCC and concurrency control  
✅ Migrate from MongoDB to PostgreSQL incrementally

**This is Staff/Principal-level database expertise.**

---

## 🎯 Current Status

- ✅ Neon CLI installed
- ✅ Migration SQL created
- ✅ Learning guide complete
- ⏳ **Next: Run `neon login` and link project**

---

## 🆘 Troubleshooting

### "neon: command not found"
```bash
# Check if installed
which neon

# If not in PATH, add to ~/.zshrc:
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### "Connection refused"
- Check Neon dashboard: https://console.neon.tech
- Ensure project is active (not suspended)
- Verify connection string is correct

### "SSL certificate error"
- Neon requires SSL
- Connection string must include `?sslmode=require`

### "Permission denied"
- Check user has correct permissions
- Try with database admin user

---

**Ready to start!** Run `neon login` when you're ready to proceed.
