# AI Code Assistant Platform

This repository contains a complete teaching-focused monorepo that demonstrates how to build a small AI SaaS platform with a modern frontend, an orchestration backend, and a dedicated AI microservice.

The platform behaves like a mini ChatGPT-style assistant:

1. A user enters a prompt in the React frontend.
2. The NestJS backend validates the request and acts as the API gateway.
3. The FastAPI AI service generates a structured response.
4. The backend returns the response to the frontend for display.

## Why this project exists

This codebase is intentionally written like a senior engineer mentoring a junior engineer:

- Source files contain extensive teaching comments.
- Architecture decisions are explained, not just implemented.
- The system uses clean boundaries so each layer has a clear responsibility.
- Docker Compose makes the project runnable as a multi-service platform.

## Architecture Overview

```text
┌──────────────────────────┐
│       React Frontend     │
│  Vite + Nginx container  │
│  Port: 8080             │
└────────────┬─────────────┘
             │ HTTP request from browser
             ▼
┌──────────────────────────┐
│     NestJS Backend       │
│   API Gateway / BFF      │
│   Port: 3000             │
└────────────┬─────────────┘
             │ Internal service-to-service HTTP
             ▼
┌──────────────────────────┐
│    FastAPI AI Service    │
│  Ollama-backed AI engine │
│  Port: 8000              │
└──────────────────────────┘
```

## Folder Structure

```text
.
├── frontend/              # React + Vite user interface
├── backend/               # NestJS API gateway
├── ai-service/            # FastAPI AI engine
├── docker-compose.yml     # Multi-container orchestration
└── README.md              # This guide
```

## Key Design Principles

### 1. Frontend is responsible for experience

The frontend owns:

- collecting user input
- showing loading and error states
- rendering the AI response clearly

It does **not** own AI logic or business orchestration.

### 2. Backend is responsible for orchestration

The backend exists because real SaaS systems rarely let browsers call internal AI engines directly.

It handles:

- request validation
- consistent API contracts
- downstream service coordination
- centralized error handling
- a future home for authentication, rate limiting, billing, and observability

### 3. AI service is responsible for AI-specific behavior

The AI service is isolated so it can evolve independently.

This version uses a real local Ollama model by default.

That means the platform now behaves more like a practical local-AI stack:

- the browser talks only to the backend
- the backend talks to the AI microservice
- the AI microservice talks to Ollama running on your machine
- the frontend still receives one stable response contract

## Running the Platform with Docker

### Prerequisites

- Docker Desktop or Docker Engine with Compose support
- Ollama installed locally
- At least one local Ollama model

Recommended model for this repo:

```bash
ollama pull deepseek-coder:6.7b
```

### Start everything

```bash
docker compose up --build
```

### Open the application

- Frontend UI: `http://localhost:8080`
- Backend health endpoint: `http://localhost:3000/health`
- AI service health endpoint: `http://localhost:8000/health`

Docker note:

- the `ai-service` container uses `http://host.docker.internal:11434` to reach your local Ollama daemon
- this is the usual Docker Desktop path on macOS and Windows
- on Linux, you may need to override `OLLAMA_BASE_URL`

### Stop the stack

```bash
docker compose down
```

## Local Development Without Docker

### 1. Start the AI service

```bash
cd ai-service
pip install -r requirements.txt
export OLLAMA_MODEL=deepseek-coder:6.7b
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Start the backend

```bash
cd backend
npm install
AI_SERVICE_URL=http://localhost:8000 npm run start:dev
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Then open the Vite development URL shown in the terminal, usually `http://localhost:5173`.

## API Documentation

### Backend: `POST /ai/generate`

This remains the structured one-shot endpoint.

#### Request body

```json
{
  "prompt": "Explain microservices"
}
```

#### Example response

```json
{
  "requestId": "6c09f719-4211-4334-9ad4-51826f913cb5",
  "prompt": "Explain microservices",
  "summary": "Microservices split a large system into smaller, independently deployable services.",
  "answer": "## Understanding microservices\n\nMicroservices are an architectural style...",
  "keyPoints": [
    "Each service owns a focused business capability.",
    "Teams can deploy services independently.",
    "The tradeoff is added operational complexity.",
    "Gateways often unify many services for clients."
  ],
  "suggestedFollowUpPrompts": [
    "Compare monoliths and microservices",
    "Explain API gateways in microservice systems",
    "How do microservices communicate securely?"
  ],
  "provider": "ollama-local",
  "model": "deepseek-coder:6.7b",
  "upstreamProcessingTimeMs": 120,
  "gatewayProcessingTimeMs": 135,
  "generatedAt": "2026-04-25T12:34:56.000Z"
}
```

### Backend: `POST /ai/generate/stream`

This is the chat-style streaming endpoint used by the new frontend experience.

It returns newline-delimited JSON events over one HTTP response:

```json
{"type":"start","requestId":"...","provider":"ollama-local","model":"deepseek-coder:6.7b","generatedAt":"2026-04-25T12:34:56.000Z"}
{"type":"delta","requestId":"...","delta":"Microservices "}
{"type":"delta","requestId":"...","delta":"split systems into smaller services..."}
{"type":"done","requestId":"...","provider":"ollama-local","model":"deepseek-coder:6.7b","generatedAt":"2026-04-25T12:35:18.000Z","usage":{"inputTokens":62,"outputTokens":250,"totalTokens":312},"timings":{"totalDurationMs":21969,"loadDurationMs":4271,"promptEvalDurationMs":1383,"completionDurationMs":15395},"doneReason":"stop"}
```

### Backend: `GET /ai/models`

This endpoint powers the local model picker in the frontend.

Example response:

```json
{
  "defaultModel": "deepseek-coder:6.7b",
  "models": [
    {
      "name": "deepseek-coder:6.7b",
      "sizeBytes": 4080218931,
      "sizeLabel": "3.8 GB",
      "modifiedAt": "2026-04-18T00:00:00Z",
      "family": "deepseek",
      "parameterSize": "6.7B",
      "quantizationLevel": "Q4_K_M"
    }
  ]
}
```

### AI Service: `POST /generate`

This is the internal service-to-service endpoint consumed by the NestJS backend.

#### Request body

```json
{
  "prompt": "Explain microservices",
  "request_id": "6c09f719-4211-4334-9ad4-51826f913cb5",
  "model": "deepseek-coder:6.7b"
}
```

## Docker Architecture Notes

The Docker setup intentionally models a production-style boundary:

- `frontend` is a presentation container that serves static assets via Nginx.
- `backend` is the public application API.
- `ai-service` is an internal specialized microservice that translates app prompts into Ollama requests.
- Docker networking allows services to call each other by service name such as `backend` and `ai-service`.

This is exactly how many real platforms evolve:

- one service owns the UI
- one service owns orchestration
- one service owns AI/model behavior

## Learning Outcomes

If you study this project carefully, you will learn:

- how frontend, backend, and AI services collaborate
- why API gateways exist in AI products
- how request validation improves safety and reliability
- how service boundaries reduce coupling
- how Docker Compose models multi-container systems
- how to design code for future LLM integration

## Future Improvements

This project is intentionally complete for learning, but also intentionally extensible.

Great next steps include:

1. **Additional LLM integrations**
   - add OpenAI, Anthropic, or provider routing alongside Ollama
2. **Conversation memory**
   - persist messages in PostgreSQL or Redis
3. **Vector search**
   - add pgvector, Qdrant, or Weaviate
4. **Authentication**
   - add JWT, session cookies, or OAuth
5. **Authorization and billing**
   - add plans, quotas, and usage controls
6. **Observability**
   - add structured logs, tracing, and metrics
7. **Async workloads**
   - offload long prompts to a queue worker
8. **Scaling**
   - independently scale the frontend, gateway, and AI service

## Recommended Demo Prompt

After you start the stack, try this:

> Explain microservices with a real-world example from Netflix, and explain why API gateways matter in AI SaaS platforms

You will see the full flow:

Frontend → Backend → AI Service → Backend → Frontend

That is the core learning goal of this repository.
