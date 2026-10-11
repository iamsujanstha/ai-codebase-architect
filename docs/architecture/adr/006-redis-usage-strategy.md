# ADR-006: Redis Usage Strategy

**Status:** Accepted  
**Date:** 2024-04  
**Decision Makers:** Architecture Team  
**Related:** ADR-002 (MongoDB), ADR-007 (Queue Architecture)

---

## Context

We need a fast, in-memory data store for:
- Rate limiting counters (track requests per user)
- Idempotency cache (prevent duplicate operations)
- Session management (future: if we move away from JWT)
- Background job queues (RQ uses Redis)
- Real-time data (active users, live metrics)

### Requirements

1. **Sub-millisecond latency** (rate limit checks must be fast)
2. **Atomic operations** (increment counters without race conditions)
3. **TTL support** (automatic expiration for temporary data)
4. **Persistence** (survive restarts for critical data)
5. **Simple deployment** (single Docker container for dev/staging)

### Constraints

- Must integrate with Python RQ (for background jobs)
- Must support TypeScript/Node.js (for rate limiting)
- Must handle 1000+ req/sec at scale
- Development environment: single Redis instance
- Production: Redis Cluster or managed service (future)

---

## Decision

**We use Redis for ephemeral, high-speed data:**
- Rate limiting (request counters)
- Idempotency cache (operation deduplication)
- Background job queues (RQ for Python workers)
- Cache layer (future: catalog caching)

**We do NOT use Redis for:**
- Primary data storage (use MongoDB)
- Long-term persistence (use PostgreSQL/MongoDB)
- Complex queries (use databases)

---

## Why Redis?

### 1. Speed

**Latency Comparison:**
```
Redis (in-memory):     < 1ms
MongoDB (disk):        5-50ms
PostgreSQL (disk):     10-100ms
```

**Why It Matters:**
```javascript
// Rate limiting check on every request
if (!await rateLimitGuard.check(userId)) {
  return 429 Too Many Requests;
}

// If check takes 50ms (MongoDB):
// 1000 req/sec × 50ms = 50 seconds of work
// Server cannot handle load

// If check takes 1ms (Redis):
// 1000 req/sec × 1ms = 1 second of work
// Server handles easily
```

### 2. Atomic Operations

**Race Condition Example:**

Without atomic operations:
```javascript
// Thread A: Read counter = 5
const count = await getCount(userId);

// Thread B: Read counter = 5 (same value!)
const count = await getCount(userId);

// Thread A: Increment to 6
await setCount(userId, count + 1);

// Thread B: Increment to 6 (not 7!)
await setCount(userId, count + 1);

// Result: Lost update (should be 7, got 6)
```

With Redis atomic operations:
```javascript
// Both threads execute atomically
await redis.incr(`rate_limit:${userId}`);
await redis.incr(`rate_limit:${userId}`);

// Result: 7 (correct)
```

### 3. TTL (Time-To-Live)

**Automatic Expiration:**
```javascript
// Rate limit: 10 requests per minute
await redis.set(`rate_limit:${userId}`, 1, 'EX', 60);

// After 60 seconds: Key automatically deleted
// No cleanup job needed
// No memory leak
```

**Without TTL:**
```javascript
// Manual cleanup required
await db.insert({ userId, count: 1, expiresAt: Date.now() + 60000 });

// Need background job to delete expired records
setInterval(async () => {
  await db.delete({ expiresAt: { $lt: Date.now() } });
}, 60000);

// Expensive, slow, complex
```

### 4. Data Structures

Redis supports rich data types:

**String:** Simple key-value
```javascript
await redis.set('user:123:name', 'Alice');
```

**Hash:** Object storage
```javascript
await redis.hset('user:123', {
  name: 'Alice',
  email: 'alice@example.com',
  loginCount: 42,
});
```

**List:** Queue/timeline
```javascript
await redis.lpush('notifications', notification);
await redis.rpop('notifications'); // FIFO queue
```

**Set:** Unique items
```javascript
await redis.sadd('active_users', userId);
await redis.scard('active_users'); // Count active users
```

**Sorted Set:** Ranked items
```javascript
await redis.zadd('leaderboard', score, userId);
await redis.zrevrange('leaderboard', 0, 9); // Top 10
```

---

## Current Usage in Atlas

### 1. Rate Limiting (MongoDB → Redis Migration Planned)

**Current (MongoDB):**
```typescript
// Check rate limit
const record = await RateLimitModel.findOne({ userId, endpoint });
if (record.count >= limit) throw TooManyRequests;

// Increment
record.count++;
await record.save();

// Problem: 10-50ms per check (slow)
```

**Future (Redis):**
```typescript
// Atomic increment with expiry
const count = await redis.incr(`rate_limit:${userId}:${endpoint}`);
if (count === 1) {
  await redis.expire(`rate_limit:${userId}:${endpoint}`, windowSeconds);
}
if (count > limit) throw TooManyRequests;

// Benefit: <1ms per check (100x faster)
```

### 2. Idempotency Cache (MongoDB → Redis Migration Planned)

**Current (MongoDB):**
```typescript
// Check if operation already processed
const existing = await IdempotencyModel.findOne({ key });
if (existing) return existing.result;

// Problem: 10-50ms per check
```

**Future (Redis):**
```typescript
// Check cache
const cached = await redis.get(`idempotency:${key}`);
if (cached) return JSON.parse(cached);

// Store result
await redis.setex(`idempotency:${key}`, 86400, JSON.stringify(result));

// Benefit: <1ms per check
```

### 3. Background Jobs (Already Using Redis)

**Python RQ:**
```python
# ai-service/app/jobs/ingestion.py
from redis import Redis
from rq import Queue

redis_conn = Redis(host='redis', port=6379)
queue = Queue('pdf_ingestion', connection=redis_conn)

# Enqueue job
queue.enqueue(process_pdf, pdf_id, user_id)
```

**Why Redis for Queues:**
- Fast enqueue/dequeue (<1ms)
- Atomic operations (no duplicate processing)
- Built-in retry/failure handling
- Job persistence (survives worker crashes)

### 4. Future: Catalog Caching

**Pattern:**
```typescript
// Check cache
const cached = await redis.get('catalog:home');
if (cached) return JSON.parse(cached);

// Cache miss: Query database
const products = await Product.find({ featured: true });

// Store in cache (TTL 60 seconds)
await redis.setex('catalog:home', 60, JSON.stringify(products));

return products;
```

**Benefit:** 
- Cache hit: <1ms (100x faster)
- Cache miss: 50ms (same as before)
- Result: 99% of requests served from cache

---

## Alternatives Considered

### 1. MongoDB for Everything

**Pros:**
- One database (simpler infrastructure)
- Familiar to team

**Cons:**
- **Too slow for rate limiting** (10-50ms vs <1ms)
- **No atomic increment** (requires transactions)
- **Manual TTL cleanup** (background job needed)
- **Wrong tool for job** (disk-based DB for in-memory data)

**Why Not:** MongoDB is optimized for durable storage, not ephemeral data. Using MongoDB for rate limiting is like using a car to deliver mail—it works, but a bicycle is better suited.

### 2. Memcached

**Pros:**
- Simple key-value store
- Fast (<1ms)
- Less memory than Redis

**Cons:**
- **No persistence** (data lost on restart)
- **No atomic operations** (no INCR/DECR)
- **No TTL per key** (global expiration only)
- **No data structures** (only strings)
- **No pub/sub** (no real-time features)

**Why Not:** Memcached is simpler but less capable. Redis has all of Memcached's benefits plus persistence, atomic ops, TTL, data structures. No reason to use Memcached over Redis.

**When Memcached Would Be Better:**
- If we only needed simple key-value cache
- If memory is extremely constrained
- If we never need persistence

### 3. In-Memory Map (Node.js)

**Approach:**
```typescript
const rateLimits = new Map<string, number>();
```

**Pros:**
- No external dependency
- Fastest possible (<0.1ms)

**Cons:**
- **Not shared across processes** (each Node instance has own map)
- **Lost on restart** (no persistence)
- **No TTL** (manual cleanup needed)
- **Memory leak risk** (unbounded growth)

**Why Not:** Works for single-instance development but breaks in production with multiple servers. Redis provides shared state across all instances.

### 4. DynamoDB (AWS)

**Pros:**
- Managed service (no ops)
- Auto-scaling
- Low latency (single-digit ms)

**Cons:**
- **Vendor lock-in** (AWS-specific)
- **Cost:** $0.25 per million requests = $250/month at 1B requests
- **Complexity:** Capacity units, provisioning
- **Overkill:** More complex than needed

**Why Not:** DynamoDB is great at scale but adds complexity and cost. Redis is simpler for our scale (<1M req/day).

**When DynamoDB Would Be Better:**
- Already heavily invested in AWS
- Need multi-region active-active
- Scale > 10M req/sec
- Budget for managed services

---

## Rationale

### Data Categorization

| Data Type | Storage | Why |
|-----------|---------|-----|
| **User accounts** | MongoDB | Durable, relational |
| **Orders** | MongoDB | Durable, relational |
| **Product catalog** | MongoDB | Durable, queryable |
| **PDF embeddings** | PostgreSQL+pgvector | Durable, vector search |
| **Conversation embeddings** | Qdrant | Vector search optimized |
| **Rate limit counters** | Redis | Fast, ephemeral, atomic |
| **Idempotency cache** | Redis | Fast, temporary (24h TTL) |
| **Job queues** | Redis | Fast, temporary, atomic |
| **Session tokens** | Redis (future) | Fast, temporary (TTL) |

**Rule of Thumb:**
- **Permanent data** → MongoDB/PostgreSQL
- **Temporary data (<24h)** → Redis
- **Vector data** → Qdrant/pgvector

### Performance Targets

| Operation | Target Latency | Storage |
|-----------|----------------|---------|
| Rate limit check | < 1ms | Redis |
| Idempotency check | < 1ms | Redis |
| Enqueue job | < 1ms | Redis |
| Cache lookup | < 1ms | Redis |
| Order lookup | < 10ms | MongoDB |
| Product search | < 50ms | MongoDB |

---

## Tradeoffs

### What We Gain

- ✅ **Fast operations** (<1ms for rate limiting, caching)
- ✅ **Atomic operations** (no race conditions)
- ✅ **Automatic expiration** (TTL, no manual cleanup)
- ✅ **Rich data structures** (strings, hashes, lists, sets, sorted sets)
- ✅ **Job queue support** (Python RQ)
- ✅ **Simple deployment** (one Docker container)

### What We Lose

- ❌ **Another service to manage** (Redis + MongoDB + PostgreSQL + Qdrant)
- ❌ **Memory constraints** (Redis stores data in RAM)
- ❌ **Not queryable like SQL** (no complex queries)
- ❌ **Durability tradeoff** (in-memory, can lose data on crash)

### What It Costs

- **Memory:** ~100MB for rate limiting + idempotency (1M users)
- **Operations:** Single Redis instance handles 100k req/sec
- **Development:** Learning Redis commands and patterns
- **Infrastructure:** One more container to deploy

---

## Consequences

### Positive

1. **Rate limiting 100x faster** (50ms → 0.5ms)
2. **Idempotency checks 100x faster** (50ms → 0.5ms)
3. **No race conditions** (atomic operations)
4. **No memory leaks** (automatic TTL expiration)
5. **Simpler code** (no manual cleanup jobs)

### Negative

1. **Data loss on crash** (if not configured for persistence)
2. **Memory limits** (cannot store unlimited data)
3. **Learning curve** (team must learn Redis patterns)

### Neutral

1. **Another service** (more infrastructure, but necessary)

---

## Redis Configuration

### Development (docker-compose.yml)

```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
  command: redis-server --appendonly yes
```

**Key Settings:**
- `appendonly yes`: Enable persistence (AOF - Append Only File)
- Volume mount: Persist data across restarts

### Production Recommendations

**Option 1: Self-Hosted (AWS EC2)**
```yaml
# Redis with persistence
redis:
  image: redis:7
  command: >
    redis-server
    --appendonly yes
    --appendfsync everysec
    --maxmemory 2gb
    --maxmemory-policy allkeys-lru
```

**Settings:**
- `appendonly yes`: Persist to disk (durability)
- `appendfsync everysec`: Sync to disk every second (balance speed/durability)
- `maxmemory 2gb`: Limit memory usage
- `maxmemory-policy allkeys-lru`: Evict least recently used keys when full

**Option 2: Managed Service**
- AWS ElastiCache (Redis)
- Redis Labs Cloud
- Azure Cache for Redis

**Benefits:**
- Automatic backups
- High availability (replica sets)
- Auto-scaling
- Monitoring included

**Cost:** ~$50-200/month depending on size

---

## When Would We Change This Decision?

### Triggers to Stop Using Redis

1. **Redis Becomes Bottleneck**
   - Example: > 100k req/sec, Redis maxed out
   - Mitigation: Redis Cluster (shard data across multiple instances)
   - Alternative: Migrate to DynamoDB (scales higher)

2. **Team Cannot Maintain Redis**
   - Example: No one knows Redis, outages frequent
   - Mitigation: Migrate to managed service (ElastiCache)
   - Alternative: Move simpler use cases back to MongoDB

3. **Memory Costs Too High**
   - Example: Redis using > 10GB RAM, expensive
   - Mitigation: Use maxmemory policy, evict old data
   - Alternative: Move less-critical data to MongoDB

### Triggers to Expand Redis Usage

1. **Need Real-Time Features**
   - Example: Live notifications, chat
   - Solution: Use Redis Pub/Sub
   - Alternative: WebSockets + Redis for message broker

2. **Need Session Management**
   - Example: Move from stateless JWT to stateful sessions
   - Solution: Store sessions in Redis (fast, TTL, shared across servers)

3. **Need Distributed Locks**
   - Example: Prevent concurrent job processing
   - Solution: Redis SETNX (set if not exists)

---

## Migration Path

### Phase 1: Background Jobs (Complete ✅)
- RQ already using Redis for job queues

### Phase 2: Rate Limiting (Future)
- Migrate from MongoDB to Redis
- 100x faster, no code changes to guard

### Phase 3: Idempotency (Future)
- Migrate from MongoDB to Redis
- 100x faster, simpler code

### Phase 4: Catalog Caching (Future)
- Add cache layer for featured products
- Reduce database load by 90%

---

## Interview Answer

**Q: "Why do you use both MongoDB and Redis?"**

**A:** "They serve different purposes. MongoDB is for durable, queryable data—user accounts, orders, product catalog. It's disk-based, supports complex queries, and provides ACID transactions. Redis is for ephemeral, high-speed data—rate limiting counters, idempotency cache, job queues. It's in-memory, provides sub-millisecond latency, and supports atomic operations with TTL.

For example, rate limiting checks happen on every request and must be <1ms to not slow down the system. MongoDB averages 10-50ms per query—too slow. Redis averages <1ms—perfect fit. The tradeoff is Redis stores data in RAM (expensive, limited capacity) and can lose data on crash. That's fine for rate limiting (counters reset is acceptable) but not for orders (permanent records).

We use the right tool for each job: MongoDB for permanent data, Redis for temporary data, Qdrant for vector search, PostgreSQL for relational+vector hybrid. Each optimized for its workload."

---

## References

- [Redis Documentation](https://redis.io/documentation)
- [Redis vs Memcached](https://aws.amazon.com/elasticache/redis-vs-memcached/)
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)
- [Atomic Operations in Redis](https://redis.io/commands/incr/)

---

**Last Updated:** 2024-04  
**Next Review:** When rate limiting or caching becomes bottleneck
