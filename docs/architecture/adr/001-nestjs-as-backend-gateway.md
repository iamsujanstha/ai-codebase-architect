# ADR-001: NestJS as Backend API Gateway

**Status:** Accepted  
**Date:** 2024-04  
**Decision Makers:** Architecture Team  
**Context Date:** Initial system design

---

## Context

We needed to build a backend that orchestrates:
- MongoDB-based commerce APIs (catalog, orders)
- Payment provider integrations (Stripe, eSewa)
- AI service proxying (FastAPI Python service)
- User authentication (JWT + OAuth)
- PDF processing and RAG
- Admin dashboard APIs

### Requirements

1. **Type safety** for maintainability
2. **Strong ecosystem** for rapid development
3. **Production-grade patterns** (dependency injection, middleware, guards)
4. **Compatibility with TypeScript frontend** (shared mental model)
5. **WebSocket/SSE support** for AI streaming
6. **Raw body access** for webhook signature verification

### Constraints

- Team has strong TypeScript/JavaScript experience
- Need to ship quickly without sacrificing architecture
- Must support both REST and streaming protocols
- Must integrate with Python AI service

---

## Decision

**We chose NestJS as the Backend-for-Frontend (BFF) / API Gateway.**

NestJS will:
- Expose all public-facing APIs
- Handle authentication and authorization
- Validate all incoming requests
- Orchestrate calls to MongoDB, AI service, payment providers
- Stream AI responses from FastAPI to frontend
- Handle webhook verification

---

## Alternatives Considered

### 1. Express.js

**Pros:**
- Minimal, flexible
- Team familiarity
- Large ecosystem

**Cons:**
- No opinionated structure → architectural drift risk
- Manual dependency injection setup
- Manual validation wiring
- No built-in middleware composition patterns
- Would require significant boilerplate for guards/pipes/interceptors

**Why Not:** At scale, lack of structure becomes a maintenance burden. NestJS provides architectural guardrails without lock-in.

### 2. Fastify

**Pros:**
- Faster than Express
- Schema validation built-in
- Good TypeScript support

**Cons:**
- Smaller ecosystem than Express/NestJS
- Less opinionated than NestJS → similar drift risk
- Fewer off-the-shelf integrations

**Why Not:** Similar to Express — optimizes for speed over structure. Speed is not our bottleneck; maintainability is.

### 3. tRPC + Next.js API Routes

**Pros:**
- End-to-end type safety
- No manual API contract maintenance
- Excellent DX for TypeScript monorepos

**Cons:**
- Tightly couples frontend and backend
- Difficult to support non-TypeScript clients
- Not designed for webhook integrations or streaming
- Harder to version independently

**Why Not:** Great for greenfield TypeScript-only systems, but limits flexibility for payment webhooks, mobile apps, third-party integrations.

### 4. Pure FastAPI (Python for everything)

**Pros:**
- Single language
- Excellent async performance
- Great type hints

**Cons:**
- Team is TypeScript-first
- MongoDB/Mongoose ecosystem is weaker in Python
- Frontend and backend would not share mental model
- Python async ecosystem has more footguns (blocking code breaking event loop)

**Why Not:** Playing to team strengths (TypeScript) is more important than language purity.

### 5. GraphQL (Apollo Server)

**Pros:**
- Flexible client queries
- Strong type system
- Single endpoint

**Cons:**
- Over-fetching/under-fetching is not a problem for our use case
- Adds complexity for webhooks and streaming
- Requires GraphQL expertise
- Harder to cache (no HTTP semantics)

**Why Not:** GraphQL solves problems we don't have (client-driven queries across complex graphs). REST + well-defined contracts is sufficient.

---

## Rationale

### Why NestJS Fits

1. **Dependency Injection**
   - Clean separation of controllers, services, repositories
   - Easy to mock for testing
   - Prevents tight coupling

2. **Guards & Interceptors**
   - Authentication/authorization as cross-cutting concerns
   - Easy to add logging, correlation IDs, performance tracking

3. **Validation Pipes**
   - Automatic request validation with class-validator
   - Type-safe DTOs prevent runtime errors

4. **Module System**
   - Clear boundaries (CatalogModule, PaymentsModule, AIModule)
   - Independent scaling/replacement possible

5. **Streaming Support**
   - SSE for AI responses works out of the box
   - Raw body access for Stripe webhooks

6. **Ecosystem**
   - @nestjs/mongoose for MongoDB
   - @nestjs/jwt for authentication
   - @nestjs/passport for OAuth
   - Battle-tested in production

---

## Tradeoffs

### What We Gain

- ✅ **Architectural consistency** across modules
- ✅ **Type safety** end-to-end
- ✅ **Testability** via dependency injection
- ✅ **Developer experience** (IDE autocomplete, error detection)
- ✅ **Ecosystem** (Passport, Mongoose, Swagger)

### What We Lose

- ❌ **Flexibility** (more opinionated than Express)
- ❌ **Bundle size** (larger than Express/Fastify)
- ❌ **Learning curve** (decorators, dependency injection)

### What It Costs

- **Performance:** Slightly slower than Fastify, but not a bottleneck (our bottleneck is AI generation, not HTTP parsing)
- **Lock-in:** Moderate (could migrate to Express, but would lose DI/decorator infrastructure)

---

## Consequences

### Positive

1. **Consistency:** All backend APIs follow the same patterns (Controller → Service → Repository)
2. **Maintainability:** New engineers can understand structure quickly
3. **Scalability:** Clear module boundaries enable future microservice extraction if needed
4. **Testing:** Dependency injection makes unit testing straightforward

### Negative

1. **Learning Curve:** Team must learn NestJS decorators and DI patterns
2. **Boilerplate:** More files per feature (module, controller, service, DTOs, schemas)
3. **Debugging:** Decorator magic can obscure call stacks

### Neutral

1. **Not the fastest:** Fastify would be 10-20% faster, but our latency is dominated by MongoDB/AI calls
2. **Not the smallest:** Express would have smaller bundle size, but server bundle size is not a constraint

---

## When Would We Change This Decision?

### Triggers to Reconsider

1. **Performance becomes critical** (>100k req/sec)
   - Mitigation: Profile first. MongoDB/AI are likely bottlenecks, not NestJS.
   - Alternative: Migrate hot paths to Fastify or Rust.

2. **Team shifts to Python-first**
   - Mitigation: Keep NestJS as thin gateway, move logic to FastAPI.
   - Alternative: Consolidate on FastAPI with async workers.

3. **Type-safe contracts become more important than flexibility**
   - Mitigation: Add tRPC alongside REST for TypeScript clients.
   - Alternative: Full tRPC + Next.js API routes.

4. **Microservice extraction required**
   - Mitigation: NestJS modules are already good service boundaries.
   - Alternative: Extract modules to separate NestJS instances or rewrite in appropriate language.

---

## Implementation Notes

### Request Lifecycle

```
HTTP Request
  ↓
Nginx (reverse proxy, TLS termination)
  ↓
NestJS (port 3000)
  ↓
Middleware (CORS, raw body for webhooks)
  ↓
Guards (JWT authentication, role authorization)
  ↓
Pipes (request validation, transformation)
  ↓
Controller (route handler)
  ↓
Service (business logic)
  ↓
Repository / External Service (data access)
  ↓
Interceptor (logging, transformation)
  ↓
Exception Filter (error handling)
  ↓
HTTP Response
```

### Module Boundaries

- **CatalogModule:** Products, categories, home page data
- **PaymentsModule:** Orders, Stripe, eSewa orchestration
- **AIModule:** Proxy to FastAPI, chat threads persistence
- **AuthModule:** JWT, Google OAuth, password reset
- **UsersModule:** User CRUD, profile management
- **AdminModule:** Admin dashboard APIs
- **PdfRagModule:** PDF upload, pgvector integration

Each module is independently testable and could be extracted to a separate service if needed.

---

## Validation

### Success Metrics

- ✅ **Development velocity:** New features take 1-2 days, not weeks
- ✅ **Bug rate:** Type safety prevents entire classes of errors
- ✅ **Onboarding:** New engineers productive within 1 week
- ✅ **Test coverage:** DI enables 80%+ unit test coverage

### Open Questions

- **Performance under load:** Needs load testing (target: 1000 req/sec per instance)
- **Memory footprint:** Needs profiling (target: <512MB per instance)
- **Horizontal scaling:** Needs multi-instance testing (stateless design, but needs verification)

---

## References

- [NestJS Documentation](https://docs.nestjs.com/)
- [NestJS Best Practices](https://github.com/nestjs/nest/tree/master/sample)
- [Why We Chose NestJS (Enterprise Perspective)](https://enterprise.nestjs.com/)

---

**Last Updated:** 2024-04  
**Next Review:** When considering microservice extraction or performance becomes a bottleneck
