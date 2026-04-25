# Atlas Commerce Lab

Atlas Commerce Lab is a production-style teaching monorepo that combines two realistic product surfaces in one application:

1. a modern ecommerce storefront on `/`
2. a local Ollama-powered AI concierge on `/chat`

The stack uses:

- `frontend`: React + Vite
- `backend`: NestJS API gateway
- `database`: MongoDB via Mongoose (Atlas-ready, local Mongo included for zero-config Docker runs)
- `ai-service`: FastAPI service that talks to local Ollama
- `docker-compose`: local orchestration

The goal is to show how a real SaaS could combine commerce, backend orchestration, and AI capabilities inside one clean architecture.

## What this project demonstrates

- route-based React application design with a shared product shell
- NestJS as the orchestration layer between browser, MongoDB, and AI services
- MongoDB catalog modeling with Mongoose
- MongoDB Atlas-ready configuration through environment variables
- local-LLM integration through Ollama
- streaming chat UX with token/timing metadata
- production-style containerization and service boundaries

## Product experience

### `/`

The home route is now a premium ecommerce storefront with:

- hero merchandising section
- category filters
- Mongo-backed product catalog
- product detail pages
- persistent cart drawer
- light and dark theme support

### `/chat`

The chat route preserves the local-model experience with:

- model picker sourced from Ollama
- conversation history
- streamed token-by-token responses
- code blocks rendered like an editor with copy actions
- usage/timing metadata

## Architecture diagram

```text
┌────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                  │
│  Routes: `/`, `/products/:slug`, `/chat`                 │
│  Responsibilities: UX, routing, cart state, rendering    │
└───────────────┬───────────────────────────────┬────────────┘
                │                               │
                │ /catalog/*                    │ /ai/*
                ▼                               ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│     NestJS Catalog/API       │   │      NestJS AI Gateway       │
│  Mongo-backed ecommerce API  │   │  FastAPI orchestration proxy │
└───────────────┬──────────────┘   └───────────────┬──────────────┘
                │                                  │
                ▼                                  ▼
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ MongoDB / MongoDB Atlas      │   │ FastAPI AI Service           │
│ Products, categories, seed   │   │ Talks to local Ollama        │
└──────────────────────────────┘   └───────────────┬──────────────┘
                                                   ▼
                                      ┌──────────────────────────────┐
                                      │ Ollama running locally       │
                                      │ Installed local models       │
                                      └──────────────────────────────┘
```

## Folder structure

```text
.
├── frontend/
│   ├── src/app/                     # App shell, routing, global CSS
│   ├── src/core/api/                # HTTP clients for AI + catalog APIs
│   ├── src/core/types/              # Frontend API contracts
│   ├── src/features/chat/           # `/chat` experience
│   ├── src/features/store/          # Ecommerce pages, cart state, UI
│   ├── src/features/models/         # Local model sidebar
│   ├── src/shared/                  # Theme + shared UI utilities
│   └── nginx.conf                   # SPA serving + API proxy config
├── backend/
│   ├── src/ai/                      # AI gateway routes and services
│   ├── src/catalog/                 # Mongo-backed ecommerce module
│   │   ├── data/                    # Seed catalog + marketing content
│   │   ├── dto/                     # Query validation contracts
│   │   ├── interfaces/              # Stable response contracts
│   │   └── schemas/                 # Mongoose models
│   └── src/common/                  # Shared backend filters/interfaces
├── ai-service/
│   └── app/                         # FastAPI AI engine + Ollama client
├── docker-compose.yml               # Full local stack orchestration
├── .env.example                     # Atlas + Ollama environment template
└── README.md                        # This guide
```

## Why the backend is the orchestration layer

The browser does **not** talk directly to MongoDB or Ollama.

That separation is intentional and mirrors production systems:

- the backend validates requests
- the backend owns database access rules
- the backend hides internal service topology
- the backend is the right home for auth, rate limiting, audit logs, and billing later

This is why the architecture stays maintainable as the app grows.

## Catalog API overview

### `GET /catalog/home`

Returns the full storefront landing payload:

- announcement banner
- hero copy and stats
- categories
- featured products
- new arrivals
- catalog products
- value props
- testimonials

### `GET /catalog/categories`

Returns category summaries with product counts.

### `GET /catalog/products`

Query parameters:

- `category`
- `search`
- `featured`
- `limit`

Example:

```bash
curl "http://localhost:3000/catalog/products?category=audio&limit=4"
```

### `GET /catalog/products/:slug`

Returns:

- a single product detail payload
- related products from the same category

## AI API overview

### `GET /ai/models`

Lists models discovered from local Ollama.

### `POST /ai/generate`

One-shot AI generation.

### `POST /ai/generate/stream`

Streaming NDJSON chat endpoint used by the `/chat` page.

Example stream shape:

```json
{"type":"start","requestId":"...","provider":"ollama-local","model":"deepseek-coder:6.7b","generatedAt":"2026-04-25T12:34:56.000Z"}
{"type":"delta","requestId":"...","delta":"Here is how I would design the service..."}
{"type":"done","requestId":"...","provider":"ollama-local","model":"deepseek-coder:6.7b","generatedAt":"2026-04-25T12:35:18.000Z","usage":{"inputTokens":62,"outputTokens":250,"totalTokens":312},"timings":{"totalDurationMs":21969,"loadDurationMs":4271,"promptEvalDurationMs":1383,"completionDurationMs":15395},"doneReason":"stop"}
```

## MongoDB Atlas configuration

This repository supports **both**:

- local Mongo through Docker Compose
- MongoDB Atlas through `MONGODB_URI`

### Local Docker default

If you do nothing, the backend uses the `mongo` container from `docker-compose.yml`.

### Atlas setup

1. Copy `.env.example` to `.env`
2. Set `MONGODB_URI` to your Atlas connection string
3. Optionally keep `MONGODB_DB_NAME=ai_commerce_platform`
4. Run `docker compose up --build`

Example Atlas URI:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority&appName=atlas-commerce-lab
```

## Running with Docker

### Prerequisites

- Docker Desktop or Docker Engine with Compose support
- Ollama installed locally
- at least one Ollama model, for example:

```bash
ollama pull deepseek-coder:6.7b
```

### Start the full stack

```bash
docker compose up --build
```

### Open the app

- Frontend: `http://localhost:8080`
- Store API root health: `http://localhost:3000/health`
- AI service health: `http://localhost:8000/health`

### Stop the stack

```bash
docker compose down
```

### Notes

- The frontend container proxies `/catalog` and `/ai` to the NestJS backend.
- The backend uses local Mongo by default, unless `MONGODB_URI` is provided.
- The AI service uses `host.docker.internal` to reach local Ollama on macOS/Windows.
- On Linux, you may need to override `OLLAMA_BASE_URL`.

## Local development without Docker

### 1. Start MongoDB

Use either:

- your local Mongo server, or
- MongoDB Atlas, or
- a local Docker Mongo container

Example local Mongo container:

```bash
docker run --name atlas-commerce-mongo -p 27017:27017 mongo:7
```

### 2. Start the AI service

```bash
cd ai-service
pip install -r requirements.txt
export OLLAMA_MODEL=deepseek-coder:6.7b
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Start the backend

```bash
cd backend
npm install
MONGODB_URI=mongodb://localhost:27017 \
MONGODB_DB_NAME=ai_commerce_platform \
AI_SERVICE_URL=http://localhost:8000 \
npm run start:dev
```

If using Atlas:

```bash
cd backend
MONGODB_URI="mongodb+srv://..." \
MONGODB_DB_NAME=ai_commerce_platform \
AI_SERVICE_URL=http://localhost:8000 \
npm run start:dev
```

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173`.

## Validation commands

These are the most useful checks while iterating:

```bash
cd frontend && npm run build
cd backend && npm run build
cd ai-service && python3 -m py_compile app/main.py app/api/routes/generate.py app/services/ollama_client.py
```

## Production-style reasoning behind the design

### Frontend

- React Router separates the storefront and AI workspace cleanly.
- Cart state is kept in a context with local persistence because checkout/auth are not yet implemented.
- The chat view streams incremental AI tokens for a more realistic assistant UX.

### Backend

- NestJS exposes a catalog module and an AI module as separate business capabilities.
- Mongoose schemas model a real catalog instead of loose JSON blobs.
- Seed data gives first-run environments useful content immediately.

### AI service

- FastAPI stays focused on AI responsibilities.
- Ollama access is isolated in a provider client.
- Streaming and one-shot responses are normalized into stable contracts.

## Learning outcomes

By studying this repository, you can learn how to:

- structure a monorepo with multiple frontend/backend services
- design route-based React applications with a shared shell
- build a Mongo-backed NestJS feature module with Mongoose
- expose frontend-friendly API contracts from backend services
- integrate local Ollama models through a dedicated FastAPI layer
- stream AI responses into a polished chat UI
- containerize a multi-service app for local product development

## Future improvements

Natural next steps for a real product include:

- authentication and saved carts
- checkout and payments
- admin product management dashboard
- order history and fulfillment APIs
- image uploads via object storage
- semantic search over the catalog using embeddings
- AI shopping assistant that can reference products directly
- rate limiting and usage analytics
- OpenTelemetry tracing
- Redis caching for hot catalog queries
- CDN-backed asset delivery

## Quick demo flow

1. Open `/`
2. Browse products loaded from MongoDB
3. Add items to the cart drawer
4. Open `/products/:slug` for a detail page
5. Switch to `/chat`
6. Ask the local model something like:

```text
Compare ergonomic mice for a software engineer working 10 hours a day.
```

That flow is what makes this project feel like a real integrated platform rather than an isolated demo.
