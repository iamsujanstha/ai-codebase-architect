# Developer quick reference

## Main entry points

- Frontend: `frontend/src/` (React + Vite)
- Backend: `backend/src/main.ts` and `backend/src/app.module.ts` (NestJS)
- Database pool: `backend/src/database/postgres.service.ts`
- Python AI service: `ai-service/app/main.py` (FastAPI)
- Service topology: `docker-compose.yml`
- Current architecture: [ARCHITECTURE.md](ARCHITECTURE.md)

## Common commands

```bash
# Backend
cd backend
npm install
npm run start:dev
npm run build
npm test

# Frontend
cd frontend
npm install
npm run dev
npm run build

# Containers, from the repository root
docker compose config
docker compose up --build
docker compose ps
```

Set `POSTGRES_URL` before starting the backend or Compose stack. Startup fails when the value is missing or PostgreSQL remains unreachable; `/health` returns HTTP 503 when database readiness checks fail. See [the PostgreSQL runbook](docs/RUNBOOKS/postgresql.md).

## Architecture references

- [Repository interfaces and ADRs](docs/ADRs/)
- [Runbooks](docs/RUNBOOKS/)
- [Learning guides](docs/learning/)
- [Runnable database exercises](backend/src/database/exercises/README.md)
