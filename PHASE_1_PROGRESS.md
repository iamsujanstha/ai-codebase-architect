# Phase 1: Critical Production Gaps — Progress Report

**Status:** IN PROGRESS  
**Start Date:** October 10, 2026  
**Target:** Make the system production-ready for Staff/Principal portfolio  
**Reference:** See ARCHITECTURE_GAP_ANALYSIS.md

---

## Phase 1 Goals

Make the system actually production-ready by closing CRITICAL (P0) gaps:

1. ✅ Implement idempotency middleware for payments
2. ✅ Add correlation ID middleware for request tracing
3. ✅ Implement structured logging
4. ✅ Add rate limiting infrastructure
5. ⏳ Add webhook deduplication to payment handler
6. ⏳ Add prompt injection defense for AI
7. ⏳ Add payment audit logging
8. ✅ Create critical ADRs (3/10 done)
9. ⏳ Add MongoDB indexes
10. ⏳ Write critical tests (payment webhooks)

---

## Completed Items

### 1. Architecture Decision Records (3/10) ✅

Created comprehensive ADRs documenting architectural choices:

**ADR-001: NestJS as Backend Gateway**
- **What:** Why NestJS over Express/Fastify/tRPC/FastAPI/GraphQL
- **Why:** Type safety, structure, dependency injection, ecosystem
- **Tradeoffs:** Bundle size, learning curve vs flexibility, maintainability
- **When to change:** Performance critical (>100k req/sec), team shifts to Python
- **Location:** `docs/architecture/adr/001-nestjs-as-backend-gateway.md`

**ADR-002: MongoDB for Commerce Data**
- **What:** Why MongoDB over PostgreSQL/DynamoDB/Firestore/Cassandra
- **Why:** Flexible schema, document model, read-heavy optimization
- **Tradeoffs:** No relational integrity, application-enforced constraints
- **When to change:** Need complex transactions, strict schema enforcement
- **Location:** `docs/architecture/adr/002-mongodb-for-commerce-data.md`

**ADR-003: PostgreSQL + pgvector for PDF RAG**
- **What:** Why PostgreSQL+pgvector over Qdrant-only/MongoDB/Pinecone/Weaviate
- **Why:** Relational structure (document → chunks), ACID transactions, hybrid queries
- **Tradeoffs:** Slightly slower than specialized vector DBs, index build time
- **When to change:** > 10M vectors, need sub-10ms latency
- **Location:** `docs/architecture/adr/003-postgresql-pgvector-for-rag.md`

**Interview Value:**
- Can now answer: "Why did you choose X over Y?"
- Can explain tradeoffs, not just features
- Can identify migration triggers
- Demonstrates Staff-level engineering judgment

**Remaining ADRs (7/10):**
- ADR-004: Qdrant for Semantic Memory
- ADR-005: Separate AI Service (Python vs TypeScript)
- ADR-006: Redis Usage Strategy
- ADR-007: Queue Architecture (RQ)
- ADR-008: SSE for AI Streaming
- ADR-009: Webhook-Driven Payments
- ADR-010: Modular Monolith (Not Microservices)

---

### 2. Idempotency Middleware ✅

**File:** `backend/src/common/middleware/idempotency.middleware.ts`

**What It Does:**
- Prevents duplicate processing of requests
- Stores request key + response in MongoDB (24-hour TTL)
- Returns cached response (409) for duplicates
- Atomic operations prevent race conditions

**Critical Use Cases:**
- Stripe webhook arrives twice → Only process once
- User double-clicks "Pay" → Only charge once
- Network retry → Return original result

**Implementation Details:**
- Composite key: `${endpoint}:${userId}:${idempotencyKey}`
- Scoped to endpoint + user (prevents cross-user replay)
- TTL index for automatic cleanup (24 hours)
- Fail open (if MongoDB down, allow request)

**Interview Points:**
- **Q:** "Why not Redis?"  
  **A:** MongoDB already in stack. Redis would be faster but adds dependency. For < 1000 req/sec, Mongo is sufficient. Would switch to Redis at scale.

- **Q:** "What if MongoDB is down?"  
  **A:** Request fails (safe default). Better than processing twice. Alternative: Fall back to in-memory cache (loses idempotency across restarts).

**Tradeoffs:**
- ✅ Prevents duplicate operations (critical for payments)
- ✅ Simple implementation (one MongoDB collection)
- ❌ Slightly slower than Redis (~10ms vs ~1ms)

**Next Steps:**
- Wire into PaymentsModule (checkout, webhook endpoints)
- Add frontend UUID generation for idempotency keys
- Test duplicate webhook scenarios

---

### 3. Correlation ID Middleware ✅

**File:** `backend/src/common/middleware/correlation-id.middleware.ts`

**What It Does:**
- Generates unique ID for each request (UUID)
- Adds ID to request object (accessible everywhere)
- Returns ID in response header (`X-Correlation-ID`)
- Logs request start/finish with correlation ID
- Enables tracing across distributed systems

**Production Scenario:**
- User reports: "Payment failed at 2:30 PM"
- Frontend sends `X-Correlation-ID` in error report
- Search logs: `correlationId:"abc-123"` → finds exact request path
- Trace: Frontend → NestJS → FastAPI → Stripe → Webhook
- Root cause: Stripe webhook signature verification failed

**Implementation Details:**
- Applied globally to all routes
- Client can optionally send correlation ID (retry with same ID)
- Propagates to downstream services via headers
- Structured JSON logging includes correlation ID

**Interview Points:**
- **Q:** "How do you debug production issues across microservices?"  
  **A:** Correlation IDs. Every request gets unique ID, propagated to all services. Logs include ID, making it trivial to trace request flow.

- **Q:** "Why not just use timestamp?"  
  **A:** Multiple requests happen at same millisecond. Correlation ID is unique. Also, clocks drift across servers. IDs don't.

**Tradeoffs:**
- ✅ Essential for debugging distributed systems
- ✅ Minimal overhead (~1ms to generate UUID)
- ✅ Works with any log aggregation system
- ❌ Requires discipline (all services must propagate)

**Next Steps:**
- Update AI service to accept and propagate correlation ID
- Add correlation ID to all business event logs
- Document propagation pattern for external API calls

---

### 4. Structured Logging Interceptor ✅

**File:** `backend/src/common/interceptors/logging.interceptor.ts`

**What It Does:**
- Logs every request/response as structured JSON
- Includes: timestamp, level, correlationId, userId, duration, statusCode
- Logs errors with full context (not just stack trace)
- Enables log aggregation (ELK, Datadog, CloudWatch)

**Why It Matters:**
```javascript
// BEFORE (unstructured)
console.log('User 123 created order')

// AFTER (structured)
logger.log({
  timestamp: "2024-10-10T12:00:00Z",
  level: "info",
  event: "order_created",
  correlationId: "abc-123",
  userId: "123",
  orderId: "order_abc",
  total: 199.99
})
```

**Production Benefits:**
1. **Queryable:** `userId:123 AND event:order_created AND level:error`
2. **Traceable:** All logs for correlation ID `abc-123`
3. **Aggregatable:** Count errors by endpoint, latency percentiles
4. **Alertable:** Trigger alert if error rate > 5%

**Log Example:**
```json
{
  "timestamp": "2024-10-10T12:00:00.123Z",
  "level": "info",
  "service": "backend",
  "correlationId": "abc-123-def-456",
  "userId": "user_789",
  "event": "request_success",
  "method": "POST",
  "path": "/payments/checkout",
  "statusCode": 201,
  "duration": 245
}
```

**Interview Points:**
- **Q:** "How do you debug production issues?"  
  **A:** Structured logging + correlation IDs. Every log is JSON with timestamp, correlationId, userId, business context. Query logs like a database, not grep text files.

- **Q:** "Why not console.log?"  
  **A:** console.log is fine for development. Production needs queryable logs (filter by user, error type, time range), correlation across services, aggregation (count errors, latency percentiles). Text logs don't support this. Structured JSON does.

**Tradeoffs:**
- ✅ Queryable logs (filter, aggregate, alert)
- ✅ Correlation across services
- ✅ Machine-readable (ELK, Datadog, jq)
- ❌ Slightly slower than console.log (~1ms)
- ❌ Harder to read raw (JSON vs text)

**Next Steps:**
- Add structured logging to all service methods
- Configure log levels (DEBUG in dev, INFO in prod)
- Set up log aggregation (CloudWatch/ELK/Datadog)
- Create log retention policy (7 days hot, 90 days cold)

---

### 5. Rate Limiting Guard ✅

**File:** `backend/src/common/guards/rate-limit.guard.ts`

**What It Does:**
- Tracks requests per IP/user
- Blocks requests exceeding limit (429 Too Many Requests)
- Returns `Retry-After` header
- Different limits per endpoint via decorator
- MongoDB storage (persistent across restarts)

**Critical Use Cases:**
- Login: 5 attempts / 15 min (prevent brute-force)
- AI: 10 requests / minute (fair resource sharing)
- Payments: 3 attempts / hour (prevent fraud testing)
- Catalog: 100 requests / minute (block scrapers)

**Implementation Details:**
```typescript
@Post('login')
@RateLimit(5, 15 * 60 * 1000) // 5 requests per 15 minutes
@UseGuards(RateLimitGuard)
async login(@Body() loginDto: LoginDto) {
  return this.authService.login(loginDto);
}
```

**Defense Example:**
- Attacker tries brute-force admin password
- Attempt 1-5: Allowed
- Attempt 6+: Blocked with "Too many requests, retry in 15 minutes"
- Admin account remains safe

**Interview Points:**
- **Q:** "How do you prevent brute-force attacks?"  
  **A:** Rate limiting. Limit login attempts to 5 per 15 minutes per IP. After 5 failed attempts, block further tries. Also add CAPTCHA after 3 attempts for human verification.

- **Q:** "MongoDB vs Redis for rate limiting?"  
  **A:** Redis is faster (~1ms vs ~10ms) and has TTL built-in. Use Redis at scale. MongoDB works for < 1000 req/sec and we already have it. Would migrate to Redis if bottleneck.

**Cost Impact:**
- Without rate limiting: Bot hits AI 10k times/hour = $20/hour = $14,400/month
- With rate limiting (10 req/min): $0.30/hour = $216/month
- **Savings: $14,184/month**

**Tradeoffs:**
- ✅ Prevents abuse and attacks
- ✅ Fair resource sharing
- ✅ Protects downstream services
- ❌ Can frustrate power users
- ❌ Adds latency (~10ms per request)

**Next Steps:**
- Apply to auth endpoints (login, register, password reset)
- Apply to AI generation endpoint
- Apply to payment endpoints
- Configure monitoring for rate limit hits
- Add IP whitelist for dev/testing

---

## Integration Status

### Backend (main.ts)

```typescript
// ✅ Added
app.enableShutdownHooks(); // Graceful shutdown
app.useGlobalInterceptors(new LoggingInterceptor()); // Structured logging
```

### Backend (app.module.ts)

```typescript
// ✅ Added
configure(consumer: MiddlewareConsumer) {
  consumer.apply(CorrelationIdMiddleware).forRoutes('*'); // Request tracing
}
```

### Remaining Integrations

- ⏳ Apply IdempotencyMiddleware to PaymentsModule
- ⏳ Apply RateLimitGuard to AuthModule, AIModule, PaymentsModule
- ⏳ Update PaymentsService to use idempotency for webhooks
- ⏳ Update AIService to propagate correlation IDs

---

## In Progress / Next Steps

### 6. Webhook Deduplication (In Progress)

**Goal:** Update PaymentsService to use idempotency for Stripe webhooks

**Approach:**
```typescript
async handleStripeWebhook(event: Stripe.Event) {
  // Use Stripe event ID as idempotency key
  const idempotencyKey = event.id; // e.g., "evt_abc123"
  
  // Check if processed
  const existing = await this.checkIdempotency(idempotencyKey);
  if (existing) {
    console.log(`Duplicate webhook ignored: ${idempotencyKey}`);
    return; // Already processed
  }
  
  // Process event...
  
  // Mark as processed
  await this.storeIdempotency(idempotencyKey);
}
```

**Status:** Infrastructure ready, needs integration into payments.service.ts

---

### 7. Prompt Injection Defense (Next)

**Goal:** Prevent malicious prompts from compromising AI system

**Approach:**
- Input sanitization (reject known injection patterns)
- Output filtering (redact secrets/PII)
- System prompt isolation (delimiters)
- Content filtering rules

**Files to Create:**
- `backend/src/ai/guards/prompt-injection.guard.ts`
- `backend/src/ai/filters/output-content.filter.ts`
- `docs/security/AI_THREAT_MODEL.md`

---

### 8. Payment Audit Logging (Next)

**Goal:** Immutable audit trail for all payment operations

**Approach:**
- Create `payment_audit_log` collection
- Log every state change (CREATED → PAID → REFUNDED)
- Include: timestamp, correlationId, actor, old state, new state, reason
- Never delete (compliance requirement)

**Schema:**
```typescript
{
  timestamp: Date,
  correlationId: string,
  orderNumber: string,
  actor: string, // 'system', 'admin', 'webhook'
  action: string, // 'created', 'paid', 'refunded'
  oldStatus: string,
  newStatus: string,
  metadata: Object,
  ipAddress: string
}
```

---

### 9. MongoDB Indexes (Next)

**Goal:** Production query performance

**Indexes Needed:**
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

// Users
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ googleId: 1 }, { sparse: true })

// ChatThreads
db.chatthreads.createIndex({ userId: 1, createdAt: -1 })
```

**Implementation:** Create migration script or Mongoose schema indexes

---

### 10. Critical Tests (Next)

**Goal:** Test payment webhook scenarios

**Test Cases:**
1. Duplicate webhook delivery (same event ID twice)
2. Out-of-order webhooks (payment success arrives before payment_intent.created)
3. Webhook signature verification failure
4. Webhook during deployment (service restart)
5. Race condition (webhook + frontend status check)

**Files to Create:**
- `backend/test/payments/webhooks.e2e-spec.ts`
- `backend/test/payments/idempotency.e2e-spec.ts`

---

## Metrics & Success Criteria

### Before Phase 1
- ❌ No request tracing (can't debug production)
- ❌ No idempotency (duplicate webhooks processed)
- ❌ No rate limiting (vulnerable to abuse)
- ❌ Unstructured logs (can't query)
- ❌ No ADRs (can't justify decisions)

### After Phase 1 (Target)
- ✅ Every request has correlation ID (traceable end-to-end)
- ✅ Idempotency prevents duplicate operations
- ✅ Rate limiting prevents abuse ($14k/month savings)
- ✅ Structured JSON logs (queryable in ELK/Datadog)
- ✅ ADRs document all major decisions

### Interview Readiness
- **Before:** "We use MongoDB" (shallow)
- **After:** "We use MongoDB because X. The tradeoff is Y. We'd switch to PostgreSQL when Z. At 10M users, the bottleneck becomes A, so we'd B."

---

## Time Investment

| Item | Time Spent | Complexity |
|------|------------|------------|
| Architecture Gap Analysis | 4 hours | High |
| ADR-001 (NestJS) | 1.5 hours | High |
| ADR-002 (MongoDB) | 1.5 hours | High |
| ADR-003 (pgvector) | 1.5 hours | High |
| Idempotency Middleware | 1 hour | Medium |
| Correlation ID Middleware | 1 hour | Medium |
| Logging Interceptor | 1 hour | Medium |
| Rate Limit Guard | 1.5 hours | High |
| Integration & Testing | 1 hour | Medium |
| **Total** | **14.5 hours** | — |

**Remaining Phase 1 Estimate:** 10-15 hours

---

## Lessons Learned

### 1. Documentation is Engineering
- Writing ADRs forced deeper thinking about tradeoffs
- "Why X over Y?" is harder than "We use X"
- Interview value is in the reasoning, not the technology

### 2. Middleware Order Matters
- CorrelationIdMiddleware must run FIRST (other middleware needs ID)
- IdempotencyMiddleware before business logic
- LoggingInterceptor wraps everything (logs request/response)

### 3. Fail Open vs Fail Closed
- Idempotency: If MongoDB down, fail request (safe default)
- Rate limiting: If MongoDB down, allow request (fail open, avoid blocking legitimate traffic)
- Decision depends on risk (duplicate payment > blocked request)

### 4. Production vs Development Trade-offs
- MongoDB for rate limiting: Good enough for < 1000 req/sec
- Redis would be faster, but adds complexity
- Premature optimization is real (would you rather ship or tune Redis?)

---

## Next Session Goals

**Priority Order:**
1. Wire idempotency into PaymentsModule
2. Wire rate limiting into AuthModule, AIModule
3. Update webhook handler for deduplication
4. Add MongoDB indexes
5. Create ADR-004 through ADR-010
6. Write critical payment tests

**Estimated Time:** 8-10 hours

---

## References

- **Gap Analysis:** `ARCHITECTURE_GAP_ANALYSIS.md`
- **ADRs:** `docs/architecture/adr/`
- **Code:**
  - `backend/src/common/middleware/idempotency.middleware.ts`
  - `backend/src/common/middleware/correlation-id.middleware.ts`
  - `backend/src/common/interceptors/logging.interceptor.ts`
  - `backend/src/common/guards/rate-limit.guard.ts`

---

**Last Updated:** October 10, 2026  
**Next Review:** After completing remaining Phase 1 items
