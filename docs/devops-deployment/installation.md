> **Refactored starter:** Follow [the current setup guide](docs/provider-starter.md). The Docker walkthrough below describes the original full demo stack. Redis/Qdrant/RQ now require `--profile rag`; Dozzle requires `--profile monitoring`. Retrieval defaults to disabled.

# Installation & Run Guide (Docker)

This project is designed to run as a multi-container platform using **Docker** and **Docker Compose**.

---

## 🏗️ Architecture in Docker

When running with Docker Compose, the platform orchestrates the following services:

```text
┌───────────────────────────────┐
│        frontend (Nginx)       │  Port: 8080 -> Browser UI
│     (Static React Bundle)     │
└───────────────┬───────────────┘
                │ /ai and /health proxy
                ▼
┌───────────────────────────────┐
│        backend (NestJS)       │  Port: 3000 -> API Gateway
│  (Validation & Orchestration) │
└───────────────┬───────────────┘
                │ Internal HTTP
                ▼
┌───────────────────────────────┐
│     ai-service (FastAPI)      │  Port: 8000 -> AI Engine
│   (Ollama Orchestration)      │
└──────────┬───────────┬────────┘
           │           │
           │           ▼
           │     ┌───────────────┐
           │     │   vector-db   │  Port: 6333 (Qdrant)
           │     └───────────────┘
           │     ┌───────────────┐
           │     │     redis     │  Port: 6379 (Task Cache)
           │     └───────┬───────┘
           │             ▼
           │     ┌───────────────┐
           │     │   ai-worker   │  (RQ Background Worker)
           │     └───────────────┘
           ▼
┌───────────────────────────────┐
│    Ollama (Host Machine)      │  Port: 11434 (via host.docker.internal)
│  e.g. deepseek-coder:6.7b     │
└───────────────────────────────┘
```

---

## 📋 Prerequisites

1. **Docker Desktop** (or Docker Engine with Compose support) installed and running.
2. **Ollama** installed on your host machine.
3. At least one model downloaded in Ollama:
   ```bash
   ollama pull deepseek-coder:6.7b
   # or any other installed model (e.g., qwen3.5:latest, deepseek-r1:8b)
   ```

---

## 🚀 Running the App with Docker

### 1. Start Ollama
Make sure your local Ollama application is running:
```bash
ollama list
```

### 2. Build and Start All Containers
From the root of the project directory:

```bash
docker compose up --build
```

To run in the background (detached mode):
```bash
docker compose up --build -d
```

### 3. Access the Services

Once started, access the application and monitoring endpoints:

| Service | URL | Description |
|---|---|---|
| **Frontend UI** | [http://localhost:8080](http://localhost:8080) | Chat interface and model selector |
| **Backend API** | [http://localhost:3000/health](http://localhost:3000/health) | API Gateway health check |
| **AI Microservice** | [http://localhost:8000/health](http://localhost:8000/health) | FastAPI health check |
| **Container Monitoring** | [http://localhost:8888](http://localhost:8888) | Dozzle live logs viewer |
| **Qdrant Vector DB** | [http://localhost:6333/dashboard](http://localhost:6333/dashboard) | Vector store web console |

---

## ⏹️ Stopping the App

To stop all running containers:
```bash
docker compose down
```

To stop containers and remove persistent volumes (e.g. reset Qdrant data):
```bash
docker compose down -v
```

---

## ⚙️ Docker Compose Configuration & Environment Variables

All configuration is centralized in [docker-compose.yml](file:///Users/ebpearls/Documents/ai-codebase-architect/docker-compose.yml):

### `ai-service`
- `OLLAMA_BASE_URL`: `http://host.docker.internal:11434` (connects from inside container to Ollama on host)
- `OLLAMA_MODEL`: `deepseek-coder:6.7b` (default fallback model)
- `QDRANT_HOST`: `vector-db` (container service name)
- `REDIS_URL`: `redis://redis:6379/0` (container service name)
- `PORT`: `8000`

### `backend`
- `PORT`: `3000`
- `AI_SERVICE_URL`: `http://ai-service:8000` (internal Docker network DNS)
- `CORS_ORIGIN`: `http://localhost:8080,http://localhost:5173`

### `frontend`
- Serves static build via Nginx on port `8080`
- Proxies API traffic to `backend:3000` internally via Docker network

---

## 🛠️ Troubleshooting Docker on macOS

### 1. `docker: command not found`
If the Docker command is not recognized in terminal:
- Open **Docker Desktop** from your Applications folder.
- Ensure Docker CLI symlinks are enabled in Docker Desktop:
  **Settings > Advanced > Choose 'System' or 'User' for CLI tools**.
- If Docker was previously moved to Trash, restore `Docker.app` back to `/Applications` or reinstall [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/).

### 2. Ollama Connection Error (`host.docker.internal`)
- Ensure Ollama is running on your Mac before starting Docker (`ollama list`).
- On macOS, Docker containers access the host machine via `http://host.docker.internal:11434`.
- If Ollama is bound only to `127.0.0.1`, set `OLLAMA_HOST=0.0.0.0` if needed, though Docker Desktop for Mac routes host traffic automatically.
