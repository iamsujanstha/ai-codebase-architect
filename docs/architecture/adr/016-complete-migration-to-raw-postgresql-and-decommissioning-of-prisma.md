# ADR-016: Complete Migration to Raw PostgreSQL & Decommissioning of Prisma

**Status:** Accepted  
**Date:** 2026-10-27  
**Decision Makers:** Architecture Team  
**Relates to:** ADR-014 (Repository Pattern for Payments), ADR-015 (System-Wide Repository Pattern)

---

## Context

Prior to this decision, the backend utilized Prisma ORM alongside a native PostgreSQL connection pool (`node-postgres` / `pg`). While Prisma facilitated initial prototyping, it introduced critical architectural liabilities in a production-grade backend:
1. **Dual Connection Pool Contention:** Two separate pools hitting Neon Serverless PostgreSQL, doubling connection counts and risking pool exhaustion.
2. **Cold-Start & Runtime Latency:** Prisma's Rust query-engine binary introduced latency overhead during cold starts.
3. **Hidden Database Mechanics:** Prisma abstractions obscured raw transaction boundaries, locking semantics (`FOR UPDATE SKIP LOCKED`), and native SQLSTATE errors (wrapping error `23505` into proprietary `P2002`).
4. **Suboptimal Relational Querying:** Relational fetches frequently produced multiple round-trips or memory-heavy JavaScript joins instead of utilizing native PostgreSQL JSON functions.

---

## Decision

**We completely decommission Prisma and standardize on 100% Native Raw PostgreSQL using `node-postgres` (`pg`) across all repositories, background workers, and CLI scripts.**

Packages uninstalled and removed:
- `@prisma/client`
- `prisma`
- `PrismaService` (`backend/src/database/prisma.service.ts`)

---

## Architectural & Technical Implementations

All 8 repositories now run hand-optimized SQL directly against `PostgresService`:

### 1. Atomic Customer Upsert (`ON CONFLICT`)
Eliminates race conditions when concurrent requests create the same customer account:
```sql
INSERT INTO users (email, name, password, role, status, created_at, updated_at)
VALUES ($1, $2, '', 'customer', 'active', NOW(), NOW())
ON CONFLICT (email) DO UPDATE
  SET updated_at = NOW()
RETURNING id, email, name;
```

### 2. Relational Aggregation with Zero N+1 Queries
Orders, user profiles, and order line items are retrieved in a **single round-trip** using native `json_build_object` and `json_agg`:
```sql
SELECT 
  o.*,
  CASE 
    WHEN u.id IS NOT NULL THEN json_build_object('id', u.id, 'name', u.name, 'email', u.email)
    ELSE NULL 
  END AS users,
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', oi.id,
          'product_id', oi.product_id,
          'name', oi.name,
          'price', oi.price,
          'quantity', oi.quantity,
          'subtotal', oi.subtotal
        )
      )
      FROM order_items oi
      WHERE oi.order_id = o.id
    ),
    '[]'::json
  ) AS order_items
FROM orders o
LEFT JOIN users u ON u.id = o.user_id
WHERE o.order_number = $1;
```

### 3. Batch Multi-Row Inserts
Order snapshots insert line items in a single parameterized multi-row `VALUES` query instead of loop-based inserts.

### 4. Non-Blocking Row-Level Lock Claiming (`FOR UPDATE SKIP LOCKED`)
Transactional Outbox workers poll pending events concurrently across horizontally scaled instances without deadlocks or row contention:
```sql
SELECT id, aggregate_id, aggregate_type, event_type, payload, attempts, max_attempts, next_attempt_at
FROM outbox_events
WHERE status = 'pending'
  AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
ORDER BY created_at ASC
LIMIT $2
FOR UPDATE SKIP LOCKED;
```

### 5. Native SQLSTATE Error Code Handling
Repositories translate standard PostgreSQL SQLSTATE codes (e.g. `23505` unique violation) into standard NestJS exceptions:
```typescript
if (error?.code === '23505') {
  throw new ConflictException('Webhook is already being processed');
}
```

---

## Consequences

- **Performance:** Instant server bootstrap with zero Rust binary initialization. 
- **Efficiency:** 50% reduction in database connection overhead on Neon.
- **Maintainability:** 100% transparent SQL query execution plans optimizable with `EXPLAIN ANALYZE`.
- **Domain Independence:** Application services (`PaymentsService`, `OrdersService`, `UsersService`, etc.) remain 100% decoupled from persistence technology via repository interfaces.

---

*ADR-016 | Accepted | 2026-10-27*
