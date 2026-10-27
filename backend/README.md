# NestJS backend

The backend is a NestJS modular monolith. It exposes catalog, orders, payments, authentication, users, admin, and AI gateway APIs. Controllers validate and map HTTP requests; services coordinate business workflows; repository interfaces isolate PostgreSQL access.

## Run locally

```bash
npm install
npm run start:dev
npm run build
npm test
```

The backend requires `POSTGRES_URL` for direct startup and Compose. It fails startup after database connection retries are exhausted, and `/health` returns HTTP 503 when database checks fail. See the [database runbook](../docs/RUNBOOKS/postgresql.md).

## Key boundaries

- Feature modules are composed in `src/app.module.ts`.
- Database repositories implement domain-specific interfaces and injection tokens.
- AI model-provider credentials and vendor protocols belong to the FastAPI service.
- Payment gateway details are isolated behind provider adapters.

See the root [system architecture](../ARCHITECTURE.md), [ADRs](../docs/ADRs/), and [runbooks](../docs/RUNBOOKS/).
