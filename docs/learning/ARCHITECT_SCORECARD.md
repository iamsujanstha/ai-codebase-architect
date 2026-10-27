# Architect scorecard — 2026-10-28

This scorecard records only evidence collected in the local workspace. The dated architecture gap analysis is a historical snapshot and should not be treated as current inventory without rechecking its source references.

## Readiness assessment

| Area | Assessment | Evidence and remaining work |
|---|---|---|
| Layering and persistence | Strong direction | Services inject repository tokens and raw SQL is parameterized. Continue removing `any` from older repository contracts and define typed query results. |
| Payment reliability | Improved, not exactly once | Checkout idempotency is claimed atomically; outbox claims have leases and fencing tokens; inventory effects commit with a deduplication marker. SMTP may duplicate after an accepted send followed by a worker crash. |
| Database operations | Core migration and claim behavior verified locally | Migrations 001–006 applied to disposable PostgreSQL. Integration checks passed for repository schema, concurrent claims, lease reclaim/fencing, inventory deduplication, and pool acquisition timeout. Production-volume behavior still needs measurement. |
| API security | Partial | JWT fallback secrets were removed and checkout requests use scoped idempotency. Rate limiting, broader authorization coverage, security audit logging, and dependency review remain separate work. |
| AI safety and evaluation | Partial | Runtime prompt-injection and rate-limit guards exist. The gateway maps an upstream 429 to 503 without retry; representative prompt-injection regressions, retrieval quality evaluations, and real-provider behavior remain to be measured. |
| Observability | Partial | Health checks expose database availability and logs use structured event fields in key paths. Metrics, distributed trace propagation, and actionable alerts remain gaps. |
| Operations | Initial isolated drills passed | A disposable backend/database run verified health transitions to 503 during database loss and back to 200 after recovery. Pool saturation timed out within its configured bound. Broader failure and capacity testing remains. |

## Verification run

- Backend production build: passed after the final code changes.
- Backend Jest without a database URL: 14 suites passed, 2 suites skipped; 58 tests passed, 5 skipped.
- Database integration tests against disposable PostgreSQL: 2 suites passed; 5 tests passed, including migrations 001–006.
- Frontend production build: passed. Vite reported an existing 1.12 MB main chunk and toolchain deprecation/staleness warnings.
- Python AI service tests: not run successfully; `pytest` and the service dependency `httpx` are not installed in the active Python environment.
- AI upstream throttling simulation: an Axios 429 fixture maps to HTTP 503 and makes one upstream attempt.

## Local runtime latency snapshot

Docker access was later approved for read-only measurement. The running containers reported an uptime of four days, so they were not rebuilt from this working tree and these numbers are a **pre-change environment snapshot**, not an after result.

| Path | Requests / concurrency | Result | Latency |
|---|---:|---|---|
| `GET /health` | 100 / 10 | 94 HTTP 200; 6 client timeouts | p50 218.75 ms, p95 2,007.29 ms, p99 2,009.95 ms; 2-second client deadline |
| `GET /catalog/products` | 20 / 2 | 20 HTTP 200 | p50 280.02 ms, p95 309.33 ms, p99 342.49 ms |

The pre-change and rebuilt runs used different environments (the existing stack's external database versus a fresh local PostgreSQL container), so the difference is not attributable to code changes alone.

The rebuilt backend used a disposable PostgreSQL 16 container. It returned 100/100 health checks at concurrency 10, 20/20 catalog reads and quotes at concurrency 2, and 10/10 AI-model fallback reads at concurrency 2.

| Path | Requests / concurrency | Result | Latency | Observed RPS |
|---|---:|---|---|---:|
| `GET /health` | 100 / 10 | 100 HTTP 200 | p50 9.36 ms, p95 57.93 ms, p99 60.45 ms | 604.38 |
| `GET /catalog/products` | 20 / 2 | 20 HTTP 200 | p50 5.18 ms, p95 8.84 ms, p99 9.14 ms | 346.88 |
| `POST /payments/quote` | 20 / 2 | 20 HTTP 201 | p50 4.11 ms, p95 27.82 ms, p99 46.60 ms | 233.36 |
| `GET /ai/models` | 10 / 2 | 10 HTTP 200 via fallback | p50 4.27 ms, p95 29.98 ms, p99 29.98 ms | 220.70 |

One post-load process snapshot was 106,464 KiB RSS. No pre-load memory sample, peak memory, event-loop delay, or pool wait histogram was captured. Checkout session creation and real LLM generation were excluded to avoid external payment/provider calls.

Database loss was simulated by stopping only the disposable database: `/health` returned 503 with database state `error`. After recreating it and applying migrations, the same backend returned 200 with database state `connected`.

## Remaining highest-impact work

1. Add a repeatable load suite with controlled before/after infrastructure, checkout behavior using a payment sandbox, and AI generation against a mock provider.
2. Capture peak RSS, event-loop delay, pool wait counts, and latency under a longer steady-state run.
3. Add adversarial prompt-injection regression cases and retrieval evaluations; inspect tool authorization for every AI action.
4. Extend rate limiting and audit coverage across authentication and administrative routes.
5. Add metrics and trace propagation, then define alert thresholds from measured baselines.

## Interview narrative

The system uses a modular NestJS gateway with repository-token boundaries over PostgreSQL and a separate Python AI service. Payment confirmation and its outbox event commit together. Workers claim events atomically with `SKIP LOCKED`, recover abandoned claims through leases, and use fencing tokens so stale workers cannot finalize reclaimed work. Database-side effects use a transactional deduplication marker. The guarantee is at least once: inventory is deduplicated, while SMTP can still deliver duplicates after an ambiguous failure. The next architecture milestone is environment-backed concurrency, load, and failure testing, followed by measured capacity limits and alerts.
