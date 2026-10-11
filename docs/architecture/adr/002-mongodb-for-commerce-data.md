# ADR-002: MongoDB for Commerce Data

**Status:** Accepted  
**Date:** 2024-04  
**Decision Makers:** Architecture Team  
**Related:** ADR-003 (PostgreSQL for structured RAG data)

---

## Context

We need a database for:
- **Product catalog** (name, description, price, images, categories, stock)
- **User accounts** (profile, auth data, preferences)
- **Orders** (cart snapshots, payment status, customer info)
- **Chat threads** (conversation history, messages, metadata)
- **Admin entities** (settings, configurations)

### Requirements

1. **Flexible schema** for evolving product attributes
2. **Fast reads** for catalog browsing (most common operation)
3. **Embedded documents** for cart items (atomic order creation)
4. **Atlas-ready** for cloud deployment
5. **Rich querying** (category filters, search, sorting)
6. **No JOIN complexity** (denormalized data acceptable)

### Constraints

- MVP timeline (need to ship quickly)
- Team has MongoDB experience
- Schema will evolve as product requirements change
- Primarily read-heavy workload (90% reads, 10% writes)

---

## Decision

**We chose MongoDB for commerce and application data.**

MongoDB will store:
- Products collection (catalog)
- Users collection (authentication, profiles)
- Orders collection (checkout snapshots with embedded cart items)
- ChatThreads collection (AI conversation history)
- Categories collection (storefront navigation)

**Why:** Document model fits e-commerce domain naturally, schema flexibility accelerates development, embedded documents enable atomic operations.

---

## Alternatives Considered

### 1. PostgreSQL

**Pros:**
- ACID transactions
- Relational integrity
- Mature ecosystem
- Better for complex JOINs
- Strong consistency

**Cons:**
- Schema migrations required for every change
- Rigid structure slows iteration
- JOINs required for products + categories + reviews
- JSONB fields lose some benefits of relational model

**Why Not:** Commerce data doesn't require complex relationships. Catalog changes frequently (new product attributes, seasonal fields). PostgreSQL's rigidity is a net negative for this use case.

**When PostgreSQL Would Be Better:**
- If we had complex inventory tracking with multiple warehouses
- If we needed multi-table transactions (orders + inventory + accounting)
- If referential integrity was critical
- If we had analysts writing complex JOINs

### 2. DynamoDB

**Pros:**
- Serverless (no ops)
- Predictable latency
- Auto-scaling
- Pay-per-request

**Cons:**
- Limited query flexibility (must design around partition keys)
- No aggregations
- Expensive for scans
- Vendor lock-in (AWS only)
- More complex access patterns

**Why Not:** We need flexible querying (filter by category, search, sort by price). DynamoDB's single-table design would require significant upfront modeling and make iteration slower.

### 3. Firebase/Firestore

**Pros:**
- Real-time sync
- Offline support
- Serverless
- Good for MVP

**Cons:**
- Vendor lock-in (Google only)
- Limited query capabilities
- Cost at scale
- Not ideal for backend-first architecture

**Why Not:** We're building a traditional backend API, not a real-time collaborative app. Firestore's strengths (offline, real-time) aren't needed. Cost model becomes expensive at scale.

### 4. Cassandra

**Pros:**
- Write-optimized
- Linear scalability
- Multi-datacenter

**Cons:**
- Complex to operate
- Eventual consistency
- Limited query flexibility
- Overkill for our scale

**Why Not:** Cassandra solves problems we don't have (write-heavy at massive scale, multi-datacenter). Our workload is read-heavy at modest scale.

---

## Rationale

### Why MongoDB Fits E-Commerce

1. **Product Attributes Vary**
   ```javascript
   // Headphones
   {
     name: "...",
     price: 199,
     category: "audio",
     drivers: "50mm",
     impedance: "32Ω"
   }
   
   // Mouse
   {
     name: "...",
     price: 79,
     category: "accessories",
     dpi: 16000,
     buttons: 8
   }
   ```
   PostgreSQL would require EAV pattern or JSONB, losing relational benefits anyway.

2. **Orders Are Document-Oriented**
   ```javascript
   {
     orderNumber: "ACL-260425-4AF19C",
     customer: { name, email, address },
     items: [
       { productId, name, price, quantity },
       { productId, name, price, quantity }
     ],
     total: 278.00,
     paymentStatus: "paid"
   }
   ```
   This is a natural document. Storing `items` as a separate table would require JOINs for every order display.

3. **Read-Heavy Workload**
   - Users browse catalog (read products)
   - Users view order history (read orders)
   - Admins view dashboard (read aggregations)
   
   MongoDB's document model optimizes reads (no JOINs needed).

4. **Horizontal Scaling**
   MongoDB sharding is mature. When we reach Atlas limits, we can shard by:
   - Products: shard by category
   - Orders: shard by customerId or orderDate
   - Users: shard by userId

---

## Tradeoffs

### What We Gain

- ✅ **Schema Flexibility:** Add new product fields without migrations
- ✅ **Fast Iteration:** No schema coordination between backend changes
- ✅ **Atomic Documents:** Order creation is single-document (atomic)
- ✅ **Natural Mapping:** Mongoose models ↔ TypeScript types ↔ JSON API
- ✅ **Atlas Managed Service:** Zero-ops MongoDB in production
- ✅ **Rich Queries:** Find, filter, sort, aggregate without SQL
- ✅ **Embedding:** Cart items embedded in order (no JOIN overhead)

### What We Lose

- ❌ **ACID Transactions Across Collections:** MongoDB has multi-document transactions, but they're slower than PostgreSQL
- ❌ **Referential Integrity:** No foreign key constraints (must enforce in application)
- ❌ **Ad-Hoc Analytics:** Analysts can't write SQL (must use aggregation pipeline)
- ❌ **Type Safety at DB Level:** No schema enforcement (Mongoose provides this in application)

### What It Costs

- **Consistency Model:** MongoDB is eventually consistent by default (tunable with write concerns)
- **Storage:** Embedded documents duplicate data (order stores product name, even if product is deleted)
- **Data Integrity:** Application must prevent orphaned references
- **Learning Curve:** Team must learn aggregation pipeline (vs SQL)

---

## Data Modeling Decisions

### Embedding vs Referencing

**We Embed:**
- Cart items in orders (order is immutable snapshot)
- Product features (within product document)
- User preferences (within user document)

**We Reference:**
- Product → Category (category is shared)
- Order → User (user exists independently)
- ChatThread → User (user exists independently)

**Rationale:** Embed when data is owned by parent and doesn't need independent querying. Reference when entity is shared or queried independently.

### Example: Order Schema

```typescript
{
  _id: ObjectId,
  orderNumber: String,     // Unique, indexed
  userId: ObjectId,        // Reference to User
  customer: {              // Embedded snapshot (denormalized)
    email: String,
    name: String,
    address: Object
  },
  items: [                 // Embedded cart items (immutable snapshot)
    {
      productId: ObjectId, // Reference (for admin lookups)
      name: String,        // Snapshot (product name may change later)
      price: Number,       // Snapshot (price at purchase time)
      quantity: Number
    }
  ],
  paymentProvider: String,
  paymentStatus: String,
  total: Number,
  createdAt: Date,
  updatedAt: Date
}
```

**Why This Model:**
- Order is immutable record of transaction
- Embedded items prevent JOIN on every order display
- Denormalized customer/product data preserves historical state
- productId reference enables "customers who bought this also bought..."

---

## Consistency Guarantees

### What We Need

1. **Order Creation:** Must be atomic (order + payment intent + initial status)
   - ✅ **Single Document Write:** Atomic by default in MongoDB

2. **Payment Status Update:** Webhook updates order status
   - ⚠️ **Race Condition Risk:** Stripe webhook + frontend status poll
   - ✅ **Mitigation:** Use `findOneAndUpdate` with optimistic concurrency (version field)

3. **Product Stock Decrement:** Not implemented yet
   - 🔄 **Future:** Will need transaction or optimistic locking

### Write Concerns

We use:
- **Default (w: 1):** Acknowledged by primary
- **For Payments (w: majority):** Acknowledged by majority of replica set

**Rationale:** Payment operations justify stronger consistency. Catalog reads can tolerate eventual consistency.

---

## Indexing Strategy

### Indexes We Need

```javascript
// Products
db.products.createIndex({ slug: 1 }, { unique: true })
db.products.createIndex({ category: 1, createdAt: -1 })
db.products.createIndex({ featured: 1, createdAt: -1 })
db.products.createIndex({ name: "text", description: "text" })

// Orders
db.orders.createIndex({ orderNumber: 1 }, { unique: true })
db.orders.createIndex({ userId: 1, createdAt: -1 })
db.orders.createIndex({ paymentStatus: 1 })
db.orders.createIndex({ "customer.email": 1 })

// Users
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ googleId: 1 }, { sparse: true })

// ChatThreads
db.chatthreads.createIndex({ userId: 1, createdAt: -1 })
```

**Rationale:**
- Unique indexes prevent duplicates
- Compound indexes support sorting (category + date)
- Text indexes enable search
- Sparse indexes save space (not all users have googleId)

---

## Consequences

### Positive

1. **Development Velocity:** Add product fields without coordinating schema changes
2. **Performance:** No JOINs for common queries (list products, show order)
3. **Scalability:** Atlas handles replication/backups, sharding available
4. **Flexibility:** Schema evolves with product requirements

### Negative

1. **Referential Integrity:** Must enforce in application (e.g., don't delete products with active orders)
2. **Aggregations:** More complex than SQL GROUP BY
3. **Data Duplication:** Orders store product names (storage cost)
4. **Analytics:** Analysts need to learn aggregation pipeline

### Migration Path

If MongoDB becomes a bottleneck:

1. **Keep for commerce data** (products, orders, users)
2. **Move analytics to data warehouse** (Snowflake, BigQuery)
3. **Move transactional features to PostgreSQL** (inventory, accounting)

**We are NOT locked into MongoDB forever.** It's the right choice for this phase.

---

## When Would We Change This Decision?

### Triggers to Reconsider

1. **Need Complex Multi-Document Transactions**
   - Example: Inventory tracking across warehouses
   - Mitigation: Use MongoDB transactions (slower but supported)
   - Alternative: Move inventory to PostgreSQL

2. **Analytics Becomes Primary Use Case**
   - Example: Finance team needs complex JOINs
   - Mitigation: ETL to data warehouse (Fivetran + Snowflake)
   - Alternative: Keep operational data in Mongo, replicate to Postgres for analytics

3. **Need Strict Schema Enforcement**
   - Example: Regulatory compliance requires immutable schema
   - Mitigation: Use Mongoose schema validation (already doing this)
   - Alternative: Migrate to PostgreSQL

4. **Scale Beyond Atlas Limits**
   - Example: >100TB data, >100k writes/sec
   - Mitigation: Self-host MongoDB with sharding
   - Alternative: Consider Cassandra or DynamoDB

---

## PostgreSQL vs MongoDB Decision Matrix

| Use Case | MongoDB | PostgreSQL |
|----------|---------|------------|
| **Flexible schema (product attributes)** | ✅ Excellent | ⚠️ JSONB or EAV |
| **Read-heavy catalog browsing** | ✅ Excellent | ✅ Excellent |
| **Write-heavy inventory updates** | ⚠️ Good | ✅ Excellent |
| **Multi-table transactions** | ⚠️ Slower | ✅ Excellent |
| **Embedded documents (cart in order)** | ✅ Native | ⚠️ JSONB |
| **Complex JOINs (5+ tables)** | ❌ Poor | ✅ Excellent |
| **Schema migrations** | ✅ Not needed | ❌ Required |
| **Referential integrity** | ❌ Application-enforced | ✅ DB-enforced |
| **Horizontal scaling** | ✅ Sharding | ⚠️ Complex |
| **Analytics (BI tools)** | ⚠️ Aggregation pipeline | ✅ SQL |

**Conclusion:** MongoDB is the right choice for this e-commerce workload. When we add complex inventory or accounting, we'll use PostgreSQL alongside MongoDB.

---

## Integration with PostgreSQL

**We use BOTH databases:**
- **MongoDB:** Products, orders, users, chat threads (operational data)
- **PostgreSQL:** PDF chunks with embeddings (structured RAG data)

**Why Separate:**
- pgvector (PostgreSQL extension) is ideal for vector search
- PDF chunks are structured, relational (chunk → document → user)
- MongoDB is ideal for commerce (flexible, embedded documents)

**See ADR-003** for PostgreSQL + pgvector rationale.

---

## References

- [MongoDB Use Cases](https://www.mongodb.com/use-cases)
- [Data Modeling Introduction (MongoDB)](https://www.mongodb.com/docs/manual/core/data-modeling-introduction/)
- [MongoDB vs PostgreSQL (When to Use Each)](https://www.mongodb.com/compare/mongodb-postgresql)
- [Mongoose Schema Design](https://mongoosejs.com/docs/guide.html)

---

**Last Updated:** 2024-04  
**Next Review:** If we need complex inventory transactions or multi-collection ACID requirements
