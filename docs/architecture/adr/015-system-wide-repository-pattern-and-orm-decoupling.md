# ADR-015: System-Wide Repository Pattern and Cross-ORM Decoupling

**Status:** Accepted  
**Date:** 2026-10-26  
**Decision Makers:** Architecture Team  
**Relates to:** ADR-010 (Modular Monolith), ADR-013 (Outbox Pattern), ADR-014 (Repository Pattern for Payments)

---

## Context

Before this architecture iteration, multiple backend domain services and middleware directly invoked ORM methods (`this.prisma.*`) or driver queries (`this.postgresService.query(...)`):
- `PaymentsService` and `OutboxWorker` had direct Prisma and SQL calls.
- `UsersService` had direct `prisma.users.*` invocations.
- `ChatThreadsService` had direct `prisma.chat_threads.*` and `prisma.chat_messages.*` invocations.
- `AdminService` had direct `prisma.products.*`, `prisma.users.*`, and `prisma.orders.*` queries and aggregations.
- `AppService` executed direct `SELECT COUNT(*) FROM ...` SQL queries for health metrics.
- `IdempotencyMiddleware` executed direct `prisma.idempotency_keys.*` lookups and upserts.
- `CatalogSeedService` invoked `prisma.products.count()`.

Direct ORM coupling across domain services creates severe architectural friction:
1. **Zero ORM Portability:** Migrating any feature to raw PostgreSQL or another query builder (Drizzle, Kysely) requires refactoring all application services.
2. **Transaction Leakage:** ORM-specific interactive transaction models (e.g. `prisma.$transaction`) bleed into domain logic.
3. **Impaired Testability:** Domain services cannot be tested without either spinning up a database or mocking massive ORM internal interfaces.

---

## Decision

We enforce **100% Repository Pattern encapsulation** across the entire backend. All database interactions must be declared via abstract TypeScript interfaces (`I<Domain>Repository`) and injected via NestJS DI tokens (`<DOMAIN>_REPOSITORY_TOKEN`).

### Architecture Topology

```mermaid
graph TD
    subgraph Domain Services & Workers Layer (Pure Business Logic)
        PS[PaymentsService]
        OW[OutboxWorker]
        US[UsersService]
        CTS[ChatThreadsService]
        AS[AdminService]
        CS[CatalogService]
        OS[OrdersService]
        APPS[AppService]
        IDM[IdempotencyMiddleware]
    end

    subgraph Repository Interfaces (Contracts)
        IPR[<<interface>> IPaymentsRepository]
        IUR[<<interface>> IUsersRepository]
        ICTR[<<interface>> IChatThreadsRepository]
        IAR[<<interface>> IAdminRepository]
        ICR[<<interface>> ICatalogRepository]
        IOR[<<interface>> IOrdersRepository]
        IHR[<<interface>> IHealthRepository]
        IIDR[<<interface>> IIdempotencyRepository]
    end

    subgraph Concrete Implementations (Pluggable Persistence)
        P_PR[PostgresPaymentsRepository]
        P_UR[PostgresUsersRepository]
        P_CTR[PostgresChatThreadsRepository]
        P_AR[PostgresAdminRepository]
        P_CR[PostgresCatalogRepository]
        P_OR[PostgresOrdersRepository]
        P_HR[PostgresHealthRepository]
        P_IDR[PostgresIdempotencyRepository]
    end

    PS --> IPR
    OW --> IPR
    US --> IUR
    CTS --> ICTR
    AS --> IAR
    CS --> ICR
    OS --> IOR
    APPS --> IHR
    IDM --> IIDR

    IPR -.-> P_PR
    IUR -.-> P_UR
    ICTR -.-> P_CTR
    IAR -.-> P_AR
    ICR -.-> P_CR
    IOR -.-> P_OR
    IHR -.-> P_HR
    IIDR -.-> P_IDR
```

---

## Complete Registry of Repositories & Tokens

| Domain | Interface File | Implementation File | DI Token |
|---|---|---|---|
| **Payments & Outbox** | [payments.repository.interface.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/payments/repositories/payments.repository.interface.ts) | [postgres-payments.repository.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/payments/repositories/postgres-payments.repository.ts) | `PAYMENTS_REPOSITORY_TOKEN` |
| **Catalog** | [catalog.repository.interface.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/catalog/repositories/catalog.repository.interface.ts) | [postgres-catalog.repository.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/catalog/repositories/postgres-catalog.repository.ts) | `CATALOG_REPOSITORY_TOKEN` |
| **Orders** | [orders.repository.interface.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/orders/repositories/orders.repository.interface.ts) | [postgres-orders.repository.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/orders/repositories/postgres-orders.repository.ts) | `ORDERS_REPOSITORY_TOKEN` |
| **Users** | [users.repository.interface.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/users/repositories/users.repository.interface.ts) | [postgres-users.repository.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/users/repositories/postgres-users.repository.ts) | `USERS_REPOSITORY_TOKEN` |
| **AI Chat Threads** | [chat-threads.repository.interface.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/ai/repositories/chat-threads.repository.interface.ts) | [postgres-chat-threads.repository.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/ai/repositories/postgres-chat-threads.repository.ts) | `CHAT_THREADS_REPOSITORY_TOKEN` |
| **Admin** | [admin.repository.interface.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/admin/repositories/admin.repository.interface.ts) | [postgres-admin.repository.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/admin/repositories/postgres-admin.repository.ts) | `ADMIN_REPOSITORY_TOKEN` |
| **Idempotency** | [idempotency.repository.interface.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/common/repositories/idempotency.repository.interface.ts) | [postgres-idempotency.repository.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/common/repositories/postgres-idempotency.repository.ts) | `IDEMPOTENCY_REPOSITORY_TOKEN` |
| **System Health** | [health.repository.interface.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/database/repositories/health.repository.interface.ts) | [postgres-health.repository.ts](file:///Users/mac/Developer/AI/ai-codebase-architect/backend/src/database/repositories/postgres-health.repository.ts) | `HEALTH_REPOSITORY_TOKEN` |

---

## Consequences & Guarantees

1. **Zero ORM Leakage in Domain Services:** Every service file now has zero imports from `@prisma/client`, zero `PrismaService` injections, and zero SQL text.
2. **Readiness for Raw PostgreSQL:** Because all queries are isolated inside repository classes, implementing raw PostgreSQL only requires modifying the repository implementations (or adding `RawPostgres*Repository` classes) without altering any service, controller, worker, or test outside data access.
3. **Decoupled Unit Testing:** Services can be tested using lightweight JavaScript/TypeScript mock objects adhering to the repository interfaces, avoiding complex ORM transaction mocking.

---

*ADR-015 | Accepted | 2026-10-26*
