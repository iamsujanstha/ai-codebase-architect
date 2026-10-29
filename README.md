# Atlas Commerce Lab

Atlas Commerce Lab is a learning monorepo for commerce workflows and AI service integration. It combines a React storefront, a NestJS modular monolith, PostgreSQL persistence, and a Python AI service.

## System at a glance

- `frontend/` — React 18 and Vite single-page application.
- `backend/` — NestJS API for catalog, orders, payments, users, auth, admin, and AI gateway routes.
- `backend/src/database/` — PostgreSQL connection pool, migrations, and repository infrastructure using `pg` without an ORM.
- `ai-service/` — FastAPI service with Ollama and hosted model adapters, NDJSON streaming, and optional retrieval.
- `docker-compose.yml` — local frontend, backend, AI service, and RabbitMQ orchestration. PostgreSQL and model providers are external services.

The browser calls the NestJS API. NestJS owns validation and commerce workflows; repositories own SQL access. AI requests flow through NestJS to FastAPI, which calls the configured model provider. Payment providers call the backend through webhooks or browser-return flows.

## Local development

Prerequisites: Node.js 20+, Python 3.11+, PostgreSQL, and Docker Compose for the containerized stack. A model provider such as Ollama is needed to generate real AI responses.

Install frontend and backend dependencies from their respective directories with `npm install`. Install the Python dependencies from `ai-service/requirements.txt` in a virtual environment. Configure the environment using `.env.example` as a reference, then start individual services with the scripts in each package or use Docker Compose.

Configure `POSTGRES_URL` before starting the backend or Compose stack. The backend fails startup when the database is unavailable, and its `/health` endpoint returns HTTP 503 when database readiness checks fail. See [the database runbook](docs/RUNBOOKS/postgresql.md).

RabbitMQ carries order-paid events after the PostgreSQL transactional outbox. Compose credentials are local-learning defaults; replace them and use TLS/secrets for remote deployments. See the [RabbitMQ learning guide](docs/learning/architecture/RABBITMQ_PRODUCTION_LEARNING.md).

## Learning resources

- [System architecture](ARCHITECTURE.md)
- [Architecture decision records](docs/ADRs/)
- [Runbooks](docs/RUNBOOKS/)
- [Learning guides](docs/learning/)
- [Feature documentation](docs/features/)
- [Documentation index](docs/README.md)

The repository includes runnable PostgreSQL exercises under `backend/src/database/exercises/`. See their [README](backend/src/database/exercises/README.md) before running them against a database.

## Project conventions

See [AGENTS.md](AGENTS.md) for repository architecture constraints and [CLAUDE.md](CLAUDE.md) for code intelligence workflow instructions.
