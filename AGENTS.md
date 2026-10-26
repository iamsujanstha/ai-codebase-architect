# AI Codebase Architect - Architecture & Agent Guidelines

## System Overview
- **Backend Framework:** NestJS Modular Monolith (`/backend/src`)
- **Database Architecture:** Neon Serverless PostgreSQL with pgvector (100% Native Raw PostgreSQL via `pg` connection pool, Zero ORM).
- **Design Pattern:** 100% Repository Pattern with Dependency Injection Tokens for complete layer decoupling.
- **Reliability & Enterprise Patterns:**
  - Transactional Outbox Pattern for payment side-effects (Order confirmation emails, stock decrement, async delivery).
  - Row-level lock claiming (`SELECT ... FOR UPDATE SKIP LOCKED`) in background workers.
  - Native PostgreSQL SQLSTATE error handling (`23505` unique violation) in repositories.
  - Single-roundtrip relational JSON aggregation (`json_build_object`, `json_agg`) to eliminate N+1 queries.
  - Atomic upserts via `ON CONFLICT (...) DO UPDATE`.
  - Batch multi-row parameterized inserts.
  - Idempotency middleware for checkout sessions and webhook processing.

## Module Repositories & Tokens
All business logic services and workers depend strictly on interfaces via NestJS injection tokens:

| Domain | Interface | Token | Implementation |
|---|---|---|---|
| Payments & Outbox | `IPaymentsRepository` | `PAYMENTS_REPOSITORY_TOKEN` | `PostgresPaymentsRepository` (Raw SQL) |
| Catalog | `ICatalogRepository` | `CATALOG_REPOSITORY_TOKEN` | `PostgresCatalogRepository` (Raw SQL) |
| Orders | `IOrdersRepository` | `ORDERS_REPOSITORY_TOKEN` | `PostgresOrdersRepository` (Raw SQL) |
| Users | `IUsersRepository` | `USERS_REPOSITORY_TOKEN` | `PostgresUsersRepository` (Raw SQL) |
| AI Chat Threads | `IChatThreadsRepository` | `CHAT_THREADS_REPOSITORY_TOKEN` | `PostgresChatThreadsRepository` (Raw SQL) |
| Admin | `IAdminRepository` | `ADMIN_REPOSITORY_TOKEN` | `PostgresAdminRepository` (Raw SQL) |
| Idempotency | `IIdempotencyRepository` | `IDEMPOTENCY_REPOSITORY_TOKEN` | `PostgresIdempotencyRepository` (Raw SQL) |
| System Health | `IHealthRepository` | `HEALTH_REPOSITORY_TOKEN` | `PostgresHealthRepository` (Raw SQL) |

## Rules for Code Modification
1. **Never inject PostgresService directly into Domain Services, Controllers, or Workers.** Always route through the repository interface.
2. **Never expose database-specific error codes (e.g. `23505`) out of repositories.** Map them to standard NestJS exceptions (e.g. `ConflictException`, `NotFoundException`).
3. **Use parameterized queries (`$1, $2, ...`) for all SQL statements.** Never concatenate user input into SQL strings.
4. **Keep ADRs up to date** when changing architectural decisions. Refer to `docs/architecture/adr/`.
