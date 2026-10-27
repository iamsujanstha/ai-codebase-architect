# PostgreSQL Migration Guide: From MongoDB to PostgreSQL

> **Historical learning scenario:** This guide demonstrates migration patterns. Its dual-write, fallback, and ORM steps are not the current application architecture. See [the system architecture](../../../ARCHITECTURE.md) and [ADR-016](../../ADRs/016-complete-migration-to-raw-postgresql-and-decommissioning-of-prisma.md) for the current direction.

**Goal:** Migrate from MongoDB to PostgreSQL to learn advanced database concepts  
**Timeline:** 2-3 weeks (incremental migration)  
**Status:** Planning Phase

---

## 🎯 Learning Objectives

By migrating to PostgreSQL, you'll master:

### 1. SQL & Data Modeling ✅
- **SQL queries:** SELECT, JOIN, WHERE, GROUP BY, HAVING, window functions
- **Data modeling:** Normalization (1NF, 2NF, 3NF), foreign keys, relationships
- **Schema design:** Tables vs documents, when to normalize vs denormalize

### 2. Indexes & Performance ✅
- **Index types:** B-tree, Hash, GIN, GiST, BRIN
- **Index strategies:** Single-column, composite, partial, covering indexes
- **Query optimization:** EXPLAIN ANALYZE, index selection, query planner

### 3. Transactions & ACID ✅
- **ACID properties:** Atomicity, Consistency, Isolation, Durability
- **Transaction control:** BEGIN, COMMIT, ROLLBACK, SAVEPOINT
- **Isolation levels:** Read Uncommitted, Read Committed, Repeatable Read, Serializable
- **Locks:** Row-level, table-level, explicit locks (FOR UPDATE)

### 4. Concurrency Control ✅
- **MVCC:** Multi-Version Concurrency Control (PostgreSQL's approach)
- **Deadlocks:** Detection, prevention, resolution
- **Lock conflicts:** Understanding and debugging
- **Idempotency:** Handling concurrent operations safely

### 5. Advanced Topics ✅
- **Constraints:** PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK, NOT NULL
- **Replication:** Streaming replication, logical replication, failover
- **Partitioning:** Range, list, hash partitioning for large tables
- **Query optimization:** Analyzing slow queries, tuning parameters

---

## 📊 Current MongoDB Schema Analysis

### Core Collections:

**1. users**
```typescript
{
  _id: ObjectId,
  email: string (unique),
  password: string,
  name: string,
  role: 'user' | 'admin',
  googleId?: string,
  avatar?: string,
  resetToken?: string,
  resetTokenExpires?: Date,
  isActive: boolean,
  lastLoginAt?: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**2. products**
```typescript
{
  _id: ObjectId,
  name: string,
  description: string,
  price: number,
  category: string,
  stock: number,
  imageUrl: string,
  featured: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

**3. orders**
```typescript
{
  _id: ObjectId,
  userId: ObjectId (ref User),
  orderNumber: string (unique),
  items: [
    {
      productId: ObjectId,
      name: string,
      price: number,
      quantity: number
    }
  ],
  totalAmount: number,
  status: 'pending' | 'paid' | 'cancelled',
  paymentMethod: 'stripe' | 'esewa',
  paymentIntentId?: string,
  createdAt: Date,
  updatedAt: Date
}
```

**4. chat_threads**
```typescript
{
  _id: ObjectId,
  userId: ObjectId (ref User),
  title: string,
  messages: [
    {
      role: 'user' | 'assistant',
      content: string,
      timestamp: Date
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

**5. payment_audit_logs**
```typescript
{
  _id: ObjectId,
  orderNumber: string,
  eventType: string,
  timestamp: Date,
  provider: string,
  userId?: string,
  actor: string,
  previousStatus?: string,
  newStatus?: string,
  details: object,
  ipAddress?: string,
  correlationId?: string,
  success: boolean,
  message?: string
}
```

---

## 🗄️ PostgreSQL Schema Design

### Key Differences: MongoDB vs PostgreSQL

| Aspect | MongoDB | PostgreSQL |
|--------|---------|------------|
| **Data Model** | Document (nested) | Relational (tables) |
| **Schema** | Flexible (schemaless) | Strict (defined schema) |
| **Relationships** | Embedded or references | Foreign keys |
| **Queries** | JavaScript-like | SQL |
| **Transactions** | Limited (multi-doc transactions complex) | Full ACID support |
| **Joins** | Manual (lookup) | Native SQL JOINs |
| **Arrays** | Native support | ARRAY type or separate table |

### Proposed PostgreSQL Schema:

#### 1. Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  google_id VARCHAR(255) UNIQUE,
  avatar VARCHAR(500),
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Learning: Composite index for common query pattern
CREATE INDEX idx_users_role_active ON users(role, is_active) WHERE is_active = true;
```

**Why this design:**
- `id SERIAL PRIMARY KEY`: Auto-incrementing integer (efficient, indexed)
- `email UNIQUE`: Database-level constraint (better than application-level)
- `CHECK (role IN ...)`: Enum constraint at database level
- Indexes on commonly queried fields (email, role, created_at)
- Composite index for `role + is_active` (common admin queries)
- Partial index on `google_id` (only index non-null values)

---

#### 2. Products Table
```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  category VARCHAR(100) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url VARCHAR(500),
  featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_featured ON products(featured) WHERE featured = true;
CREATE INDEX idx_products_name_trgm ON products USING gin(name gin_trgm_ops); -- Full-text search

-- Learning: Composite index for catalog query
CREATE INDEX idx_products_category_stock ON products(category, stock) WHERE stock > 0;
```

**Why this design:**
- `DECIMAL(10, 2)`: Fixed-point for money (no floating-point errors)
- `CHECK` constraints: Validate data at database level
- GIN index with trigram extension for fuzzy text search
- Partial index on `featured` (only featured products)
- Composite index for "in-stock products by category"

---

#### 3. Orders Table (Normalized)

**Design Decision:** Normalize order items into separate table (learning opportunity)

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  payment_method VARCHAR(20) CHECK (payment_method IN ('stripe', 'esewa')),
  payment_intent_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order items (separate table for normalization)
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  name VARCHAR(500) NOT NULL, -- Denormalized for historical record
  price DECIMAL(10, 2) NOT NULL, -- Denormalized for historical record
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal DECIMAL(10, 2) NOT NULL GENERATED ALWAYS AS (price * quantity) STORED
);

-- Indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- Learning: Composite index for user's recent orders
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);
```

**Why this design:**
- **Normalization:** Order items in separate table (3NF)
- **Foreign keys:** Enforce referential integrity
- `ON DELETE CASCADE`: Delete items when order deleted
- `ON DELETE RESTRICT`: Prevent deleting products with orders
- `GENERATED ALWAYS`: Computed column (subtotal = price × quantity)
- **Denormalization:** Store product name/price (historical record, even if product changes)

**Learning: Normalization vs Denormalization**
- Normalized: `order_items` table (no data duplication)
- Denormalized: Store product name/price in `order_items` (preserve historical data)
- Tradeoff: More tables vs data consistency

---

#### 4. Chat Threads & Messages (Normalized)

**Design Decision:** Separate tables for threads and messages (learning normalization)

```sql
CREATE TABLE chat_threads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_chat_threads_user_id ON chat_threads(user_id);
CREATE INDEX idx_chat_messages_thread_id ON chat_messages(thread_id);
CREATE INDEX idx_chat_messages_timestamp ON chat_messages(timestamp);

-- Learning: Composite index for chronological messages
CREATE INDEX idx_chat_messages_thread_timestamp ON chat_messages(thread_id, timestamp);
```

**Why this design:**
- **Normalization:** Messages in separate table (better for pagination, querying)
- **Foreign keys:** Maintain data integrity
- Easy to query: "Get all messages for thread" (simple JOIN)
- Easy to paginate: "Get messages 20-40" (LIMIT/OFFSET)

**MongoDB Comparison:**
```javascript
// MongoDB: Embedded array (harder to paginate)
{ messages: [{...}, {...}, ...] }

// PostgreSQL: Separate table (easy to paginate)
SELECT * FROM chat_messages WHERE thread_id = 1 LIMIT 20 OFFSET 20;
```

---

#### 5. Payment Audit Logs
```sql
CREATE TABLE payment_audit_logs (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider VARCHAR(20) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor VARCHAR(20) NOT NULL CHECK (actor IN ('USER', 'SYSTEM', 'WEBHOOK')),
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  details JSONB, -- Store flexible data as JSONB
  ip_address INET,
  correlation_id UUID,
  success BOOLEAN NOT NULL,
  message TEXT
);

-- Indexes
CREATE INDEX idx_audit_order_number ON payment_audit_logs(order_number);
CREATE INDEX idx_audit_timestamp ON payment_audit_logs(timestamp DESC);
CREATE INDEX idx_audit_correlation_id ON payment_audit_logs(correlation_id);
CREATE INDEX idx_audit_details_gin ON payment_audit_logs USING gin(details); -- Query JSONB fields

-- Learning: Partial index for failed payments (for investigation)
CREATE INDEX idx_audit_failed ON payment_audit_logs(timestamp DESC, event_type) WHERE success = false;
```

**Why this design:**
- `JSONB`: Store flexible JSON data with indexing support
- `INET`: Native IP address type (better than VARCHAR)
- `UUID`: Native UUID type for correlation IDs
- GIN index on JSONB for querying nested fields
- Partial index on failed payments (investigation queries)

---

## 🔄 Migration Strategy (Incremental)

### Phase 1: Dual-Write (Week 1)
**Goal:** Write to both MongoDB and PostgreSQL, read from MongoDB

```typescript
// Write to both databases
async createUser(userData: CreateUserDto) {
  // Write to MongoDB (primary)
  const mongoUser = await this.userModel.create(userData);
  
  // Write to PostgreSQL (shadow)
  try {
    await this.postgresService.query(`
      INSERT INTO users (email, name, role, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [userData.email, userData.name, userData.role]);
  } catch (error) {
    // Log error but don't fail request
    this.logger.error('PostgreSQL write failed', error);
  }
  
  return mongoUser;
}
```

**Why:** Zero risk. PostgreSQL errors don't affect production. Validate data consistency.

---

### Phase 2: Backfill Data (Week 1-2)
**Goal:** Copy existing MongoDB data to PostgreSQL

```bash
# Export MongoDB to JSON
mongoexport --db=atlas --collection=users --out=users.json

# Import to PostgreSQL (via script)
node scripts/backfill-postgres.ts
```

**Script:**
```typescript
// scripts/backfill-postgres.ts
async function backfillUsers() {
  const mongoUsers = await UserModel.find({});
  
  for (const user of mongoUsers) {
    await pg.query(`
      INSERT INTO users (id, email, name, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO NOTHING
    `, [
      user._id.toString(), // Use MongoDB _id as PostgreSQL id
      user.email,
      user.name,
      user.role,
      user.createdAt,
      user.updatedAt,
    ]);
  }
}
```

---

### Phase 3: Dual-Read (Week 2)
**Goal:** Read from PostgreSQL, fallback to MongoDB if data missing

```typescript
async findUserById(id: string) {
  // Try PostgreSQL first
  const pgUser = await this.postgresService.query(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  
  if (pgUser.rows[0]) {
    return pgUser.rows[0];
  }
  
  // Fallback to MongoDB
  return await this.userModel.findById(id);
}
```

**Why:** Gradual transition. Catch missing data before full cutover.

---

### Phase 4: PostgreSQL Primary (Week 3)
**Goal:** Read from PostgreSQL only, stop MongoDB writes

```typescript
async findUserById(id: string) {
  const result = await this.postgresService.query(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  
  if (!result.rows[0]) {
    throw new NotFoundException('User not found');
  }
  
  return result.rows[0];
}
```

**Why:** PostgreSQL is now primary. MongoDB is archive (delete after 30 days).

---

## 🧪 Learning Exercises (Hands-On)

### Exercise 1: Understanding Isolation Levels

**Setup:**
```sql
-- Terminal 1: Start transaction with READ COMMITTED
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
SELECT * FROM products WHERE id = 1;
-- (price = 100)
```

```sql
-- Terminal 2: Update product
UPDATE products SET price = 150 WHERE id = 1;
COMMIT;
```

```sql
-- Terminal 1: Read again (same transaction)
SELECT * FROM products WHERE id = 1;
-- With READ COMMITTED: price = 150 (sees update)
-- With REPEATABLE READ: price = 100 (no change)
COMMIT;
```

**Learning:** Isolation levels affect what you see in concurrent transactions.

---

### Exercise 2: Deadlock Detection

**Setup:**
```sql
-- Terminal 1
BEGIN;
UPDATE orders SET status = 'paid' WHERE id = 1;
-- (holds lock on order 1)
```

```sql
-- Terminal 2
BEGIN;
UPDATE orders SET status = 'paid' WHERE id = 2;
-- (holds lock on order 2)
```

```sql
-- Terminal 1: Try to update order 2 (blocked by Terminal 2)
UPDATE orders SET status = 'cancelled' WHERE id = 2;
```

```sql
-- Terminal 2: Try to update order 1 (DEADLOCK!)
UPDATE orders SET status = 'cancelled' WHERE id = 1;
-- ERROR: deadlock detected
```

**Learning:** PostgreSQL detects deadlocks and aborts one transaction.

---

### Exercise 3: MVCC in Action

**Setup:**
```sql
-- Terminal 1
BEGIN;
SELECT * FROM users WHERE id = 1;
-- (version 1 of row)
```

```sql
-- Terminal 2
UPDATE users SET name = 'New Name' WHERE id = 1;
COMMIT;
-- (creates version 2 of row)
```

```sql
-- Terminal 1: Still sees old version (MVCC)
SELECT * FROM users WHERE id = 1;
-- (still version 1, not blocked)
COMMIT;
```

**Learning:** MVCC allows readers to not block writers (and vice versa).

---

### Exercise 4: Index Performance

**Setup:**
```sql
-- Query without index
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 123;
-- Seq Scan on orders (cost=0.00..XX rows=XX)

-- Create index
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Query with index
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 123;
-- Index Scan using idx_orders_user_id (cost=0.29..XX rows=XX)
```

**Learning:** Indexes dramatically speed up queries (scan vs seek).

---

### Exercise 5: Transaction Rollback

**Setup:**
```sql
BEGIN;

-- Insert user
INSERT INTO users (email, name, role)
VALUES ('test@example.com', 'Test User', 'user');

-- Insert order
INSERT INTO orders (user_id, order_number, total_amount)
VALUES (CURRVAL('users_id_seq'), 'ORD-001', 100.00);

-- Oops, error!
INSERT INTO order_items (order_id, product_id, quantity, price)
VALUES (CURRVAL('orders_id_seq'), 9999, 1, 50.00);
-- ERROR: foreign key violation (product 9999 doesn't exist)

-- Rollback entire transaction
ROLLBACK;

-- Check: User and order not created (atomicity!)
SELECT * FROM users WHERE email = 'test@example.com';
-- (empty result)
```

**Learning:** Transactions are atomic. All-or-nothing.

---

## 📚 SQL Learning Path

### Week 1: Basics
- [ ] SELECT, WHERE, ORDER BY, LIMIT
- [ ] Aggregations: COUNT, SUM, AVG, MAX, MIN
- [ ] GROUP BY, HAVING
- [ ] JOINs: INNER, LEFT, RIGHT, FULL OUTER

### Week 2: Intermediate
- [ ] Subqueries, CTEs (WITH clause)
- [ ] Window functions: ROW_NUMBER, RANK, LAG, LEAD
- [ ] CASE statements, COALESCE
- [ ] Transactions: BEGIN, COMMIT, ROLLBACK

### Week 3: Advanced
- [ ] Indexes: Creating, analyzing with EXPLAIN
- [ ] Query optimization: Rewriting queries for performance
- [ ] Isolation levels: Testing concurrent behavior
- [ ] Constraints: PRIMARY KEY, FOREIGN KEY, CHECK, UNIQUE

### Week 4: Expert
- [ ] Partitioning: Range, list, hash
- [ ] Replication: Streaming, logical
- [ ] Vacuum, autovacuum, bloat management
- [ ] Performance tuning: pg_stat_statements, pg_stat_activity

---

## 🛠️ Tools & Setup

### 1. Neon (Cloud PostgreSQL)
- **URL:** https://neon.tech
- **Why:** Serverless PostgreSQL, free tier, instant branching
- **Setup:** Follow Neon CLI setup below

### 2. Local Development Tools
```bash
# Install PostgreSQL client
brew install libpq

# Install GUI tool (pick one)
brew install --cask pgadmin4      # Full-featured GUI
brew install --cask dbeaver-community  # Universal DB tool
```

### 3. VSCode Extensions
- PostgreSQL (by Chris Kolkman) - SQL syntax highlighting
- SQLTools (by Matheus Teixeira) - Query runner

---

## 🚀 Next Steps

1. **Set up Neon:** Follow Neon CLI setup
2. **Create PostgreSQL schema:** Run migration scripts
3. **Implement dual-write:** Start writing to both databases
4. **Backfill data:** Copy MongoDB → PostgreSQL
5. **Learn SQL:** Complete exercises above
6. **Implement TypeORM/Prisma:** Replace Mongoose
7. **Cut over:** Make PostgreSQL primary

---

## 📖 Resources

### Books:
- **"SQL Performance Explained"** by Markus Winand (best for indexes/optimization)
- **"PostgreSQL: Up and Running"** by Regina Obe (practical guide)
- **"Designing Data-Intensive Applications"** by Martin Kleppmann (distributed systems)

### Online:
- **PostgreSQL Tutorial:** https://www.postgresqltutorial.com/
- **Use The Index, Luke:** https://use-the-index-luke.com/ (index optimization)
- **PostgreSQL Docs:** https://www.postgresql.org/docs/ (official reference)

---

## ✅ Success Metrics

After completing migration, you'll be able to:
- ✅ Write complex SQL queries with JOINs, CTEs, window functions
- ✅ Design normalized schemas (3NF) with foreign keys
- ✅ Create and optimize indexes for query performance
- ✅ Explain ACID properties and isolation levels
- ✅ Debug deadlocks and lock conflicts
- ✅ Use transactions safely in production
- ✅ Optimize slow queries with EXPLAIN ANALYZE
- ✅ Implement idempotency with database constraints
- ✅ Understand MVCC and concurrency control
- ✅ Design partitioned tables for large datasets

**This is Staff/Principal-level database expertise.**

---

**Current Status:** Ready to begin setup  
**Next:** Neon CLI configuration and schema creation
