# ADR-010: Modular Monolith (Not Microservices)

**Status:** Accepted  
**Date:** 2024-04  
**Decision Makers:** Architecture Team  
**Related:** ADR-001 (NestJS Backend), ADR-005 (Python AI Service)

---

## Context

We are building an AI-powered e-commerce platform with multiple domains:
- User management (auth, profiles)
- Product catalog (listings, search)
- Payments (checkout, webhooks)
- Orders (cart, history)
- AI generation (chat, PDF RAG)
- Admin dashboard

### The Question

**Should we build microservices or a monolith?**

This is one of the most critical architectural decisions—it affects:
- Development velocity
- Deployment complexity
- Team structure
- Operational overhead
- Cost

### Requirements

1. **Clear domain boundaries** (catalog ≠ payments ≠ AI)
2. **Independent deployability** (deploy AI without touching catalog)
3. **Technology flexibility** (Python for AI, TypeScript for business logic)
4. **Testability** (test domains in isolation)
5. **Team scalability** (support 2-20 engineers)

### Constraints

- Current team: 1-2 engineers
- Scale: <1000 req/sec
- Budget: Minimize infrastructure cost
- Complexity: Keep it simple

---

## Decision

**We use a Modular Monolith with strategic service separation.**

### Architecture

```
Frontend (React + Vite)
  ↓
──────────────────────────────────────
Modular Monolith (NestJS)
──────────────────────────────────────
├── Auth Module
├── Catalog Module
├── Payments Module
├── Orders Module
├── Admin Module
├── Mail Module
└── Common (guards, middleware, utils)
──────────────────────────────────────
  ↓
Separate AI Service (FastAPI)
- Reason: Different language (Python)
- Reason: Different scaling (GPU)
- Reason: Different team expertise
──────────────────────────────────────
```

**Not microservices. Not full monolith. Modular monolith.**

---

## What is a Modular Monolith?

**Modular Monolith:**
- Single deployable unit (one NestJS process)
- Clear module boundaries (catalog, payments, orders separate)
- Shared database (MongoDB)
- Inter-module communication via direct function calls
- Deployment: One Docker container

**vs Full Monolith:**
- Full monolith: Everything tangled, no boundaries
- Modular monolith: Clear modules, enforced boundaries

**vs Microservices:**
- Microservices: Separate processes, network calls
- Modular monolith: Single process, function calls

### Module Structure

```typescript
// backend/src/catalog/catalog.module.ts
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService], // Other modules can use
})
export class CatalogModule {}

// backend/src/payments/payments.module.ts
@Module({
  imports: [
    CatalogModule, // Import catalog module (direct call)
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {
  constructor(
    private readonly catalogService: CatalogService, // Direct injection
  ) {}
}
```

**Module Communication:**
```typescript
// Modular Monolith (direct call)
async createPayment(items: CartItem[]) {
  // Validate products (direct call to catalog)
  const products = await this.catalogService.validateProducts(items);
  
  // Create order
  const order = await this.createOrder(products);
  
  return order;
}

// Microservices (network call)
async createPayment(items: CartItem[]) {
  // HTTP call to catalog service
  const products = await axios.post('http://catalog-service/validate', items);
  
  // Create order
  const order = await this.createOrder(products);
  
  return order;
}
```

---

## Why Modular Monolith?

### 1. Simplicity

**Modular Monolith:**
```bash
# Single deployment
docker build -t backend .
docker run backend

# Single database connection
MONGODB_URI=mongodb://localhost/app

# Single log stream
docker logs backend
```

**Microservices:**
```bash
# Multiple deployments
docker build -t catalog-service .
docker build -t payment-service .
docker build -t order-service .
docker build -t user-service .
docker run catalog-service
docker run payment-service
docker run order-service
docker run user-service

# Multiple database connections
CATALOG_DB=mongodb://localhost/catalog
PAYMENT_DB=mongodb://localhost/payments
ORDER_DB=mongodb://localhost/orders
USER_DB=mongodb://localhost/users

# Aggregated log streams (ELK, Datadog)
docker logs catalog-service | send to ELK
docker logs payment-service | send to ELK
docker logs order-service | send to ELK
docker logs user-service | send to ELK
```

**Complexity:** 4x deployments, 4x databases, 4x log streams.

### 2. Performance

**Modular Monolith:**
```typescript
// Direct function call (~0.01ms)
const products = await this.catalogService.getProducts(ids);
const total = products.reduce((sum, p) => sum + p.price, 0);
```

**Microservices:**
```typescript
// HTTP call (~5-50ms)
const response = await axios.get('http://catalog-service/products', {
  params: { ids },
});
const products = response.data;
const total = products.reduce((sum, p) => sum + p.price, 0);
```

**Latency:** Function call is 500-5000x faster than HTTP call.

**Typical Request:**
```
Modular Monolith:
- Validate cart: 0.01ms (function call)
- Create order: 10ms (database)
- Create payment: 0.01ms (function call)
- Total: ~10ms

Microservices:
- Call catalog service: 10ms (network)
- Call order service: 10ms (network)
- Call payment service: 10ms (network)
- Each service calls database: 3 × 10ms = 30ms
- Total: ~60ms
```

**6x slower for same logic.**

### 3. Transaction Boundaries

**Modular Monolith:**
```typescript
// Single database transaction
async createOrder(userId: string, items: CartItem[]) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Decrement inventory
    await Product.updateMany(
      { _id: { $in: itemIds } },
      { $inc: { inventory: -quantities } },
      { session }
    );
    
    // Create order
    const order = await Order.create([{...}], { session });
    
    await session.commitTransaction();
    return order;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

**Microservices:**
```typescript
// Distributed transaction (Saga pattern)
async createOrder(userId: string, items: CartItem[]) {
  // Step 1: Reserve inventory
  try {
    await axios.post('http://catalog-service/inventory/reserve', items);
  } catch (error) {
    // Rollback not needed (no changes yet)
    throw error;
  }
  
  // Step 2: Create order
  let orderId;
  try {
    const response = await axios.post('http://order-service/orders', {...});
    orderId = response.data.id;
  } catch (error) {
    // Rollback: Release inventory
    await axios.post('http://catalog-service/inventory/release', items);
    throw error;
  }
  
  // Step 3: Charge payment
  try {
    await axios.post('http://payment-service/charge', { orderId, amount });
  } catch (error) {
    // Rollback: Cancel order, release inventory
    await axios.delete(`http://order-service/orders/${orderId}`);
    await axios.post('http://catalog-service/inventory/release', items);
    throw error;
  }
  
  return orderId;
}
```

**Complexity:** 
- Modular monolith: 15 lines (ACID transaction)
- Microservices: 40 lines (saga with compensating transactions)

### 4. Development Velocity

**Modular Monolith:**
```typescript
// Change payment logic
// Edit: backend/src/payments/payments.service.ts
// Run: npm run build && npm start
// Test: curl http://localhost:3000/payments/checkout
// Done: 30 seconds
```

**Microservices:**
```typescript
// Change payment logic
// Edit: payment-service/src/payment.service.ts
// Build: docker build -t payment-service .
// Deploy: kubectl apply -f payment-service-deployment.yaml
// Wait: Kubernetes rolls out new pods (2-5 minutes)
// Test: curl http://api-gateway/payments/checkout
// Debug: Check logs across multiple pods
// Done: 5-10 minutes
```

**10x slower feedback loop.**

### 5. Team Size

**Modular Monolith:**
- 1-2 engineers: Perfect
- 3-10 engineers: Great (modules as boundaries)
- 10-20 engineers: Good (may want to split some modules)
- 20+ engineers: Consider microservices

**Microservices:**
- 1-2 engineers: Too complex (spread too thin)
- 3-10 engineers: Manageable (1-2 engineers per service)
- 10+ engineers: Ideal (dedicated teams per service)

**Our team: 1-2 engineers → Modular monolith wins.**

---

## When We Use Separate Services

**We DO separate when:**

1. **Different Programming Language**
   - AI Service (Python) vs Backend (TypeScript)
   - Reason: Python has superior ML ecosystem

2. **Different Scaling Requirements**
   - AI Service: GPU, expensive
   - Backend: CPU, cheap
   - Reason: Don't waste GPU on catalog queries

3. **Different Team/Expertise**
   - AI Service: ML engineers
   - Backend: Full-stack engineers
   - Reason: Different skill sets

**We DON'T separate when:**
- Same language (all TypeScript)
- Similar scaling (all CPU-bound)
- Same team (full-stack engineers)

**Current Services:**
1. Backend (NestJS) - Auth, Catalog, Payments, Orders, Admin
2. AI Service (FastAPI) - LLM, RAG, embeddings
3. Frontend (React)

**NOT:**
- Auth Service
- Catalog Service  
- Payment Service
- Order Service
- Admin Service

---

## Alternatives Considered

### 1. Full Microservices

**Approach:**
```
Frontend
  ↓
API Gateway
  ├→ Auth Service (users, sessions)
  ├→ Catalog Service (products, search)
  ├→ Payment Service (checkout, webhooks)
  ├→ Order Service (cart, orders)
  ├→ AI Service (generation, RAG)
  └→ Admin Service (dashboard, analytics)
```

**Pros:**
- **Independent scaling** (scale catalog separately)
- **Independent deployment** (deploy payment without catalog)
- **Technology per service** (Go for catalog, Python for AI)
- **Team ownership** (dedicated team per service)
- **Failure isolation** (catalog crash doesn't affect payments)

**Cons:**
- **10x complexity** (6 services, 6 deployments, 6 databases)
- **Network latency** (every module call is HTTP call)
- **Distributed transactions** (Saga pattern, compensating transactions)
- **Data consistency** (eventual consistency, complex)
- **Operational overhead** (Kubernetes, service mesh, monitoring)
- **Development velocity** (slower local development, harder debugging)
- **Cost** ($100/month per service = $600/month vs $50 for monolith)

**Why Not:** We're at <1000 req/sec with 1-2 engineers. Microservices add 10x complexity for benefits we don't need yet.

**When Microservices Would Be Better:**
- Team > 20 engineers (need independent teams)
- Scale > 10k req/sec per service (independent scaling critical)
- Services have vastly different scaling needs (1M catalog req/sec, 10 payment req/sec)
- Services need different tech stacks (Go, Java, Python, all required)

### 2. Full Monolith (No Modules)

**Approach:**
```typescript
// Everything in one giant service class
class ApplicationService {
  async handleRequest(req) {
    // Auth logic mixed with...
    // ... catalog logic mixed with...
    // ... payment logic mixed with...
    // ... order logic mixed with...
    // Spaghetti code
  }
}
```

**Pros:**
- **Simplest to start** (no module boundaries)
- **Fastest to build** (no architectural overhead)

**Cons:**
- **Becomes unmaintainable** (spaghetti code)
- **Hard to test** (everything coupled)
- **Hard to reason about** (no boundaries)
- **Can't scale team** (everyone works in same file)
- **Merge conflicts** (everyone touches same code)

**Why Not:** Short-term gain, long-term pain. Modular monolith has same simplicity with better structure.

### 3. Modular Microservices (Hybrid)

**Approach:**
```
Frontend
  ↓
Backend Monolith
  ├── Auth Module
  ├── Catalog Module
  ├── Payments Module (could be separate)
  └── Orders Module
  ↓
AI Service (separate)
Payment Service (separate, if needed)
```

**Pros:**
- **Start simple, extract when needed**
- **Low initial complexity**
- **Can scale specific parts**

**Cons:**
- **Partial network overhead** (some calls are HTTP, some are direct)
- **Inconsistent patterns** (mixing styles is confusing)

**Why Not:** This is our FUTURE strategy, not current. We start with modular monolith, extract services when proven necessary.

**Migration Path:**
```
Phase 1 (Now): Modular Monolith + AI Service
Phase 2 (1k req/sec): Same (no need to change)
Phase 3 (10k req/sec): Extract catalog if it's bottleneck
Phase 4 (100k req/sec): Extract more services as needed
```

---

## Rationale

### Scale vs Complexity Trade-off

| Team Size | Request Rate | Architecture | Why |
|-----------|--------------|--------------|-----|
| **1-2 engineers** | < 1k req/sec | **Modular Monolith** | Max velocity, min ops |
| 3-5 engineers | 1k-10k req/sec | Modular Monolith | Still simple enough |
| 5-10 engineers | 10k-50k req/sec | Hybrid (extract bottlenecks) | Scale what's needed |
| 10-20 engineers | 50k-100k req/sec | Mostly Microservices | Team needs boundaries |
| 20+ engineers | 100k+ req/sec | Full Microservices | Org structure matches |

**We're at 1-2 engineers, <1k req/sec → Modular Monolith is optimal.**

### When to Extract a Service

**Decision Tree:**
```
Is this module a bottleneck?
  No → Keep in monolith
  Yes ↓
    
Can we optimize within monolith?
  Yes → Optimize (add caching, indexes)
  No ↓
    
Does it scale differently? (CPU vs GPU)
  No → Keep in monolith
  Yes ↓
    
Is operational cost worth it?
  No → Keep in monolith
  Yes ↓
    
Extract to separate service
```

**Examples:**
- **AI Service:** Different language (Python), different scaling (GPU), different team → Extract ✅
- **Catalog:** Same language, same scaling, same team → Keep in monolith ✅
- **Payments:** Same language, same scaling, same team → Keep in monolith ✅

### Cost Analysis

**Modular Monolith:**
```
Backend: 1 server × $50/month = $50
AI Service: 1 server × $100/month = $100
Total: $150/month
```

**Microservices:**
```
API Gateway: $50/month
Auth Service: $50/month
Catalog Service: $50/month
Payment Service: $50/month
Order Service: $50/month
Admin Service: $50/month
AI Service: $100/month
Service Mesh (Istio): $50/month
Load Balancer: $50/month
Total: $500/month
```

**3.3x more expensive for same functionality.**

---

## Tradeoffs

### What We Gain

- ✅ **Simplicity** (single deployment, single database)
- ✅ **Performance** (function calls, not HTTP)
- ✅ **ACID transactions** (single database)
- ✅ **Fast development** (30-second feedback loop)
- ✅ **Low cost** ($150/month vs $500)
- ✅ **Easy debugging** (single log stream)
- ✅ **Team velocity** (optimal for 1-2 engineers)

### What We Lose

- ❌ **Independent scaling** (scale entire backend, not parts)
- ❌ **Technology per module** (all modules use TypeScript)
- ❌ **Failure isolation** (one module crash affects all)
- ❌ **Independent deployment** (deploy entire backend)

### What It Costs

- **Discipline:** Must enforce module boundaries
- **Coupling risk:** Modules can call each other (must resist)
- **Future migration:** May need to extract services later

---

## Consequences

### Positive

1. **Fast development** (changes deploy in 30 seconds)
2. **Easy debugging** (single process, single log)
3. **Low operational overhead** (no Kubernetes, no service mesh)
4. **Low cost** ($150/month infrastructure)
5. **Team can stay small** (1-2 engineers effective)

### Negative

1. **Cannot scale modules independently** (must scale entire backend)
2. **All modules share same tech stack** (cannot mix Go/Java/Python in backend)
3. **Deployment is all-or-nothing** (cannot deploy catalog without payments)

### Neutral

1. **Module boundaries require discipline** (enforced by code review)

---

## Module Boundaries (Enforcement)

### 1. Import Rules

```typescript
// ✅ ALLOWED: Module imports common utilities
import { Logger } from '../common/logger';

// ✅ ALLOWED: Module imports another module's service
import { CatalogService } from '../catalog/catalog.service';

// ❌ FORBIDDEN: Module imports another module's internal class
import { ProductRepository } from '../catalog/product.repository';
// Use CatalogService instead

// ❌ FORBIDDEN: Circular dependency
// catalog → payments → catalog (BREAK THIS)
```

**Enforcement:** ESLint rule (dependency-cruiser)

### 2. Database Access

```typescript
// ✅ ALLOWED: Module owns its schemas
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
})

// ❌ FORBIDDEN: Module directly queries another module's schemas
async someMethod() {
  // Don't do this:
  const products = await Product.find({...});
  
  // Do this instead:
  const products = await this.catalogService.getProducts(ids);
}
```

**Rule:** Modules own their data, other modules use services.

### 3. Module Exports

```typescript
// catalog.module.ts
@Module({
  exports: [CatalogService], // Public API
})

// Exposed:
// - CatalogService (methods like getProducts, validateProducts)

// Not exposed:
// - ProductRepository (internal implementation)
// - Product schema (internal data structure)
```

**Rule:** Export service, not implementation details.

---

## Migration Strategy (Future)

### When to Extract Catalog Service

**Trigger:** Catalog becomes bottleneck (most requests, slow)

**Approach:**
```
Step 1: Identify boundaries
  - CatalogService is already modular
  - API is already defined

Step 2: Create new service
  - New repo: catalog-service
  - Copy CatalogModule
  - Run as separate process

Step 3: Add HTTP API
  - NestJS controllers → RESTful API
  - Same endpoints, different port

Step 4: Update backend
  - CatalogService → CatalogClient (HTTP calls)
  - Keep same interface (minimal changes)

Step 5: Deploy
  - Deploy catalog-service
  - Deploy updated backend
  - Switch traffic

Step 6: Remove from monolith
  - Delete CatalogModule from backend
  - Only CatalogClient remains
```

**Time:** 1-2 weeks (because modules are already well-defined)

---

## Interview Answer

**Q: "Why did you choose a monolith instead of microservices?"**

**A:** "We use a modular monolith, not a traditional tangled monolith. The system is organized into clear modules—auth, catalog, payments, orders, AI—with enforced boundaries. But it's a single deployable unit with one database.

We chose this for three reasons. First, team size—we're 1-2 engineers. Microservices need dedicated teams per service. We'd be spread too thin across 6 services. Second, scale—we're at <1000 req/sec. Microservices are for 10k+ req/sec where independent scaling is critical. Third, complexity—microservices add 10x complexity: distributed transactions (saga pattern vs ACID), network calls (5-50ms vs 0.01ms function calls), operational overhead (Kubernetes, service mesh, monitoring per service).

We DO separate when justified. The AI service is separate because it's Python (not TypeScript), needs GPU (not CPU), and has different scaling. That's a real boundary worth the cost. But catalog and payments are both TypeScript, both CPU-bound, both managed by the same team—no benefit to separating.

The modular monolith gives us 90% of microservices benefits (clear boundaries, testable modules) with 10% of the complexity. And we have a migration path: modules are already defined, so extracting to a service is straightforward when proven necessary. We optimize for current needs (simplicity, velocity) while keeping future options open (extractability)."

---

## References

- [Modular Monolith Architecture](https://www.kamilgrzybek.com/design/modular-monolith-primer/)
- [Microservices Prerequisites](https://martinfowler.com/bliki/MicroservicePrerequisites.html)
- [Monolith First](https://martinfowler.com/bliki/MonolithFirst.html)

---

**Last Updated:** 2024-04  
**Next Review:** When request rate exceeds 10k/sec or team exceeds 10 engineers
