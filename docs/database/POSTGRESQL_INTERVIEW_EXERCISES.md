# PostgreSQL Interview Exercises - Complete Guide

**Status:** Staff/Principal-Level Database Expertise  
**Format:** Theory → Hands-On → Interview Questions  
**Timeline:** 4 weeks, 15 exercises

---

## 🎯 What Makes This Different

**Most Tutorials:** "Here's how to write a SELECT query"  
**This Guide:** "Here's how to optimize a slow query from 5s to 50ms using EXPLAIN ANALYZE, composite indexes, and query rewriting. Here's when I'd use covering indexes vs partial indexes. Here's the tradeoff."

**You'll learn:** Not just WHAT (syntax), but WHY (decisions) and WHEN (tradeoffs)

---

# Exercise 1: Data Modeling & Normalization

## 📚 Theory

### Normalization Forms

**1NF (First Normal Form):**
- Each column contains atomic values (no arrays, no nested objects)
- Each row is unique (has primary key)

**2NF (Second Normal Form):**
- Meets 1NF
- No partial dependencies (non-key columns depend on entire primary key)

**3NF (Third Normal Form):**
- Meets 2NF
- No transitive dependencies (non-key columns don't depend on other non-key columns)

### Example: E-Commerce Orders

**❌ Not Normalized (0NF):**
```json
{
  "order_id": 1,
  "customer": {
    "name": "Alice",
    "email": "alice@example.com",
    "addresses": ["123 Main St", "456 Oak Ave"]
  },
  "items": [
    {"product": "Laptop", "price": 1299.99, "quantity": 1},
    {"product": "Mouse", "price": 29.99, "quantity": 2}
  ],
  "total": 1359.97
}
```

**✅ Normalized (3NF):**
```sql
-- Customers table
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE
);

-- Addresses table (1:N with customers)
CREATE TABLE addresses (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  street VARCHAR(255)
);

-- Products table
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  price DECIMAL(10, 2)
);

-- Orders table
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order items table (N:M between orders and products)
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  quantity INTEGER,
  price_at_purchase DECIMAL(10, 2) -- Denormalized for historical record
);
```

**Why Denormalize `price_at_purchase`?**
- Product price may change over time
- Order should reflect price at time of purchase
- Tradeoff: Duplicate data vs historical accuracy

---

## 🔨 Hands-On Exercise

### Task 1: Identify Normalization Issues

**Given Schema:**
```sql
CREATE TABLE orders_bad (
  order_id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(20),
  product_names TEXT[], -- ARRAY of product names
  product_prices DECIMAL[], -- ARRAY of prices
  product_quantities INTEGER[],
  total_amount DECIMAL(10, 2),
  shipping_address TEXT
);
```

**Problems:**
1. **Not 1NF:** Arrays violate atomic values
2. **Not 2NF:** Customer info repeats for each order (partial dependency)
3. **Not 3NF:** Total is derived from products (transitive dependency)
4. **Data anomalies:**
   - **Insert anomaly:** Can't add customer without order
   - **Update anomaly:** Changing customer email requires updating all orders
   - **Delete anomaly:** Deleting last order deletes customer info

**Your Task:** Normalize to 3NF (see solution above)

---

### Task 2: Denormalization Tradeoffs

**Question:** When would you denormalize?

**Answer:**
```sql
-- Scenario: Product catalog with categories

-- Option 1: Normalized (3NF)
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100)
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  category_id INTEGER REFERENCES categories(id)
);

-- Query requires JOIN
SELECT p.name, c.name as category
FROM products p
JOIN categories c ON p.category_id = c.id;

-- Option 2: Denormalized (store category name in products)
CREATE TABLE products_denorm (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  category_id INTEGER REFERENCES categories(id),
  category_name VARCHAR(100) -- Denormalized
);

-- Query is simple
SELECT name, category_name FROM products_denorm;
```

**When to Denormalize:**
- ✅ Read-heavy workload (90%+ reads)
- ✅ Category names rarely change
- ✅ Query performance critical (JOIN is bottleneck)

**When NOT to Denormalize:**
- ❌ Write-heavy workload (must update both tables)
- ❌ Data changes frequently (sync issues)
- ❌ JOIN is already fast (<10ms with index)

**Tradeoff:** Performance vs consistency

---

## 🎤 Interview Questions

### Q1: "Explain 3NF with an example"

**Perfect Answer:**
> "3NF eliminates transitive dependencies. For example, in an orders table, if we store customer_id, customer_name, and customer_city, there's a transitive dependency: order → customer_id → customer_city. The city depends on customer_id, not on the order itself. To normalize to 3NF, we separate customers into their own table with customer_id as foreign key in orders. This prevents update anomalies—if a customer moves cities, we update one row in customers table, not all their orders."

### Q2: "When would you denormalize?"

**Perfect Answer:**
> "I denormalize when read performance is critical and data rarely changes. For example, in our order_items table, I store price_at_purchase even though product price exists in products table. Why? Product prices change, but historical orders must reflect the price at time of purchase. The tradeoff is data duplication, but historical accuracy is non-negotiable for orders. I wouldn't denormalize if data changes frequently—synchronization overhead would outweigh benefits."

### Q3: "What's the difference between 2NF and 3NF?"

**Perfect Answer:**
> "2NF eliminates partial dependencies (where a non-key column depends on part of a composite primary key), while 3NF eliminates transitive dependencies (where a non-key column depends on another non-key column). Example: If a table has composite key (student_id, course_id) and columns (grade, instructor_name, instructor_email), instructor_email depending on instructor_name is a transitive dependency. Grade depends on the full composite key (student_id, course_id), so that's fine for 2NF. But instructor_email → instructor_name violates 3NF."

---

# Exercise 2: Indexes Deep Dive

## 📚 Theory

### Index Types

| Type | Use Case | Example |
|------|----------|---------|
| **B-tree** (default) | Equality, range queries | `WHERE user_id = 123`, `WHERE created_at > NOW()` |
| **Hash** | Equality only | `WHERE email = 'alice@example.com'` (rarely used) |
| **GIN** | Arrays, JSONB, full-text | `WHERE tags @> '{electronics}'`, `WHERE data @> '{"status": "paid"}'` |
| **GiST** | Geometric, full-text | `WHERE location <-> point(0,0) < 10` |
| **BRIN** | Large tables, sequential data | `WHERE created_at BETWEEN '2024-01-01' AND '2024-12-31'` (100M+ rows) |

---

## 🔨 Hands-On Exercise

### Task 1: Understand EXPLAIN ANALYZE

```sql
-- Query WITHOUT index
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 5;

-- Example output:
-- Seq Scan on orders  (cost=0.00..25.88 rows=4 width=112) (actual time=0.015..0.098 rows=2 loops=1)
--   Filter: (user_id = 5)
--   Rows Removed by Filter: 13
-- Planning Time: 0.078 ms
-- Execution Time: 0.119 ms
```

**Key Metrics:**
- **Seq Scan:** Scans entire table (slow for large tables)
- **Rows Removed by Filter:** 13 rows scanned but didn't match (wasteful)
- **actual time:** Real execution time (0.098ms)

```sql
-- Create index
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Query WITH index
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 5;

-- Example output:
-- Index Scan using idx_orders_user_id on orders  (cost=0.14..8.16 rows=4 width=112) (actual time=0.017..0.019 rows=2 loops=1)
--   Index Cond: (user_id = 5)
-- Planning Time: 0.045 ms
-- Execution Time: 0.034 ms
```

**Key Improvements:**
- **Index Scan:** Uses index (much faster for large tables)
- **No Rows Removed:** Only reads matching rows
- **3x faster:** 0.098ms → 0.034ms (on small table; would be 100x on large table)

---

### Task 2: Composite Indexes

**Scenario:** Query user's recent orders
```sql
SELECT * FROM orders
WHERE user_id = 5 AND created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
```

**Bad Index (user_id only):**
```sql
CREATE INDEX idx_orders_user_id ON orders(user_id);
```
- Index helps filter by user_id
- But still needs to scan all user's orders to filter by created_at
- Still needs to sort by created_at

**Good Index (composite):**
```sql
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);
```
- Index filters by user_id
- Index is already sorted by created_at (no sort needed!)
- Index can be scanned backwards for DESC order

**EXPLAIN ANALYZE:**
```
Index Scan Backward using idx_orders_user_created on orders
  Index Cond: ((user_id = 5) AND (created_at > (now() - '30 days'::interval)))
```
**Result:** 10x faster (no sort, no filter on created_at)

**Index Column Order Matters:**
```sql
-- Good for: WHERE user_id = ? AND created_at > ?
CREATE INDEX idx_1 ON orders(user_id, created_at);

-- Good for: WHERE created_at > ? AND user_id = ?
-- Also good for: WHERE created_at > ? (without user_id)
CREATE INDEX idx_2 ON orders(created_at, user_id);

-- Rule: Most selective column first (usually)
-- Exception: If you query by created_at alone, put it first
```

---

### Task 3: Partial Indexes

**Scenario:** Index only active users (95% of users are active)

**Bad Index (indexes all users):**
```sql
CREATE INDEX idx_users_active ON users(is_active);
```
- Indexes 100% of rows
- Takes more space
- Slower writes (all user updates touch index)

**Good Index (partial):**
```sql
CREATE INDEX idx_users_active_only ON users(email) WHERE is_active = true;
```
- Indexes only 95% of rows (active users)
- Smaller, faster
- Queries for active users are optimized

**Usage:**
```sql
SELECT * FROM users WHERE is_active = true AND email = 'alice@example.com';
-- Uses idx_users_active_only
```

---

### Task 4: Covering Indexes

**Scenario:** Dashboard query fetches id, name, email for active users

**Index 1 (B-tree on email):**
```sql
CREATE INDEX idx_users_email ON users(email);

SELECT id, name, email FROM users WHERE email = 'alice@example.com';
-- Index Scan on idx_users_email (finds matching row)
-- → Heap Fetch (reads actual table row to get id, name)
```
**Cost:** Index seek + heap fetch (2 I/O operations)

**Index 2 (covering index - includes all needed columns):**
```sql
CREATE INDEX idx_users_email_covering ON users(email) INCLUDE (id, name);

SELECT id, name, email FROM users WHERE email = 'alice@example.com';
-- Index Only Scan on idx_users_email_covering
-- (all data in index, no heap fetch needed!)
```
**Cost:** Index seek only (1 I/O operation)  
**Result:** 2x faster

**Tradeoff:**
- **Pro:** Faster reads (no heap fetch)
- **Con:** Larger index (stores id, name in index)
- **Con:** Slower writes (more data to update)

**When to use:**
- ✅ Read-heavy queries (dashboard, reports)
- ✅ Queried columns are small (id, name)
- ❌ Write-heavy tables (inserts/updates suffer)
- ❌ Including large columns (TEXT, JSONB)

---

## 🎤 Interview Questions

### Q1: "How do you optimize a slow query?"

**Perfect Answer:**
> "First, I use EXPLAIN ANALYZE to see the execution plan. I look for Seq Scan on large tables—that's usually the bottleneck. If I see Seq Scan, I check if there's a WHERE clause that could benefit from an index. For example, if querying WHERE user_id = 123, I create an index on user_id. After creating the index, I run EXPLAIN ANALYZE again to verify it's using the index (Index Scan instead of Seq Scan). I also check for expensive sorts—if the query has ORDER BY, I can include that column in the index with DESC if needed. The key is: don't guess, measure with EXPLAIN ANALYZE."

### Q2: "Explain composite indexes and column order"

**Perfect Answer:**
> "Composite indexes cover multiple columns and column order matters. For a query like WHERE user_id = 5 AND created_at > '2024-01-01', I'd create INDEX (user_id, created_at). PostgreSQL can use this index for both conditions because user_id is the leftmost column. Column order follows the rule: most selective (filters the most rows) first. However, if I also query WHERE created_at > ? without user_id, I'd need a separate index on created_at—composite indexes don't work with only the second column. Think of it like a phone book sorted by (last_name, first_name)—you can find 'Smith, John' but not just 'John'."

### Q3: "What's a covering index? When do you use it?"

**Perfect Answer:**
> "A covering index includes all columns needed by a query using the INCLUDE clause. For example, SELECT id, name FROM users WHERE email = ? can use a covering index INDEX (email) INCLUDE (id, name). This enables Index Only Scan—PostgreSQL gets all data from the index without fetching the actual table row (heap fetch). It's 2-3x faster. I use covering indexes for read-heavy queries like dashboards where a few milliseconds matter. The tradeoff is larger index size and slower writes. I don't use it for write-heavy tables or when including large columns—the index bloat isn't worth it."

---

# Exercise 3: Transactions & ACID

## 📚 Theory

### ACID Properties

**Atomicity:** All-or-nothing. If one statement fails, entire transaction rolls back.

**Consistency:** Database goes from one valid state to another. Constraints are enforced.

**Isolation:** Concurrent transactions don't interfere. Controlled by isolation level.

**Durability:** Committed data survives crashes. Written to disk.

---

## 🔨 Hands-On Exercise

### Task 1: Atomicity (All-or-Nothing)

**Scenario:** Transfer money between accounts

```sql
-- WITHOUT transaction (bad)
UPDATE accounts SET balance = balance - 100 WHERE user_id = 1;
-- If crash happens here, $100 disappears!
UPDATE accounts SET balance = balance + 100 WHERE user_id = 2;

-- WITH transaction (good)
BEGIN;

UPDATE accounts SET balance = balance - 100 WHERE user_id = 1;
-- If this succeeds but next fails...
UPDATE accounts SET balance = balance + 100 WHERE user_id = 2;

COMMIT; -- Both succeed
-- OR
ROLLBACK; -- Both fail (nothing changes)
```

**Test Atomicity:**
```sql
BEGIN;

UPDATE accounts SET balance = balance - 100 WHERE user_id = 1;
UPDATE accounts SET balance = balance + 100 WHERE user_id = 999; -- Doesn't exist!

-- Error: foreign key violation
-- Transaction is now in "aborted" state
-- All changes rolled back automatically

SELECT * FROM accounts WHERE user_id = 1;
-- Balance unchanged (atomicity!)
```

---

### Task 2: Consistency (Constraints Enforced)

```sql
-- Add constraint: balance cannot be negative
ALTER TABLE accounts ADD CONSTRAINT positive_balance CHECK (balance >= 0);

-- Try to overdraw
BEGIN;
UPDATE accounts SET balance = balance - 1000 WHERE user_id = 1 AND balance = 100;
-- Error: violates check constraint "positive_balance"
ROLLBACK;

-- Balance stays at 100 (consistency!)
```

---

### Task 3: Isolation (Concurrent Transactions)

**Scenario:** Two users checkout the last item simultaneously

**Terminal 1:**
```sql
BEGIN;

-- Check stock
SELECT stock FROM products WHERE id = 1; -- stock = 1

-- Decrement stock
UPDATE products SET stock = stock - 1 WHERE id = 1;
-- Stock is now 0

COMMIT;
```

**Terminal 2 (simultaneous):**
```sql
BEGIN;

-- Check stock
SELECT stock FROM products WHERE id = 1; -- stock = 1 (if READ COMMITTED)

-- Decrement stock
UPDATE products SET stock = stock - 1 WHERE id = 1;
-- Waits for Terminal 1 to commit...

-- After Terminal 1 commits:
-- This UPDATE sees stock = 0, decrements to -1 (oversold!)
```

**Solution: Use FOR UPDATE lock**
```sql
BEGIN;

-- Lock the row
SELECT stock FROM products WHERE id = 1 FOR UPDATE;
-- stock = 1

-- Decrement
UPDATE products SET stock = stock - 1 WHERE id = 1;
-- stock = 0

COMMIT;

-- Terminal 2 waits for lock, then sees stock = 0
-- Returns "Out of Stock" instead of overselling
```

---

### Task 4: Durability (Survives Crashes)

```sql
BEGIN;

INSERT INTO orders (user_id, total_amount) VALUES (1, 99.99);

COMMIT; -- Data is written to WAL (Write-Ahead Log)

-- Even if PostgreSQL crashes NOW, this order survives
-- On restart, PostgreSQL replays WAL to recover data
```

---

## 🎤 Interview Questions

### Q1: "Explain ACID with a real example"

**Perfect Answer:**
> "ACID ensures database reliability. Let me explain with a payment scenario. Atomicity: When processing a payment, we insert an order, decrement product stock, and charge the card. If any step fails, all steps roll back—no partial state. Consistency: We enforce constraints like stock >= 0. If a transaction tries to set stock to -1, it's rejected—database stays valid. Isolation: If two users checkout the last item simultaneously, isolation ensures only one succeeds. We use SELECT FOR UPDATE to lock the row. Durability: After COMMIT, the order is written to disk (WAL). Even if the server crashes, the order survives. Without ACID, we'd have inconsistent data—orders without stock updates, or vice versa."

### Q2: "What happens if a transaction fails midway?"

**Perfect Answer:**
> "If any statement in a transaction fails, the transaction enters an 'aborted' state and all changes are rolled back. For example, if I BEGIN a transaction, insert an order, then try to update a non-existent product, the UPDATE fails with an error. At that point, the order insert is undone—the transaction is rolled back. I cannot continue the transaction; I must ROLLBACK explicitly and start a new one. This is atomicity: all-or-nothing. MongoDB's multi-document transactions have similar behavior, but PostgreSQL's ACID transactions are more mature and performant."

### Q3: "How do you handle concurrent checkouts?"

**Perfect Answer:**
> "I use SELECT FOR UPDATE to lock the product row during checkout. Here's the flow: BEGIN transaction, SELECT stock FOR UPDATE, check if stock > 0, decrement stock, COMMIT. The FOR UPDATE lock prevents concurrent transactions from reading the row until the first commits. If a second user tries to checkout simultaneously, their SELECT FOR UPDATE waits. After the first user commits, the second sees updated stock (possibly 0), and gets 'Out of Stock' instead of overselling. The tradeoff is lock contention—high-traffic products may queue up. For very high scale, I'd use optimistic locking with version numbers or move to eventual consistency."

---

# Exercise 4: Isolation Levels

## 📚 Theory

| Level | Dirty Read | Non-Repeatable Read | Phantom Read | Performance |
|-------|------------|---------------------|--------------|-------------|
| **READ UNCOMMITTED** | ✅ Possible | ✅ Possible | ✅ Possible | Fastest |
| **READ COMMITTED** (default) | ❌ Prevented | ✅ Possible | ✅ Possible | Fast |
| **REPEATABLE READ** | ❌ Prevented | ❌ Prevented | ⚠️ Prevented* | Medium |
| **SERIALIZABLE** | ❌ Prevented | ❌ Prevented | ❌ Prevented | Slowest |

*PostgreSQL's REPEATABLE READ also prevents phantom reads (stronger than SQL standard)

---

## 🔨 Hands-On Exercise

### Task 1: READ COMMITTED (Default)

**Scenario:** Non-repeatable reads are possible

**Terminal 1:**
```sql
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;

SELECT price FROM products WHERE id = 1; -- price = $100

-- Wait here...
```

**Terminal 2:**
```sql
UPDATE products SET price = 150 WHERE id = 1;
COMMIT;
```

**Terminal 1 (continue):**
```sql
SELECT price FROM products WHERE id = 1; -- price = $150 (changed!)

COMMIT;
```

**Result:** Same query, different result within one transaction (non-repeatable read)

**When this is OK:**
- Reading product catalog (prices can update)
- Dashboard statistics (exact consistency not critical)

**When this is NOT OK:**
- Financial calculations (totals must be consistent)
- Checkout (price must not change mid-transaction)

---

### Task 2: REPEATABLE READ

**Scenario:** Consistent snapshot throughout transaction

**Terminal 1:**
```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;

SELECT price FROM products WHERE id = 1; -- price = $100

-- Wait here...
```

**Terminal 2:**
```sql
UPDATE products SET price = 150 WHERE id = 1;
COMMIT;
```

**Terminal 1 (continue):**
```sql
SELECT price FROM products WHERE id = 1; -- price = $100 (unchanged!)

COMMIT;
```

**Result:** Same query, same result (repeatable read)

**How?** PostgreSQL uses MVCC (Multi-Version Concurrency Control). Terminal 1 reads a snapshot taken at BEGIN. Terminal 2's changes are not visible to Terminal 1's snapshot.

**When to use:**
- Checkout (ensure prices don't change)
- Financial reports (consistent data)
- Batch processing (consistent dataset)

---

### Task 3: SERIALIZABLE (Strictest)

**Scenario:** Prevent write skew

**Terminal 1:**
```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Check total balance across all accounts
SELECT SUM(balance) FROM accounts; -- $1000

-- Transfer money based on total
INSERT INTO ledger (amount) VALUES (1000);

-- Wait here...
```

**Terminal 2:**
```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Also check total
SELECT SUM(balance) FROM accounts; -- $1000

-- Also transfer
INSERT INTO ledger (amount) VALUES (1000);

COMMIT; -- Succeeds
```

**Terminal 1 (continue):**
```sql
COMMIT; -- ERROR: could not serialize access due to read/write dependencies
```

**Result:** PostgreSQL detects that both transactions read the same data and made conflicting writes. One is aborted.

**When to use:**
- Banking (prevent double-spending)
- Inventory (prevent overselling)
- Concurrent schema changes

**Tradeoff:** Slowest, highest abort rate (need retry logic)

---

## 🎤 Interview Questions

### Q1: "Explain isolation levels and when to use each"

**Perfect Answer:**
> "PostgreSQL has three practical isolation levels. READ COMMITTED is the default and most common—each query sees committed data as of query start. This allows non-repeatable reads but is fast. I use it for most cases. REPEATABLE READ gives a consistent snapshot—once a transaction starts, it sees the same data throughout, even if other transactions commit. I use this for checkout to ensure product prices don't change mid-transaction, or for financial reports where consistency matters. SERIALIZABLE is strictest—it detects conflicts and aborts one transaction if two might interfere. I use this for banking or inventory where race conditions are unacceptable. The tradeoff is performance: READ COMMITTED is fastest, SERIALIZABLE is slowest with highest abort rate needing retry logic."

### Q2: "What's the difference between REPEATABLE READ and SERIALIZABLE?"

**Perfect Answer:**
> "Both prevent non-repeatable reads, but SERIALIZABLE also prevents write skew—a subtle anomaly where two transactions read overlapping data and make conflicting writes based on what they read. Example: Two transactions check if SUM(accounts.balance) > $1000, both see $1000, both withdraw $600. Final balance is -$200, violating constraint. REPEATABLE READ allows this; SERIALIZABLE detects it and aborts one transaction. The detection uses predicate locks—tracking not just rows read, but the conditions used. Tradeoff: SERIALIZABLE is slower and has higher abort rate. I use REPEATABLE READ for most cases and SERIALIZABLE only when write skew must be prevented, like banking."

### Q3: "How does PostgreSQL implement REPEATABLE READ?"

**Perfect Answer:**
> "PostgreSQL uses MVCC—Multi-Version Concurrency Control. Each transaction gets a snapshot at BEGIN. When reading a row, PostgreSQL checks the transaction ID (XID) that created/modified it. If the XID is after the snapshot, that version is invisible to the transaction. This allows concurrent readers and writers without blocking—readers see old versions, writers create new versions. Dead tuples (old versions) are cleaned up by VACUUM. The genius is: readers never block writers, writers never block readers. The tradeoff is disk space—multiple versions exist until vacuumed—and XID wraparound risk if VACUUM doesn't run."

---

# Exercise 5: Deadlocks & Concurrency

## 📚 Theory

**Deadlock:** Two transactions wait for each other indefinitely.

**Example:**
```
Transaction A holds lock on Row 1, wants lock on Row 2
Transaction B holds lock on Row 2, wants lock on Row 1
→ Deadlock!
```

**PostgreSQL Detection:** After 1 second (deadlock_timeout), PostgreSQL detects the cycle and aborts one transaction.

---

## 🔨 Hands-On Exercise

### Task 1: Trigger a Deadlock

**Terminal 1:**
```sql
BEGIN;
UPDATE orders SET status = 'paid' WHERE id = 1; -- Locks row 1
-- Wait here...
```

**Terminal 2:**
```sql
BEGIN;
UPDATE orders SET status = 'paid' WHERE id = 2; -- Locks row 2
-- Now try to lock row 1
UPDATE orders SET status = 'cancelled' WHERE id = 1; -- Waits for Terminal 1
```

**Terminal 1 (continue):**
```sql
UPDATE orders SET status = 'cancelled' WHERE id = 2; -- Waits for Terminal 2

-- ERROR: deadlock detected
-- DETAIL: Process 12345 waits for ShareLock on transaction 67890;
--         blocked by process 12346.
--         Process 12346 waits for ShareLock on transaction 67891;
--         blocked by process 12345.
```

**Result:** PostgreSQL aborts Terminal 1's transaction.

---

### Task 2: Prevent Deadlocks

**Solution 1: Consistent Lock Order**
```sql
-- Always lock orders in ascending ID order
BEGIN;
UPDATE orders SET status = 'paid' WHERE id IN (1, 2) ORDER BY id;
-- Locks row 1, then row 2
COMMIT;

-- Both terminals lock in same order → no deadlock
```

**Solution 2: Lock All Rows Upfront**
```sql
BEGIN;
SELECT * FROM orders WHERE id IN (1, 2) FOR UPDATE;
-- Locks all rows at start
UPDATE orders SET status = 'paid' WHERE id = 1;
UPDATE orders SET status = 'cancelled' WHERE id = 2;
COMMIT;
```

**Solution 3: Retry Logic**
```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === '40P01' && i < maxRetries - 1) {
        // Deadlock detected, retry
        await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

// Usage
await withRetry(async () => {
  await db.transaction(async (trx) => {
    await trx('orders').where({ id: 1 }).update({ status: 'paid' });
    await trx('orders').where({ id: 2 }).update({ status: 'cancelled' });
  });
});
```

---

## 🎤 Interview Questions

### Q1: "What causes deadlocks and how do you prevent them?"

**Perfect Answer:**
> "Deadlocks occur when two transactions wait for each other's locks. Example: Transaction A locks row 1 and wants row 2; Transaction B locks row 2 and wants row 1. PostgreSQL detects this after 1 second (deadlock_timeout) and aborts one transaction. To prevent, I use consistent lock ordering—always acquire locks in the same order, like ascending ID. Or lock all rows upfront with SELECT FOR UPDATE before any updates. If prevention isn't possible (user-driven actions), I implement retry logic—catch deadlock error (code 40P01) and retry the transaction with exponential backoff. Most deadlocks are preventable with careful design, but retry logic is a safety net for edge cases."

### Q2: "How would you debug a deadlock in production?"

**Perfect Answer:**
> "First, I check PostgreSQL logs for deadlock details—it logs both transactions involved, which queries, and which rows. The log shows the dependency graph: 'Process A waits for Process B, Process B waits for Process A.' From this, I identify which queries are conflicting. Then I check if lock order is inconsistent—maybe one query updates ORDER BY id ASC, another by DESC. I can also enable log_lock_waits to see queries waiting for locks before they deadlock. For prevention, I ensure all code paths lock resources in the same order. If user-driven deadlocks are inevitable, I add retry logic with exponential backoff."

---

# Exercise 6: Idempotency

## 📚 Theory

**Idempotency:** An operation can be applied multiple times without changing the result beyond the initial application.

**Why It Matters:** Network is unreliable. Webhooks can arrive twice. Users double-click.

---

## 🔨 Hands-On Exercise

### Task 1: Idempotent Webhook Processing

**Scenario:** Stripe sends webhook twice due to retry

```sql
-- Create idempotency table
CREATE TABLE webhook_events (
  id SERIAL PRIMARY KEY,
  event_id VARCHAR(255) NOT NULL UNIQUE, -- Stripe event ID
  processed_at TIMESTAMPTZ,
  response JSONB,
  status VARCHAR(20) DEFAULT 'processing'
);

-- Process webhook idempotently
INSERT INTO webhook_events (event_id, status)
VALUES ('evt_abc123', 'processing')
ON CONFLICT (event_id) DO NOTHING
RETURNING id;

-- If RETURNING id is empty, event already processed (duplicate)
-- If RETURNING id has value, proceed with processing

-- After processing
UPDATE webhook_events
SET status = 'completed', processed_at = NOW(), response = '{"success": true}'::jsonb
WHERE event_id = 'evt_abc123';
```

**Race Condition Test:**
```sql
-- Terminal 1
INSERT INTO webhook_events (event_id) VALUES ('evt_xyz789');
-- Succeeds, inserts row

-- Terminal 2 (simultaneous)
INSERT INTO webhook_events (event_id) VALUES ('evt_xyz789');
-- Fails with duplicate key error (unique constraint)
-- OR returns 0 rows if using ON CONFLICT DO NOTHING

-- Result: Only one processes, even if webhooks arrive simultaneously
```

---

### Task 2: Idempotent Payment Creation

**Scenario:** User double-clicks "Pay Now" button

```typescript
async function createPayment(userId: number, amount: number, idempotencyKey: string) {
  return await db.transaction(async (trx) => {
    // Try to insert idempotency key
    const result = await trx.raw(`
      INSERT INTO idempotency_keys (key, status)
      VALUES (?, 'processing')
      ON CONFLICT (key) DO NOTHING
      RETURNING id
    `, [idempotencyKey]);

    if (result.rows.length === 0) {
      // Duplicate request, return cached response
      const cached = await trx('idempotency_keys')
        .where({ key: idempotencyKey })
        .first();
      return JSON.parse(cached.response);
    }

    // First time, process payment
    const payment = await stripe.charges.create({ amount, currency: 'usd' });

    // Store response
    await trx('idempotency_keys')
      .where({ key: idempotencyKey })
      .update({
        status: 'completed',
        response: JSON.stringify(payment)
      });

    return payment;
  });
}

// Frontend generates idempotency key
const key = `payment-${userId}-${Date.now()}-${Math.random()}`;
await createPayment(userId, 9999, key);
```

---

## 🎤 Interview Questions

### Q1: "How do you handle duplicate webhooks?"

**Perfect Answer:**
> "I use the webhook event ID as an idempotency key with a UNIQUE constraint in the database. When a webhook arrives, I INSERT INTO webhook_events (event_id) VALUES (?) ON CONFLICT DO NOTHING RETURNING id. If the insert returns 0 rows, it's a duplicate—I return 200 OK immediately. If it succeeds, I process the webhook and update the status to 'completed.' The unique constraint ensures atomicity even if two webhooks arrive simultaneously—only one INSERT succeeds. The tradeoff is requiring a database roundtrip before processing, but that's necessary for correctness. I also set a TTL (24 hours) on idempotency keys to avoid unbounded growth."

### Q2: "What if processing fails midway?"

**Perfect Answer:**
> "If processing fails after inserting the idempotency key, the key remains in 'processing' state forever, blocking retries. To handle this, I add a timestamp and a cleanup job. If a key is in 'processing' state for > 5 minutes, I consider it stale and allow reprocessing. Or I delete the key on failure so retries can proceed. The tradeoff is: if cleanup is too aggressive, genuine slow processing might be reprocessed (not idempotent). If too conservative, failed webhooks block forever. I err on the side of reprocessing—it's better to process twice than not at all, especially with financial webhooks where missing events is unacceptable."

---

# Exercise 7: Query Optimization

## 📚 Theory

**Steps to Optimize:**
1. Run EXPLAIN ANALYZE
2. Identify bottleneck (Seq Scan, Sort, Join)
3. Create appropriate index
4. Re-run EXPLAIN ANALYZE to verify
5. Consider query rewriting if index doesn't help

---

## 🔨 Hands-On Exercise

### Task 1: Optimize Slow Dashboard Query

**Original Query (slow):**
```sql
SELECT 
  u.name,
  COUNT(o.id) as order_count,
  SUM(o.total_amount) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'paid'
WHERE u.role = 'user'
GROUP BY u.id, u.name
ORDER BY total_spent DESC
LIMIT 10;

-- EXPLAIN ANALYZE shows:
-- Sort (cost=52.35..52.60 rows=100 width=46) (actual time=5.234..5.456 rows=10 loops=1)
--   Sort Key: (sum(o.total_amount)) DESC
--   ->  HashAggregate (cost=45.00..48.00 rows=100 width=46) (actual time=4.123..4.567 rows=100 loops=1)
--         ->  Hash Left Join (cost=25.00..40.00 rows=500 width=38) (actual time=2.456..3.789 rows=500 loops=1)
--               ->  Seq Scan on users (cost=0.00..12.50 rows=100 width=14) (actual time=0.012..1.234 rows=100 loops=1)
--                     Filter: (role = 'user')
--               ->  Hash (cost=15.00..15.00 rows=500 width=24) (actual time=1.234..1.234 rows=500 loops=1)
--                     ->  Seq Scan on orders (cost=0.00..15.00 rows=500 width=24) (actual time=0.012..0.678 rows=500 loops=1)
--                           Filter: (status = 'paid')
```

**Problems:**
1. Seq Scan on users (no index on role)
2. Seq Scan on orders (no index on status)
3. Expensive sort (no index on total_spent)
4. Join requires hashing

**Optimization 1: Index on filters**
```sql
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_orders_status_user ON orders(status, user_id) WHERE status = 'paid';

-- Re-run EXPLAIN ANALYZE
-- Now using Index Scan on both tables
-- Time: 5.2s → 2.1s (2.5x faster)
```

**Optimization 2: Materialized View**
```sql
CREATE MATERIALIZED VIEW user_stats AS
SELECT 
  u.id,
  u.name,
  COUNT(o.id) as order_count,
  COALESCE(SUM(o.total_amount), 0) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'paid'
WHERE u.role = 'user'
GROUP BY u.id, u.name;

CREATE INDEX idx_user_stats_spent ON user_stats(total_spent DESC);

-- Query becomes:
SELECT * FROM user_stats ORDER BY total_spent DESC LIMIT 10;

-- Time: 2.1s → 0.015s (140x faster!)
```

**Tradeoff:**
- Materialized view is pre-computed (instant reads)
- But data is stale until refreshed
- Refresh: `REFRESH MATERIALIZED VIEW user_stats;` (blocks reads)
- Or: `REFRESH MATERIALIZED VIEW CONCURRENTLY user_stats;` (doesn't block, but requires UNIQUE index)

---

## 🎤 Interview Questions

### Q1: "Walk me through optimizing this slow query"

**Perfect Answer:**
> "First, I run EXPLAIN ANALYZE to see the execution plan. I look for Seq Scan on large tables—that's usually the bottleneck. I also check for expensive sorts and joins. Based on the query, I create indexes on filtered columns (WHERE clauses) and joined columns (JOIN ON). After creating indexes, I re-run EXPLAIN ANALYZE to verify they're being used—sometimes PostgreSQL's query planner chooses not to use an index if the table is small or the query is not selective enough. If indexes don't help, I consider query rewriting or materialized views for pre-computation. The key is: don't guess, measure with EXPLAIN ANALYZE before and after every change."

---

**This is just the beginning!** I'll create the complete TypeScript implementations for all 15 exercises. Would you like me to continue with the remaining exercises or focus on specific topics first?

---

## 📁 Files Created

1. `backend/src/database/exercises/README.md` - Exercise overview
2. `POSTGRESQL_INTERVIEW_EXERCISES.md` - Comprehensive guide (Exercises 1-7)

**Next:** Create runnable TypeScript files for each exercise + remaining exercises (8-15).

Let me know which exercises you want to dive deeper into! 🚀


---

# Exercise 8: MVCC (Multi-Version Concurrency Control)

## 📚 Theory

**What is MVCC?**
MVCC allows multiple transactions to access the same data concurrently without blocking each other. PostgreSQL achieves this by maintaining multiple versions of each row.

**How It Works:**
- Each transaction sees a snapshot of the database at a specific point in time
- When a row is updated, PostgreSQL creates a new version (doesn't overwrite)
- Old versions remain until no transaction needs them (then VACUUM cleans up)
- Each row has hidden columns: `xmin` (transaction that created it), `xmax` (transaction that deleted it)

**Benefits:**
- Readers don't block writers
- Writers don't block readers
- High concurrency

**Costs:**
- Extra disk space (multiple versions)
- VACUUM overhead (cleanup)
- XID wraparound risk (if VACUUM doesn't run)

---

## 🔨 Hands-On Exercise

### Task 1: Observe Row Versions

```sql
-- Enable showing hidden columns
SELECT xmin, xmax, * FROM products WHERE id = 1;

-- Example output:
-- xmin  | xmax | id | name   | price
-- 1234  | 0    | 1  | Laptop | 1299.99

-- xmin = transaction that created this version
-- xmax = 0 means row is not deleted
```

**Update the row:**
```sql
BEGIN;
UPDATE products SET price = 1399.99 WHERE id = 1;
SELECT xmin, xmax, * FROM products WHERE id = 1;
-- xmin  | xmax | id | name   | price
-- 5678  | 0    | 1  | Laptop | 1399.99
-- (new xmin, old version still exists with xmax = 5678)
COMMIT;
```

---

### Task 2: Concurrent Reads Don't Block Writes

**Terminal 1 (Long-running read):**
```sql
BEGIN;
SELECT * FROM products WHERE id = 1;
-- Reads current version

-- Simulate long computation
SELECT pg_sleep(30);

-- Read again
SELECT * FROM products WHERE id = 1;
-- Still sees OLD version (snapshot isolation)

COMMIT;
```

**Terminal 2 (Writer, while Terminal 1 is sleeping):**
```sql
UPDATE products SET price = 1499.99 WHERE id = 1;
-- Succeeds immediately! Doesn't wait for Terminal 1's read.
-- Creates new version.
```

**Result:** Reader sees price = 1299.99 (old version), writer creates price = 1499.99 (new version). No blocking!

---

### Task 3: Observe Dead Tuples (Old Versions)

```sql
-- Check table bloat
SELECT 
  schemaname,
  tablename,
  n_live_tup AS live_rows,
  n_dead_tup AS dead_rows,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE tablename = 'products';

-- Example output:
-- live_rows | dead_rows | last_vacuum | last_autovacuum
-- 35        | 120       | null        | 2024-01-15 10:30:00

-- Dead rows are old versions waiting for cleanup
```

**Trigger VACUUM:**
```sql
VACUUM VERBOSE products;

-- Output shows cleanup:
-- INFO: vacuuming "public.products"
-- INFO: "products": removed 120 row versions in 5 pages
-- INFO: "products": found 120 removable, 35 nonremovable row versions
```

**Check again:**
```sql
SELECT n_dead_tup FROM pg_stat_user_tables WHERE tablename = 'products';
-- dead_rows = 0 (cleaned up!)
```

---

### Task 4: Understand XID Wraparound

```sql
-- Check transaction age
SELECT 
  datname,
  age(datfrozenxid) AS xid_age,
  (2^31 - 1000000 - age(datfrozenxid)) AS xids_until_wraparound
FROM pg_database
WHERE datname = current_database();

-- Example output:
-- xid_age   | xids_until_wraparound
-- 1234567   | 2145849076

-- If xids_until_wraparound < 10 million, PostgreSQL starts warning
-- If < 1 million, PostgreSQL shuts down to prevent data loss!
```

**Prevention:** Run VACUUM regularly (autovacuum does this automatically)

---

## 🎤 Interview Questions

### Q1: "How does PostgreSQL implement MVCC?"

**Perfect Answer:**
> "PostgreSQL implements MVCC by storing multiple versions of each row. When a transaction starts, it gets a snapshot—a point-in-time view of the database. Each row has hidden columns xmin (transaction that created it) and xmax (transaction that deleted it). When reading a row, PostgreSQL checks if the row's xmin/xmax is visible to the transaction's snapshot. If another transaction updates a row, it creates a new version with a new xmin—the old version remains until no transaction needs it. This allows readers and writers to not block each other. The cost is disk space for multiple versions and VACUUM overhead to clean up dead tuples. It's the reason PostgreSQL has high concurrency but requires VACUUM."

### Q2: "What is VACUUM and why is it necessary?"

**Perfect Answer:**
> "VACUUM cleans up dead tuples—old row versions that no transaction can see anymore. When rows are updated or deleted, PostgreSQL doesn't immediately reclaim space; old versions remain for MVCC. Without VACUUM, tables bloat—taking more disk space and slowing queries (more pages to scan). VACUUM also updates statistics for the query planner and prevents XID wraparound—PostgreSQL has a 32-bit transaction ID that wraps around at 2 billion. If VACUUM doesn't 'freeze' old transactions, wraparound causes data loss. Autovacuum runs automatically, but for high-write tables, manual VACUUM or tuning autovacuum_vacuum_scale_factor is needed. I monitor pg_stat_user_tables.n_dead_tup to catch bloat early."

### Q3: "Why don't readers block writers in PostgreSQL?"

**Perfect Answer:**
> "Because of MVCC. When a reader starts a transaction, it gets a snapshot. When a writer updates a row, it creates a new version—it doesn't overwrite the old version. The reader continues reading the old version (it's still on disk), while the writer works on the new version. They're reading and writing different physical rows. Once the reader's transaction ends, the old version can be cleaned up by VACUUM. This is different from MySQL's InnoDB default behavior where readers can block writers in certain isolation levels, or from lock-based systems where readers hold shared locks."

---

# Exercise 9: Locks Deep Dive

## 📚 Theory

### Lock Types

| Lock Mode | Conflicts With | Use Case |
|-----------|---------------|----------|
| **ACCESS SHARE** | ACCESS EXCLUSIVE | `SELECT` (reading) |
| **ROW SHARE** | EXCLUSIVE, ACCESS EXCLUSIVE | `SELECT FOR UPDATE` |
| **ROW EXCLUSIVE** | SHARE, EXCLUSIVE, ACCESS EXCLUSIVE | `INSERT`, `UPDATE`, `DELETE` |
| **SHARE** | ROW EXCLUSIVE, SHARE ROW EXCLUSIVE, EXCLUSIVE, ACCESS EXCLUSIVE | `CREATE INDEX` (without CONCURRENTLY) |
| **ACCESS EXCLUSIVE** | ALL | `DROP TABLE`, `TRUNCATE`, `VACUUM FULL`, `ALTER TABLE` |

**Row-Level Locks:**
- `SELECT FOR UPDATE` - Exclusive row lock (blocks all writes)
- `SELECT FOR SHARE` - Shared row lock (blocks updates but allows other FOR SHARE)
- `SELECT FOR NO KEY UPDATE` - Allows concurrent foreign key checks
- `SELECT FOR KEY SHARE` - Weakest lock, allows updates to non-key columns

---

## 🔨 Hands-On Exercise

### Task 1: SELECT FOR UPDATE (Exclusive Row Lock)

**Terminal 1:**
```sql
BEGIN;
SELECT * FROM products WHERE id = 1 FOR UPDATE;
-- Locks row 1 exclusively

-- Simulate processing
SELECT pg_sleep(10);

COMMIT;
```

**Terminal 2 (simultaneous):**
```sql
-- Try to read without lock
SELECT * FROM products WHERE id = 1;
-- Succeeds immediately! Reads don't require locks (MVCC)

-- Try to read with lock
SELECT * FROM products WHERE id = 1 FOR UPDATE;
-- WAITS for Terminal 1 to commit (blocked by exclusive lock)

-- Try to update
UPDATE products SET price = 999 WHERE id = 1;
-- WAITS for Terminal 1 to commit (blocked by exclusive lock)
```

**When to Use:**
- Prevent race conditions (e.g., checkout preventing overselling)
- Ensure row doesn't change during multi-step process

---

### Task 2: SELECT FOR UPDATE NOWAIT

**Scenario:** Don't wait for lock, fail immediately

```sql
BEGIN;

SELECT * FROM products WHERE id = 1 FOR UPDATE NOWAIT;
-- If row is locked, ERROR immediately:
-- ERROR: could not obtain lock on row in relation "products"

-- Handle in application:
-- "Product is currently being updated, please try again"
```

**When to Use:**
- UI interactions (don't make user wait)
- API requests (fail fast, retry later)

---

### Task 3: SELECT FOR UPDATE SKIP LOCKED

**Scenario:** Job queue - multiple workers process jobs

```sql
-- Worker 1
BEGIN;
SELECT * FROM jobs 
WHERE status = 'pending' 
ORDER BY created_at 
LIMIT 1 
FOR UPDATE SKIP LOCKED;
-- Gets job 1, locks it

UPDATE jobs SET status = 'processing' WHERE id = 1;
-- Process job...
UPDATE jobs SET status = 'completed' WHERE id = 1;
COMMIT;
```

```sql
-- Worker 2 (simultaneous)
BEGIN;
SELECT * FROM jobs 
WHERE status = 'pending' 
ORDER BY created_at 
LIMIT 1 
FOR UPDATE SKIP LOCKED;
-- Skips job 1 (locked by Worker 1), gets job 2!

UPDATE jobs SET status = 'processing' WHERE id = 2;
COMMIT;
```

**Result:** Multiple workers process different jobs concurrently without blocking!

**When to Use:**
- Job queues (worker pools)
- Task distribution (multiple servers)
- Inventory allocation (multiple checkouts)

---

### Task 4: Table-Level Locks (ACCESS EXCLUSIVE)

```sql
-- Terminal 1
BEGIN;
TRUNCATE products;
-- Acquires ACCESS EXCLUSIVE lock (blocks everything)
```

```sql
-- Terminal 2
SELECT * FROM products;
-- WAITS (even reads are blocked!)
```

**Other operations that acquire ACCESS EXCLUSIVE:**
- `DROP TABLE`
- `VACUUM FULL`
- `ALTER TABLE` (most variants)
- `REFRESH MATERIALIZED VIEW` (without CONCURRENTLY)

**Impact:** Blocks all access to table (dangerous in production!)

---

### Task 5: Monitoring Locks

```sql
-- See all locks
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

-- Example output:
-- table_name | mode           | granted | pid   | query
-- products   | RowExclusiveLock | true  | 12345 | UPDATE products SET...
-- orders     | AccessShareLock  | true  | 12346 | SELECT * FROM orders

-- See blocked queries
SELECT 
  blocked.pid AS blocked_pid,
  blocked.query AS blocked_query,
  blocking.pid AS blocking_pid,
  blocking.query AS blocking_query
FROM pg_stat_activity AS blocked
JOIN pg_locks AS blocked_locks ON blocked.pid = blocked_locks.pid
JOIN pg_locks AS blocking_locks ON blocked_locks.locktype = blocking_locks.locktype
  AND blocked_locks.relation = blocking_locks.relation
  AND blocked_locks.pid != blocking_locks.pid
  AND NOT blocking_locks.granted
JOIN pg_stat_activity AS blocking ON blocking.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

---

## 🎤 Interview Questions

### Q1: "Explain SELECT FOR UPDATE and when to use it"

**Perfect Answer:**
> "SELECT FOR UPDATE acquires an exclusive row-level lock. It prevents other transactions from updating or locking the same row until the lock is released. I use it to prevent race conditions—for example, during checkout, I SELECT stock FOR UPDATE, check if stock > 0, then decrement. The lock ensures another concurrent checkout can't also decrement the same row simultaneously. The tradeoff is lock contention—if many transactions target the same row, they queue up. For high-traffic scenarios, I consider optimistic locking with version numbers or eventual consistency patterns. SELECT FOR UPDATE is best for low-to-medium concurrency where strong consistency is required."

### Q2: "What's the difference between FOR UPDATE and FOR SHARE?"

**Perfect Answer:**
> "FOR UPDATE acquires an exclusive lock—blocks all other locks (other FOR UPDATE, FOR SHARE, and updates). FOR SHARE acquires a shared lock—allows other FOR SHARE but blocks updates and FOR UPDATE. Example: Multiple readers need to ensure a row doesn't change, but don't need exclusive access—they can all hold FOR SHARE simultaneously. But if any of them tries to update, it must wait for all FOR SHARE locks to release, then upgrade to exclusive lock. This can cause deadlocks—if two transactions hold FOR SHARE and both try to upgrade, neither can proceed. I prefer FOR UPDATE for simplicity unless I genuinely need shared reads."

### Q3: "Explain SKIP LOCKED and give a use case"

**Perfect Answer:**
> "SKIP LOCKED tells PostgreSQL to skip rows that are already locked instead of waiting. It's perfect for job queues with multiple workers. Each worker runs SELECT * FROM jobs WHERE status = 'pending' FOR UPDATE SKIP LOCKED LIMIT 1. If Worker A locks job 1, Worker B's query skips it and locks job 2 instead—no waiting. This enables high-concurrency job processing without blocking. The tradeoff is non-deterministic ordering—jobs aren't processed strictly FIFO if some are locked. But for most use cases (background jobs, task queues), that's acceptable. It's much better than workers blocking each other."

---

# Exercise 10: Advanced Concurrency Patterns

## 📚 Theory

### Common Concurrency Issues

1. **Lost Update:** Two transactions read the same value, both modify it, last write wins (first update is lost)
2. **Phantom Read:** Transaction reads rows matching a condition, another inserts matching rows, first transaction re-reads and sees new rows
3. **Write Skew:** Two transactions read overlapping data, make decisions based on what they read, both write—resulting in invalid state

---

## 🔨 Hands-On Exercise

### Task 1: Lost Update Problem

**Scenario:** Two users increment a counter simultaneously

**Terminal 1:**
```sql
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
SELECT views FROM posts WHERE id = 1; -- views = 100
-- Simulate processing
SELECT pg_sleep(5);
UPDATE posts SET views = 100 + 1 WHERE id = 1; -- views = 101
COMMIT;
```

**Terminal 2 (simultaneous):**
```sql
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
SELECT views FROM posts WHERE id = 1; -- views = 100
-- Simulate processing
UPDATE posts SET views = 100 + 1 WHERE id = 1; -- WAITS for Terminal 1
-- After Terminal 1 commits, this proceeds
-- views = 101 (not 102! Lost update!)
COMMIT;
```

**Problem:** Both read views = 100, both set views = 101. One increment is lost.

**Solution 1: Use Atomic UPDATE**
```sql
-- Don't read then write, do it atomically
UPDATE posts SET views = views + 1 WHERE id = 1;
-- PostgreSQL handles concurrency correctly
```

**Solution 2: Use SELECT FOR UPDATE**
```sql
BEGIN;
SELECT views FROM posts WHERE id = 1 FOR UPDATE; -- Locks row
-- Second transaction waits here
UPDATE posts SET views = views + 1 WHERE id = 1;
COMMIT;
```

**Solution 3: Use REPEATABLE READ or SERIALIZABLE**
```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT views FROM posts WHERE id = 1; -- views = 100
UPDATE posts SET views = 100 + 1 WHERE id = 1;
COMMIT;
-- Second transaction gets serialization error, must retry
```

---

### Task 2: Phantom Read Problem

**Scenario:** Calculate total inventory, another transaction inserts new items

**Terminal 1:**
```sql
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;

SELECT SUM(stock) FROM products WHERE category = 'electronics';
-- Result: 500

-- Wait here...

SELECT SUM(stock) FROM products WHERE category = 'electronics';
-- Result: 550 (different within same transaction!)

COMMIT;
```

**Terminal 2 (while Terminal 1 is waiting):**
```sql
INSERT INTO products (name, category, stock) VALUES ('New Item', 'electronics', 50);
COMMIT;
```

**Problem:** Terminal 1 sees different results within same transaction (phantom read).

**Solution: Use REPEATABLE READ**
```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;

SELECT SUM(stock) FROM products WHERE category = 'electronics';
-- Result: 500

-- Terminal 2 inserts new row

SELECT SUM(stock) FROM products WHERE category = 'electronics';
-- Result: 500 (same! Consistent snapshot)

COMMIT;
```

---

### Task 3: Write Skew Problem

**Scenario:** Hospital requires at least 1 doctor on-call. Two doctors try to go off-call simultaneously.

```sql
-- Initial state: Doctor A and Doctor B both on-call

-- Terminal 1 (Doctor A requests off)
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;

SELECT COUNT(*) FROM doctors WHERE on_call = true;
-- Result: 2 (Doctor A and Doctor B)

-- Check passes, proceed to go off-call
UPDATE doctors SET on_call = false WHERE id = 1; -- Doctor A

-- Wait here...
```

```sql
-- Terminal 2 (Doctor B requests off, simultaneously)
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;

SELECT COUNT(*) FROM doctors WHERE on_call = true;
-- Result: 2 (both still on-call in this snapshot)

-- Check passes, proceed to go off-call
UPDATE doctors SET on_call = false WHERE id = 2; -- Doctor B

COMMIT; -- Succeeds
```

```sql
-- Terminal 1 (continue)
COMMIT; -- Succeeds

-- Final state: 0 doctors on-call! Constraint violated!
```

**Problem:** Both transactions read the same state (2 doctors), both made decisions based on that read, both wrote—resulting in invalid state. REPEATABLE READ doesn't prevent this!

**Solution: Use SERIALIZABLE**
```sql
-- Terminal 1
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT COUNT(*) FROM doctors WHERE on_call = true;
UPDATE doctors SET on_call = false WHERE id = 1;
COMMIT; -- Succeeds

-- Terminal 2
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SELECT COUNT(*) FROM doctors WHERE on_call = true;
UPDATE doctors SET on_call = false WHERE id = 2;
COMMIT; -- ERROR: could not serialize access due to read/write dependencies
-- Must retry!
```

**Alternative Solution: Use CHECK Constraint**
```sql
-- Add constraint at database level
ALTER TABLE doctors ADD CONSTRAINT at_least_one_on_call 
CHECK ((SELECT COUNT(*) FROM doctors WHERE on_call = true) >= 1);

-- Now both transactions fail constraint check
-- But this is expensive (subquery runs on every update)
```

**Best Solution: Use Explicit Lock**
```sql
-- Create a sentinel row
CREATE TABLE on_call_lock (id INT PRIMARY KEY DEFAULT 1, dummy INT);
INSERT INTO on_call_lock VALUES (1, 0);

-- Terminal 1
BEGIN;
SELECT * FROM on_call_lock FOR UPDATE; -- Locks sentinel row
SELECT COUNT(*) FROM doctors WHERE on_call = true; -- 2
UPDATE doctors SET on_call = false WHERE id = 1;
COMMIT;

-- Terminal 2
BEGIN;
SELECT * FROM on_call_lock FOR UPDATE; -- WAITS for Terminal 1
-- After Terminal 1 commits:
SELECT COUNT(*) FROM doctors WHERE on_call = true; -- 1
-- Check fails, don't allow going off-call
ROLLBACK;
```

---

## 🎤 Interview Questions

### Q1: "Explain lost update problem and how to prevent it"

**Perfect Answer:**
> "Lost update occurs when two transactions read the same value, modify it independently, and both write back—the last write overwrites the first. Example: Two users increment a view counter. Both read views = 100, both compute 101, both write 101—one increment is lost. To prevent, I use atomic operations: UPDATE posts SET views = views + 1 instead of read-then-write. PostgreSQL guarantees atomicity for UPDATE. If I must read first, I use SELECT FOR UPDATE to lock the row or SERIALIZABLE isolation to detect conflicts. The key is: avoid read-modify-write patterns where possible; let the database handle concurrency."

### Q2: "What is write skew and how does SERIALIZABLE prevent it?"

**Perfect Answer:**
> "Write skew is when two transactions read overlapping data, make decisions based on what they read, and both write—resulting in an invalid state. Example: Two doctors try to go off-call simultaneously. Both check 'are there at least 2 doctors on-call?', both see yes, both proceed—final state has 0 doctors on-call. REPEATABLE READ doesn't prevent this because both transactions write to different rows. SERIALIZABLE detects this by tracking read/write dependencies. If PostgreSQL sees that Transaction A read data that Transaction B modified (or vice versa), it aborts one transaction with a serialization error. The tradeoff is higher abort rate and slower performance. I use SERIALIZABLE for critical invariants like financial constraints or inventory limits."

### Q3: "When would you choose optimistic locking over SELECT FOR UPDATE?"

**Perfect Answer:**
> "I use optimistic locking when conflicts are rare and lock contention would hurt performance. With optimistic locking, I add a version column. On update, I check WHERE version = current_version and increment the version. If the WHERE matches 0 rows, someone else updated first—I retry. This avoids locks entirely, enabling higher concurrency. The tradeoff is: if conflicts are common (high contention), many retries waste resources. SELECT FOR UPDATE is better for high-contention scenarios—it queues transactions instead of aborting them. As a rule: optimistic for low-contention (e.g., user profile updates), pessimistic for high-contention (e.g., limited inventory)."

---

# Exercise 11: Constraints Deep Dive

## 📚 Theory

### Constraint Types

| Constraint | Purpose | Example |
|------------|---------|---------|
| **PRIMARY KEY** | Uniquely identify rows | `id SERIAL PRIMARY KEY` |
| **FOREIGN KEY** | Referential integrity | `user_id INTEGER REFERENCES users(id)` |
| **UNIQUE** | No duplicate values | `email VARCHAR(255) UNIQUE` |
| **CHECK** | Custom validation | `CHECK (price > 0)` |
| **NOT NULL** | Require value | `name VARCHAR(255) NOT NULL` |
| **EXCLUDE** | No overlapping ranges | `EXCLUDE USING gist (room_id WITH =, time_range WITH &&)` |

---

## 🔨 Hands-On Exercise

### Task 1: PRIMARY KEY (Uniqueness + Not Null)

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY, -- Equivalent to: UNIQUE NOT NULL + auto-increment
  email VARCHAR(255)
);

-- Try to insert duplicate ID
INSERT INTO users (id, email) VALUES (1, 'alice@example.com');
INSERT INTO users (id, email) VALUES (1, 'bob@example.com');
-- ERROR: duplicate key value violates unique constraint "users_pkey"

-- Try to insert NULL ID
INSERT INTO users (id, email) VALUES (NULL, 'charlie@example.com');
-- ERROR: null value in column "id" violates not-null constraint
```

**Composite Primary Key:**
```sql
CREATE TABLE order_items (
  order_id INTEGER,
  product_id INTEGER,
  quantity INTEGER,
  PRIMARY KEY (order_id, product_id) -- Combination must be unique
);

-- Same order can have different products
INSERT INTO order_items VALUES (1, 100, 2); -- ✅
INSERT INTO order_items VALUES (1, 200, 1); -- ✅

-- But can't have duplicate (order_id, product_id)
INSERT INTO order_items VALUES (1, 100, 5); -- ❌ Duplicate
```

---

### Task 2: FOREIGN KEY (Referential Integrity)

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) -- Foreign key
);

-- Try to insert order for non-existent user
INSERT INTO orders (user_id) VALUES (999);
-- ERROR: insert or update on table "orders" violates foreign key constraint
-- DETAIL: Key (user_id)=(999) is not present in table "users"
```

**ON DELETE Actions:**
```sql
-- CASCADE: Delete orders when user is deleted
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
);

-- SET NULL: Set user_id to NULL when user is deleted
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- RESTRICT: Prevent deleting user if they have orders (default)
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT
);

DELETE FROM users WHERE id = 1;
-- ERROR: update or update on table "users" violates foreign key constraint
-- DETAIL: Key (id)=(1) is still referenced from table "orders"
```

---

### Task 3: UNIQUE (No Duplicates)

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  username VARCHAR(255) UNIQUE
);

INSERT INTO users (email, username) VALUES ('alice@example.com', 'alice');
INSERT INTO users (email, username) VALUES ('alice@example.com', 'alice2');
-- ERROR: duplicate key value violates unique constraint "users_email_key"
```

**Partial UNIQUE (Conditional):**
```sql
-- Only enforce unique for active users
CREATE UNIQUE INDEX users_email_unique_active ON users(email) WHERE is_active = true;

-- Can have duplicate emails if inactive
INSERT INTO users (email, is_active) VALUES ('alice@example.com', false); -- ✅
INSERT INTO users (email, is_active) VALUES ('alice@example.com', false); -- ✅

-- But active emails must be unique
INSERT INTO users (email, is_active) VALUES ('bob@example.com', true); -- ✅
INSERT INTO users (email, is_active) VALUES ('bob@example.com', true); -- ❌ Duplicate
```

---

### Task 4: CHECK (Custom Validation)

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  price DECIMAL(10, 2) CHECK (price > 0), -- Price must be positive
  discount_percent INTEGER CHECK (discount_percent >= 0 AND discount_percent <= 100),
  stock INTEGER CHECK (stock >= 0)
);

-- Try to insert negative price
INSERT INTO products (name, price) VALUES ('Laptop', -100);
-- ERROR: new row for relation "products" violates check constraint "products_price_check"

-- Try to insert invalid discount
INSERT INTO products (name, price, discount_percent) VALUES ('Mouse', 29.99, 150);
-- ERROR: new row violates check constraint "products_discount_percent_check"
```

**Multi-Column CHECK:**
```sql
CREATE TABLE promotions (
  id SERIAL PRIMARY KEY,
  start_date DATE,
  end_date DATE,
  CHECK (end_date > start_date) -- End must be after start
);

INSERT INTO promotions (start_date, end_date) VALUES ('2024-01-15', '2024-01-10');
-- ERROR: new row violates check constraint "promotions_check"
```

---

### Task 5: EXCLUDE (No Overlapping Ranges)

**Scenario:** Meeting room bookings - prevent double-booking

```sql
-- Install extension for range types
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE room_bookings (
  id SERIAL PRIMARY KEY,
  room_id INTEGER,
  time_range tstzrange, -- Time range (start, end)
  EXCLUDE USING gist (
    room_id WITH =,           -- Same room
    time_range WITH &&        -- Overlapping time
  )
);

-- Book room 1 from 9am to 10am
INSERT INTO room_bookings (room_id, time_range) 
VALUES (1, '[2024-01-15 09:00, 2024-01-15 10:00)');

-- Try to book room 1 from 9:30am to 11am (overlaps!)
INSERT INTO room_bookings (room_id, time_range)
VALUES (1, '[2024-01-15 09:30, 2024-01-15 11:00)');
-- ERROR: conflicting key value violates exclusion constraint "room_bookings_room_id_time_range_excl"

-- Book room 1 from 10am to 11am (no overlap)
INSERT INTO room_bookings (room_id, time_range)
VALUES (1, '[2024-01-15 10:00, 2024-01-15 11:00)');
-- ✅ Success!

-- Book room 2 from 9:30am to 11am (different room)
INSERT INTO room_bookings (room_id, time_range)
VALUES (2, '[2024-01-15 09:30, 2024-01-15 11:00)');
-- ✅ Success!
```

---

### Task 6: DEFERRABLE Constraints

**Scenario:** Swap two users' emails (temporarily violates UNIQUE)

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE DEFERRABLE INITIALLY DEFERRED
);

INSERT INTO users (id, email) VALUES (1, 'alice@example.com');
INSERT INTO users (id, email) VALUES (2, 'bob@example.com');

-- Swap emails within transaction
BEGIN;

UPDATE users SET email = 'bob@example.com' WHERE id = 1;
-- Temporarily violates UNIQUE (both users have bob@example.com)
-- But constraint is DEFERRED, so no error yet

UPDATE users SET email = 'alice@example.com' WHERE id = 2;
-- Now valid again

COMMIT; -- Constraint checked here, succeeds!
```

---

## 🎤 Interview Questions

### Q1: "Explain the difference between PRIMARY KEY and UNIQUE"

**Perfect Answer:**
> "PRIMARY KEY is UNIQUE + NOT NULL combined. A table can have only one PRIMARY KEY but multiple UNIQUE constraints. PRIMARY KEY is semantically significant—it's the canonical identifier for the row. Indexes on PRIMARY KEY are typically clustered (data physically sorted by key) for faster lookups. UNIQUE is for other columns that must be unique but aren't the primary identifier. Example: users table has PRIMARY KEY on id (auto-increment), but also UNIQUE on email (business constraint). I always use PRIMARY KEY for the main identifier and UNIQUE for alternate keys."

### Q2: "What's ON DELETE CASCADE and when is it dangerous?"

**Perfect Answer:**
> "ON DELETE CASCADE automatically deletes related rows when the parent is deleted. For example, if orders has a foreign key to users with ON DELETE CASCADE, deleting a user deletes all their orders. It's convenient but dangerous—accidental deletion of a user wipes all their data. I use it only for true ownership relationships where the child cannot exist without the parent, like order_items depending on orders. For most cases, I prefer ON DELETE RESTRICT (prevent deletion if children exist) or ON DELETE SET NULL (keep children, nullify reference). In production, I soft-delete instead of hard-delete to avoid data loss."

### Q3: "Explain EXCLUDE constraints with a use case"

**Perfect Answer:**
> "EXCLUDE constraints prevent overlapping values. The classic example is meeting room bookings—we want to prevent double-booking. EXCLUDE USING gist (room_id WITH =, time_range WITH &&) means: reject inserts if there's an existing row with the same room_id AND overlapping time_range. The && operator checks range overlap. This is impossible with UNIQUE or CHECK constraints because we're comparing ranges, not equality. EXCLUDE requires the btree_gist extension. It's perfect for reservation systems, scheduling, resource allocation—any domain where overlapping ranges are invalid. The tradeoff is performance—GiST indexes are slower than B-tree."

---

# Exercise 12: Advanced Query Optimization

## 📚 Theory

### Query Optimization Techniques

1. **Index selection:** Choose right index type (B-tree, GIN, partial, composite)
2. **Query rewriting:** Simplify complex queries (avoid subqueries, use CTEs)
3. **Join order:** PostgreSQL's planner chooses, but you can hint with join type
4. **Statistics:** Ensure tables are ANALYZEd for accurate estimates
5. **Materialized views:** Pre-compute expensive aggregations
6. **Partitioning:** Divide large tables for query pruning

---

## 🔨 Hands-On Exercise

### Task 1: Understanding Query Plans (EXPLAIN ANALYZE)

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 5;

-- Output breakdown:
-- 1. Seq Scan on orders (cost=0.00..25.88 rows=4 width=112) (actual time=0.015..0.098 rows=2 loops=1)
--    ^^^^^^^^^^^^^^^^         ^^^^ Estimated  ^^^^^ Actual
--    Operation                cost               results
```

**Key Metrics:**
- **cost=0.00..25.88** - Estimated cost (arbitrary units)
- **rows=4** - Estimated rows returned
- **actual time=0.015..0.098** - Actual time (ms)
- **rows=2** - Actual rows returned
- **loops=1** - How many times this node executed

**Red Flags:**
- ❌ Seq Scan on large table (missing index)
- ❌ Estimated rows << Actual rows (stale statistics, need ANALYZE)
- ❌ Expensive sorts (add index on ORDER BY column)
- ❌ Nested Loop with large tables (suggest Hash Join or Merge Join)

---

### Task 2: Fix Missing Index

**Slow Query:**
```sql
EXPLAIN ANALYZE 
SELECT * FROM orders WHERE user_id = 5 AND status = 'paid';

-- Seq Scan on orders (cost=0.00..35.00 rows=2 width=112) (actual time=5.234..5.456 rows=2 loops=1)
--   Filter: ((user_id = 5) AND (status = 'paid'))
--   Rows Removed by Filter: 148
-- Execution Time: 5.478 ms
```

**Problem:** Scans 150 rows, filters to 2 (99% waste)

**Solution: Add Composite Index**
```sql
CREATE INDEX idx_orders_user_status ON orders(user_id, status);

EXPLAIN ANALYZE 
SELECT * FROM orders WHERE user_id = 5 AND status = 'paid';

-- Index Scan using idx_orders_user_status (cost=0.14..8.16 rows=2 width=112) (actual time=0.017..0.019 rows=2 loops=1)
--   Index Cond: ((user_id = 5) AND (status = 'paid'))
-- Execution Time: 0.045 ms
```

**Result:** 5.478ms → 0.045ms (122x faster!)

---

### Task 3: Optimize JOIN Order

**Slow Query:**
```sql
EXPLAIN ANALYZE
SELECT u.name, o.total_amount
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.role = 'admin' AND o.status = 'paid';

-- Hash Join (cost=50.00..150.00 rows=10 width=46) (actual time=25.123..45.678 rows=3 loops=1)
--   ->  Seq Scan on users (cost=0.00..25.00 rows=5 width=38) (actual time=10.123..15.234 rows=2 loops=1)
--         Filter: (role = 'admin')
--         Rows Removed: 98
--   ->  Hash (cost=15.00..15.00 rows=500 width=16) (actual time=12.345..12.345 rows=150 loops=1)
--         ->  Seq Scan on orders (cost=0.00..15.00 rows=500 width=16) (actual time=0.012..6.789 rows=150 loops=1)
-- Execution Time: 45.789 ms
```

**Problem:**
1. Scans ALL orders (150 rows), then joins with filtered users (2 rows)
2. Most joined rows are discarded (not status='paid')

**Solution: Add Indexes + Statistics**
```sql
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_orders_status_user ON orders(status, user_id);
ANALYZE users;
ANALYZE orders;

EXPLAIN ANALYZE
SELECT u.name, o.total_amount
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.role = 'admin' AND o.status = 'paid';

-- Nested Loop (cost=0.28..16.45 rows=3 width=46) (actual time=0.023..0.156 rows=3 loops=1)
--   ->  Index Scan using idx_users_role on users (cost=0.14..8.16 rows=2 width=38) (actual time=0.012..0.023 rows=2 loops=1)
--         Index Cond: (role = 'admin')
--   ->  Index Scan using idx_orders_status_user on orders (cost=0.14..4.12 rows=1 width=16) (actual time=0.034..0.056 rows=1 loops=2)
--         Index Cond: ((status = 'paid') AND (user_id = u.id))
-- Execution Time: 0.234 ms
```

**Result:** 45.789ms → 0.234ms (195x faster!)

**Why Nested Loop is Better Here:**
- Filter reduces users to 2 rows (small outer table)
- For each user, index lookup finds their paid orders
- Nested Loop is efficient for small outer table + indexed inner table

---

### Task 4: Use CTEs for Readability (and Optimization Fences)

**Complex Query:**
```sql
-- Hard to read, planner might make poor choices
SELECT u.name, COUNT(*) 
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE o.created_at > NOW() - INTERVAL '30 days'
  AND u.id IN (SELECT user_id FROM orders WHERE status = 'paid' GROUP BY user_id HAVING COUNT(*) > 5)
GROUP BY u.name;
```

**With CTE:**
```sql
WITH active_buyers AS (
  SELECT user_id
  FROM orders
  WHERE status = 'paid'
  GROUP BY user_id
  HAVING COUNT(*) > 5
),
recent_orders AS (
  SELECT user_id, COUNT(*) AS order_count
  FROM orders
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY user_id
)
SELECT u.name, ro.order_count
FROM users u
JOIN active_buyers ab ON u.id = ab.user_id
JOIN recent_orders ro ON u.id = ro.user_id;
```

**Benefits:**
- More readable (named intermediate results)
- Can EXPLAIN each CTE separately
- Optimization fence (PostgreSQL 12+: use MATERIALIZED to force evaluation)

---

### Task 5: Materialized Views for Expensive Aggregations

**Slow Dashboard Query:**
```sql
SELECT 
  DATE_TRUNC('day', o.created_at) AS date,
  COUNT(*) AS order_count,
  SUM(o.total_amount) AS revenue,
  COUNT(DISTINCT o.user_id) AS unique_customers
FROM orders o
WHERE o.status = 'paid'
GROUP BY DATE_TRUNC('day', o.created_at)
ORDER BY date DESC
LIMIT 30;
-- Execution Time: 2.5 seconds (scans millions of orders)
```

**Materialized View:**
```sql
CREATE MATERIALIZED VIEW daily_revenue AS
SELECT 
  DATE_TRUNC('day', created_at) AS date,
  COUNT(*) AS order_count,
  SUM(total_amount) AS revenue,
  COUNT(DISTINCT user_id) AS unique_customers
FROM orders
WHERE status = 'paid'
GROUP BY DATE_TRUNC('day', created_at);

CREATE INDEX idx_daily_revenue_date ON daily_revenue(date);

-- Query materialized view
SELECT * FROM daily_revenue ORDER BY date DESC LIMIT 30;
-- Execution Time: 0.015 seconds (160x faster!)

-- Refresh daily (cron job or scheduled task)
REFRESH MATERIALIZED VIEW daily_revenue;
```

**Tradeoff:**
- ✅ Instant reads (pre-computed)
- ❌ Data is stale until refreshed
- ❌ Refresh blocks reads (use CONCURRENTLY to avoid)

---

## 🎤 Interview Questions

### Q1: "How do you systematically optimize a slow query?"

**Perfect Answer:**
> "First, I run EXPLAIN ANALYZE to see the execution plan. I look for Seq Scan on large tables—that's usually the bottleneck. If I see Seq Scan, I check the WHERE clause and create an index on filtered columns. After adding the index, I re-run EXPLAIN ANALYZE to verify it's being used. If the query has expensive sorts, I add the ORDER BY column to the index. If the estimated rows are far from actual rows, I run ANALYZE to update statistics. For complex queries, I check join order—Nested Loop is fast for small tables, Hash Join for large tables. If the query is still slow, I consider rewriting it (simplify subqueries, use CTEs) or pre-computing with materialized views. The key is: measure with EXPLAIN ANALYZE after every change, don't guess."

### Q2: "When would you use a materialized view?"

**Perfect Answer:**
> "I use materialized views for expensive aggregations that are queried frequently but data changes infrequently. Example: A dashboard showing daily revenue—the query aggregates millions of orders, taking 2-3 seconds. But yesterday's revenue doesn't change after the day ends. I create a materialized view to pre-compute daily aggregations, then query it instantly. I refresh it once daily or on-demand. The tradeoff is stale data—the view shows yesterday's state until refreshed. For real-time dashboards, I wouldn't use materialized views. I'd optimize the query with indexes or use an OLAP database like ClickHouse. Materialized views are best for periodic reports, analytics dashboards, or read-heavy data that's append-only."

### Q3: "Explain query planner statistics and ANALYZE"

**Perfect Answer:**
> "The query planner uses statistics to estimate how many rows each operation will return, then chooses the fastest plan. Statistics are stored in pg_stats (number of rows, distribution of values, most common values, histograms). If statistics are stale, the planner makes poor choices—like choosing Seq Scan when an index would be faster, or choosing Nested Loop when Hash Join is better. ANALYZE scans the table and updates statistics. I run ANALYZE after bulk inserts, major updates, or schema changes. Autovacuum runs ANALYZE automatically, but for large data loads, I run it manually. If EXPLAIN shows estimated rows far from actual rows (e.g., estimated 10, actual 10000), stale statistics are the problem."

---

# Exercise 13: Replication & High Availability

## 📚 Theory

### Replication Types

| Type | Use Case | Lag | Failover |
|------|----------|-----|----------|
| **Streaming Replication** | Read replicas, disaster recovery | <1 second | Manual |
| **Logical Replication** | Cross-version, partial replication | ~1 second | Manual |
| **Synchronous Replication** | Zero data loss | ~0ms | Manual |

**Architecture:**
- **Primary (Master):** Accepts writes
- **Standby (Replica):** Read-only, replicates from primary
- **Failover:** Promote standby to primary if primary fails

---

## 🔨 Hands-On Exercise (Neon Cloud Context)

### Task 1: Understanding Neon's Architecture

**Neon's Approach:**
```
Neon uses a unique architecture:
- Separates storage from compute
- Automatic replication (multi-AZ by default)
- Instant branching (like git branches for databases)
- Autoscaling compute
```

**Key Differences from Traditional Postgres:**
- ✅ No manual replication setup needed
- ✅ Automatic high availability
- ✅ Point-in-time restore built-in
- ✅ Branching for testing/staging

---

### Task 2: Create a Development Branch (Neon Feature)

```bash
# List branches
neon branches list

# Create development branch from production
neon branches create --name development --parent production

# Get connection string for development branch
neon connection-string development

# Use in application
DATABASE_URL_DEV="postgresql://user:pass@dev-branch.neon.tech/db"
DATABASE_URL_PROD="postgresql://user:pass@prod-branch.neon.tech/db"
```

**Use Cases:**
- Test migrations on dev branch before applying to prod
- Create per-feature branches for testing
- Staging environment with production data (without copying)

---

### Task 3: Point-in-Time Restore (Disaster Recovery)

```bash
# Restore database to 1 hour ago
neon branches create --name recovery --parent production --timestamp "2024-01-15 10:00:00"

# Connect to recovered branch to verify data
neon connection-string recovery

# If data is correct, promote to production
# (would require updating connection strings in application)
```

**Scenario:** Accidental DELETE without WHERE clause  
**Recovery Time:** < 1 minute (instant branching)

---

### Task 4: Read Replicas for Load Balancing

**Traditional Postgres Read Replica Setup (for comparison):**
```sql
-- On primary (postgresql.conf)
wal_level = replica
max_wal_senders = 3
wal_keep_size = 1GB

-- On standby
primary_conninfo = 'host=primary-server port=5432 user=replicator password=secret'
```

**Neon Alternative:**
```
Neon handles this automatically:
- Reads can be served from any replica
- Autoscaling spins up replicas under load
- No manual configuration needed
```

**Application Code (Split Reads and Writes):**
```typescript
// Connection pool with read replicas
const writePool = new Pool({
  connectionString: process.env.DATABASE_URL, // Primary
});

const readPool = new Pool({
  connectionString: process.env.DATABASE_READ_URL, // Replica
});

// Write to primary
async function createOrder(userId: number, amount: number) {
  return writePool.query(
    'INSERT INTO orders (user_id, total_amount) VALUES ($1, $2) RETURNING *',
    [userId, amount]
  );
}

// Read from replica
async function getOrders(userId: number) {
  return readPool.query(
    'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
}
```

**Considerations:**
- ⚠️ Replication lag (~100ms): Read might not see just-written data
- Solution: Read-your-writes consistency (read from primary after write)

```typescript
async function createOrderAndReturn(userId: number, amount: number) {
  // Write to primary
  const result = await writePool.query(
    'INSERT INTO orders (user_id, total_amount) VALUES ($1, $2) RETURNING *',
    [userId, amount]
  );
  
  // Read from primary (not replica) to ensure consistency
  return result.rows[0];
}
```

---

## 🎤 Interview Questions

### Q1: "Explain streaming replication and replication lag"

**Perfect Answer:**
> "Streaming replication copies Write-Ahead Log (WAL) records from primary to standby in real-time. The primary writes data and generates WAL, which is streamed to standbys. Standbys replay WAL to reconstruct the same state. Replication lag is the delay between primary writing and standby applying—typically <100ms on good networks. Lag occurs because replication is asynchronous by default: primary doesn't wait for standby to acknowledge. Synchronous replication waits for standby acknowledgment, ensuring zero data loss but adding latency. I monitor replication lag with pg_stat_replication.replay_lag. If lag grows, it indicates network issues, slow standby disk, or heavy write load. For most applications, async replication is fine—the tradeoff of potential data loss in disaster is acceptable for better write performance."

### Q2: "How do you handle read-your-writes consistency with read replicas?"

**Perfect Answer:**
> "Replication lag means a read from replica immediately after a write might not see the new data—violating read-your-writes consistency. To handle this, I read from the primary for a short window after writes. For example, after creating an order, I read from primary for 5 seconds, then switch to replicas. This uses a timestamp: on write, set session.last_write_time = NOW(). On read, if NOW() - session.last_write_time < 5s, use primary, else use replica. Alternatively, I use sticky sessions: route user requests to the same replica to improve consistency (but doesn't guarantee). For critical reads (e.g., payment confirmation), I always read from primary. The tradeoff is: reading from primary reduces replica benefits, but ensures correctness."

### Q3: "What's the difference between streaming and logical replication?"

**Perfect Answer:**
> "Streaming replication replicates WAL (binary log) byte-for-byte—standbys are exact copies, same version, all tables. Logical replication replicates at the SQL level—decodes WAL into logical changes (INSERT, UPDATE, DELETE) and applies them. This allows partial replication (specific tables), cross-version replication (Postgres 13 → 14), and multi-master setups. Streaming is simpler and faster but inflexible. Logical is flexible but slower and more complex. I use streaming for read replicas and disaster recovery (full replica). I use logical for data warehousing (replicate specific tables to analytics database) or gradual migrations (replicate from old to new cluster). Neon's branching is even better for dev/staging—instant copies without replication overhead."

---

# Exercise 14: Partitioning for Scale

## 📚 Theory

### Partitioning Types

| Type | Use Case | Example |
|------|----------|---------|
| **Range** | Time-series data | Partition by month/year |
| **List** | Categorical data | Partition by country/region |
| **Hash** | Even distribution | Partition by user_id hash |

**Benefits:**
- **Query pruning:** Only scan relevant partitions
- **Maintenance:** Drop old partitions (faster than DELETE)
- **Parallel queries:** Scan partitions in parallel

**Costs:**
- Complexity (managing partitions)
- Query planning overhead (choosing partitions)

---

## 🔨 Hands-On Exercise

### Task 1: Range Partitioning (Time-Series Data)

**Scenario:** Orders table with millions of rows, mostly query recent months

```sql
-- Create partitioned table
CREATE TABLE orders (
  id SERIAL,
  user_id INTEGER,
  total_amount DECIMAL(10, 2),
  status VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id, created_at) -- Partition key must be in PRIMARY KEY
) PARTITION BY RANGE (created_at);

-- Create partitions (one per month)
CREATE TABLE orders_2024_01 PARTITION OF orders
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE orders_2024_02 PARTITION OF orders
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

CREATE TABLE orders_2024_03 PARTITION OF orders
  FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

-- Default partition (catch-all for future dates)
CREATE TABLE orders_default PARTITION OF orders DEFAULT;

-- Create indexes on each partition
CREATE INDEX ON orders_2024_01(user_id);
CREATE INDEX ON orders_2024_02(user_id);
CREATE INDEX ON orders_2024_03(user_id);
```

**Query Pruning in Action:**
```sql
EXPLAIN SELECT * FROM orders WHERE created_at BETWEEN '2024-02-01' AND '2024-02-15';

-- Output:
-- Seq Scan on orders_2024_02 orders (cost=0.00..25.00 rows=100 width=112)
--   Filter: ((created_at >= '2024-02-01') AND (created_at <= '2024-02-15'))
-- (Only scans orders_2024_02 partition, not all partitions!)
```

**Without Partitioning:**
- Query scans entire orders table (millions of rows)

**With Partitioning:**
- Query only scans orders_2024_02 (tens of thousands of rows)
- **Result:** 10-100x faster

---

### Task 2: Automatic Partition Management (pg_partman Extension)

```sql
-- Install extension
CREATE EXTENSION IF NOT EXISTS pg_partman;

-- Create partitioned table
CREATE TABLE logs (
  id BIGSERIAL,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Use pg_partman to auto-create partitions
SELECT partman.create_parent(
  p_parent_table => 'public.logs',
  p_control => 'created_at',
  p_type => 'native',
  p_interval => 'daily',
  p_premake => 7 -- Create 7 days ahead
);

-- Auto-maintain (run daily via cron)
SELECT partman.run_maintenance();

-- Auto-drop old partitions (older than 90 days)
UPDATE partman.part_config 
SET retention_keep_table = false, retention = '90 days'
WHERE parent_table = 'public.logs';
```

---

### Task 3: List Partitioning (by Region)

```sql
-- Partition by country
CREATE TABLE users (
  id SERIAL,
  name VARCHAR(255),
  country VARCHAR(2) NOT NULL,
  PRIMARY KEY (id, country)
) PARTITION BY LIST (country);

-- US partition
CREATE TABLE users_us PARTITION OF users FOR VALUES IN ('US');

-- EU partition
CREATE TABLE users_eu PARTITION OF users FOR VALUES IN ('GB', 'FR', 'DE', 'IT', 'ES');

-- Asia partition
CREATE TABLE users_asia PARTITION OF users FOR VALUES IN ('JP', 'CN', 'IN', 'SG');

-- Default partition
CREATE TABLE users_other PARTITION OF users DEFAULT;

-- Query pruning
SELECT * FROM users WHERE country = 'US';
-- Only scans users_us partition
```

**Use Case:** Data sovereignty (EU data must stay in EU)

---

### Task 4: Hash Partitioning (Even Distribution)

```sql
-- Partition by user_id hash (8 partitions)
CREATE TABLE events (
  id BIGSERIAL,
  user_id INTEGER NOT NULL,
  event_type VARCHAR(50),
  created_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
) PARTITION BY HASH (user_id);

-- Create 8 partitions
CREATE TABLE events_p0 PARTITION OF events FOR VALUES WITH (MODULUS 8, REMAINDER 0);
CREATE TABLE events_p1 PARTITION OF events FOR VALUES WITH (MODULUS 8, REMAINDER 1);
CREATE TABLE events_p2 PARTITION OF events FOR VALUES WITH (MODULUS 8, REMAINDER 2);
CREATE TABLE events_p3 PARTITION OF events FOR VALUES WITH (MODULUS 8, REMAINDER 3);
CREATE TABLE events_p4 PARTITION OF events FOR VALUES WITH (MODULUS 8, REMAINDER 4);
CREATE TABLE events_p5 PARTITION OF events FOR VALUES WITH (MODULUS 8, REMAINDER 5);
CREATE TABLE events_p6 PARTITION OF events FOR VALUES WITH (MODULUS 8, REMAINDER 6);
CREATE TABLE events_p7 PARTITION OF events FOR VALUES WITH (MODULUS 8, REMAINDER 7);

-- Inserts are evenly distributed
INSERT INTO events (user_id, event_type) VALUES (123, 'login'); -- Goes to events_p3
INSERT INTO events (user_id, event_type) VALUES (456, 'logout'); -- Goes to events_p0

-- Queries by user_id prune to one partition
SELECT * FROM events WHERE user_id = 123;
-- Only scans events_p3
```

**Use Case:** Even load distribution across partitions

---

## 🎤 Interview Questions

### Q1: "When would you use partitioning?"

**Perfect Answer:**
> "I use partitioning when a table is too large for efficient querying or maintenance—typically 100GB+. The ideal scenario is time-series data where queries target recent data. For example, an orders table with 100 million rows partitioned by month. Queries for last month only scan that partition (10x faster). I can also drop old partitions instead of DELETE (instant vs hours). Range partitioning works for time-series, list partitioning for categorical data like country (data sovereignty), and hash for even distribution. The tradeoff is complexity—managing partitions, query planning overhead. I don't partition unless necessary; indexes are simpler and sufficient for smaller tables."

### Q2: "Explain partition pruning and how it improves performance"

**Perfect Answer:**
> "Partition pruning is when PostgreSQL analyzes the WHERE clause and only scans relevant partitions, skipping others entirely. For example, if orders are partitioned by month and I query WHERE created_at BETWEEN '2024-02-01' AND '2024-02-15', only the February partition is scanned—not January, March, or other months. This reduces I/O by 10-100x. EXPLAIN shows which partitions are scanned. Pruning works when the WHERE clause filters on the partition key. If the query doesn't filter by partition key, all partitions are scanned (no benefit). That's why choosing the right partition key is critical—partition by the column most queries filter on."

### Q3: "How do you manage partition maintenance?"

**Perfect Answer:**
> "For time-series data, I automate partition creation and deletion. I use the pg_partman extension to auto-create partitions ahead of time (e.g., create next month's partition on the 25th) and auto-drop old partitions (e.g., drop partitions older than 90 days). This runs via cron job: SELECT partman.run_maintenance(). Without automation, manual partition management is error-prone—forgetting to create next month's partition causes inserts to fail. I also monitor partition sizes with pg_stat_user_tables to ensure even distribution. For hash partitions, I avoid resizing (changing number of partitions) in production—it requires full table rewrite. Range partitioning is more flexible."

---

# Exercise 15: Production Best Practices

## 📚 Theory

### Production Checklist

1. **Monitoring:** Track query performance, connection pool, replication lag
2. **Vacuum:** Ensure autovacuum runs, tune for high-write tables
3. **Indexes:** Monitor unused indexes (overhead), missing indexes (slow queries)
4. **Connection Pooling:** Avoid running out of connections
5. **Backups:** Automated, tested restores
6. **Security:** SSL, least-privilege users, no passwords in code
7. **Query Logging:** Log slow queries (log_min_duration_statement)

---

## 🔨 Hands-On Exercise

### Task 1: Monitor Query Performance

```sql
-- Install pg_stat_statements extension (tracks query stats)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- View slowest queries
SELECT 
  query,
  calls,
  total_exec_time / 1000 AS total_seconds,
  mean_exec_time AS avg_ms,
  stddev_exec_time AS stddev_ms,
  rows
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Example output:
-- query                                    | calls | total_seconds | avg_ms | rows
-- SELECT * FROM orders WHERE user_id = ?  | 10000 | 50.5          | 5.05   | 20000

-- Focus on queries with high total_seconds (slow AND frequent)
```

**Action:** Add indexes to slow queries

---

### Task 2: Monitor Connection Pool

```sql
-- Check active connections
SELECT 
  datname AS database,
  COUNT(*) AS connections,
  COUNT(*) FILTER (WHERE state = 'active') AS active,
  COUNT(*) FILTER (WHERE state = 'idle') AS idle,
  COUNT(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_transaction
FROM pg_stat_activity
GROUP BY datname;

-- Example output:
-- database | connections | active | idle | idle_in_transaction
-- mydb     | 95          | 5      | 85   | 5

-- Red flags:
-- - idle_in_transaction > 0 (transactions left open, holding locks)
-- - connections near max_connections (need connection pooler like pgBouncer)
```

**Action:** Use PgBouncer for connection pooling (Neon handles this automatically)

---

### Task 3: Monitor Vacuum and Bloat

```sql
-- Check table bloat (dead tuples)
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
LIMIT 10;

-- Example output:
-- tablename | live_rows | dead_rows | bloat_percent | last_autovacuum
-- orders    | 1000000   | 250000    | 20.00         | 2024-01-15 10:30:00

-- Red flags:
-- - bloat_percent > 20% (need VACUUM)
-- - last_autovacuum > 1 day ago (autovacuum not running)
```

**Action:** Tune autovacuum for high-write tables
```sql
-- Make autovacuum more aggressive for orders table
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor = 0.05, -- Default: 0.2 (vacuum when 20% dead)
  autovacuum_analyze_scale_factor = 0.05
);
```

---

### Task 4: Monitor Unused Indexes

```sql
-- Find unused indexes (never used, but slow down writes)
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan AS times_used,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey' -- Exclude primary keys
ORDER BY pg_relation_size(indexrelid) DESC;

-- Example output:
-- tablename | indexname              | times_used | index_size
-- orders    | idx_orders_notes       | 0          | 256 MB

-- Action: Drop unused index
DROP INDEX idx_orders_notes;
```

---

### Task 5: Log Slow Queries

```sql
-- postgresql.conf (or Neon dashboard settings)
log_min_duration_statement = 1000 -- Log queries > 1 second

-- View logs
SHOW log_directory;
-- Logs show slow queries:
-- LOG: duration: 1234.567 ms statement: SELECT * FROM orders WHERE...

-- Action: Optimize logged queries with EXPLAIN ANALYZE
```

---

### Task 6: Connection Pooling (Application Level)

```typescript
// Use connection pool (not individual connections)
import { Pool } from 'pg';

// Bad: New connection per query (slow, exhausts connections)
async function badQuery() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const result = await client.query('SELECT * FROM users');
  await client.end();
  return result.rows;
}

// Good: Connection pool (reuses connections)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Max 20 connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function goodQuery() {
  const result = await pool.query('SELECT * FROM users');
  return result.rows;
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});
```

---

### Task 7: Database Backups and Point-in-Time Recovery

**Neon Approach:**
```bash
# Neon automatically backs up every change (via WAL)
# Restore to any point in time (within retention period)

# Create restore point
neon branches create --name backup-before-migration --parent production

# If migration fails, switch back
# (update connection string to backup branch)

# Neon handles backups automatically:
# - Continuous backup (WAL archiving)
# - 7-day retention on Free tier, 30+ days on paid tiers
# - Instant restore (branching, not copying)
```

**Traditional Postgres (for comparison):**
```bash
# pg_dump (logical backup, entire database)
pg_dump -U postgres -d mydb -F c -f backup.dump

# Restore
pg_restore -U postgres -d mydb backup.dump

# WAL archiving (continuous backup)
# postgresql.conf:
# archive_mode = on
# archive_command = 'cp %p /backup/wal/%f'

# Point-in-time recovery
# pg_basebackup + WAL replay to specific timestamp
```

---

## 🎤 Interview Questions

### Q1: "How do you monitor database health in production?"

**Perfect Answer:**
> "I use a combination of tools. For query performance, I enable pg_stat_statements to track slow queries—I look for high total execution time (slow AND frequent). For connections, I monitor pg_stat_activity to ensure we're not hitting max_connections—if we are, I add pgBouncer for connection pooling. For vacuum, I check pg_stat_user_tables for bloat—if dead_rows > 20%, I tune autovacuum or run manual VACUUM. I also monitor replication lag with pg_stat_replication—lag > 1 second indicates issues. For disk space, I track table and index sizes with pg_relation_size. I set up alerts: slow queries > 1s, connections > 80%, bloat > 20%, replication lag > 5s. Tools like Datadog, New Relic, or pgAnalyze automate this."

### Q2: "What causes table bloat and how do you fix it?"

**Perfect Answer:**
> "Table bloat happens because PostgreSQL's MVCC creates new row versions on update—old versions become 'dead tuples' after no transaction needs them. If VACUUM doesn't run frequently enough, dead tuples accumulate, wasting disk space and slowing queries (more pages to scan). High-update tables bloat fastest. To fix, I run VACUUM to reclaim space. For severe bloat, I run VACUUM FULL (rewrites entire table, requires exclusive lock) or pg_repack (online rewrite). To prevent, I tune autovacuum: lower autovacuum_vacuum_scale_factor for high-update tables (default 0.2 means vacuum when 20% dead—too infrequent for busy tables). I monitor n_dead_tup in pg_stat_user_tables and alert on bloat > 20%."

### Q3: "Explain connection pooling and why it's necessary"

**Perfect Answer:**
> "PostgreSQL has a max_connections limit (default 100). Each connection consumes memory (~10MB). Opening connections is slow (~50ms). Without pooling, each request creates a new connection—this exhausts max_connections under load and adds latency. Connection pooling maintains a pool of open connections that requests reuse. Application-level pooling (pg Pool in Node.js) works for single-server apps. For multi-server apps, I use PgBouncer—a standalone pooler that multiplexes many app connections onto fewer database connections. PgBouncer has three modes: session (1:1 until app disconnects), transaction (1:1 for transaction only), and statement (1:1 per query). Transaction mode is best for most apps—allows 1000 app connections with only 20 database connections. Neon has built-in connection pooling, so I don't need PgBouncer there."

---

## 🎉 Congratulations!

You've completed all 15 PostgreSQL interview exercises covering:

1. ✅ Data Modeling & Normalization
2. ✅ Indexes Deep Dive
3. ✅ Transactions & ACID
4. ✅ Isolation Levels
5. ✅ Deadlocks & Concurrency
6. ✅ Idempotency
7. ✅ Query Optimization
8. ✅ MVCC (Multi-Version Concurrency Control)
9. ✅ Locks Deep Dive
10. ✅ Advanced Concurrency Patterns
11. ✅ Constraints Deep Dive
12. ✅ Advanced Query Optimization
13. ✅ Replication & High Availability
14. ✅ Partitioning for Scale
15. ✅ Production Best Practices

---

## 📋 Staff/Principal Interview Readiness Checklist

After mastering these exercises, you can confidently answer:

### Architecture & Design
- [ ] Design a normalized schema (3NF) with proper relationships
- [ ] Choose between normalization and denormalization with tradeoffs
- [ ] Design partitioning strategy for 100M+ row tables
- [ ] Architect replication for HA and read scaling

### Performance & Optimization
- [ ] Use EXPLAIN ANALYZE to identify bottlenecks
- [ ] Create appropriate indexes (composite, partial, covering)
- [ ] Optimize queries systematically (10x-100x improvements)
- [ ] Design materialized views for expensive aggregations

### Concurrency & Correctness
- [ ] Implement ACID transactions correctly
- [ ] Choose appropriate isolation level for each use case
- [ ] Prevent race conditions with locks (FOR UPDATE, SKIP LOCKED)
- [ ] Handle deadlocks with detection and retry logic
- [ ] Implement idempotency for webhooks and APIs

### Production Operations
- [ ] Monitor query performance, connections, bloat, replication lag
- [ ] Tune autovacuum for high-write tables
- [ ] Implement connection pooling (application and PgBouncer)
- [ ] Design backup and recovery strategy
- [ ] Manage partitions automatically

### Deep Knowledge
- [ ] Explain MVCC and how it enables high concurrency
- [ ] Understand write skew and when SERIALIZABLE is needed
- [ ] Explain query planner statistics and ANALYZE
- [ ] Discuss tradeoffs: consistency vs performance, normalization vs speed

---

## 🚀 Next Steps

1. **Practice:** Run all exercises in your Neon database
2. **Document:** Create runnable TypeScript examples for each exercise
3. **Interview:** Use the "Perfect Answers" as templates for your responses
4. **Real-World:** Apply these patterns to your e-commerce project

**You're now ready for Staff/Principal-level database interviews!** 🎯
