# Local development setup

## Prerequisites

- Node.js 20 or newer.
- Python 3.11 or newer for the AI service.
- PostgreSQL reachable from the backend.
- Docker Compose if using the containerized stack.
- A configured model provider, such as a local Ollama instance, for real AI responses.

## Install dependencies

```bash
cd frontend && npm install
cd ../backend && npm install
```

Create a Python virtual environment in `ai-service/` and install `ai-service/requirements.txt` with that environment's `pip`.

Use `.env.example` as a variable reference and set `POSTGRES_URL` for both direct backend startup and Compose. The backend fails startup if PostgreSQL is unreachable after retries; see the [PostgreSQL runbook](postgresql.md).

## Run services

Start the frontend and backend with the scripts declared in their package files. Start FastAPI from `ai-service/` with Uvicorn using `app.main:app`. For the containerized stack, use `docker compose up --build` after configuring `POSTGRES_URL` and the other required environment values.

## Health endpoints

- NestJS: `/health`
- FastAPI: `/health`

The AI health route reports service configuration; it does not establish that every configured downstream provider is healthy.
