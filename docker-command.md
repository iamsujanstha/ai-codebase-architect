# Docker Operations & Advanced Debugging Guide

Comprehensive reference for managing, debugging, and operating the **Atlas Commerce Lab** multi-container environment.

---

## 🌐 Exposed Ports & Quick Service Access Matrix

All services, active port mappings, health check routes, and clickable direct links so you do not need to look up `docker-compose.yml`.

| Service | Container Port | Host Port (Env Override) | Quick Access Link | Health / Swagger / Docs | Protocol / Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Frontend** | `80` | `8080` (`${FRONTEND_PORT}`) | [http://localhost:8080](http://localhost:8080) | [Health](http://localhost:8080/) | HTTP (React SPA + Nginx Reverse Proxy) |
| **Backend API** | `3000` | `8000` (`${BACKEND_PORT}`) | [http://localhost:8000](http://localhost:8000) | [Health](http://localhost:8000/health) | HTTP (NestJS Gateway API) |
| **AI Service** | `8000` | `8001` (`${AI_SERVICE_PORT}`) | [http://localhost:8001/docs](http://localhost:8001/docs) *(Swagger UI)* | [Swagger UI](http://localhost:8001/docs) • [ReDoc](http://localhost:8001/redoc) • [Health](http://localhost:8001/health) | HTTP (FastAPI — Root `/` returns 404 by default, use `/docs` or `/health`) |
| **Vector DB (Qdrant)** | `6333` | `6333` (`${QDRANT_PORT}`) | [http://localhost:6333/dashboard](http://localhost:6333/dashboard) | [API Root](http://localhost:6333/) • [Collections](http://localhost:6333/collections) | HTTP (Qdrant Web UI & REST API) |
| **Host Ollama** *(External)* | `11434` | `11434` | [http://localhost:11434](http://localhost:11434) | [Tags](http://localhost:11434/api/tags) | HTTP (Requires Ollama app running on host: `open -a Ollama`) |

> [!IMPORTANT]
> **Why certain ports don't open as expected in the browser:**
> 1. **AI Service (`localhost:8001`)**: The server **is running**, but FastAPI has no route at root `/` (resulting in `{"detail":"Not Found"}`). Open **[http://localhost:8001/docs](http://localhost:8001/docs)** for the interactive Swagger UI or **[http://localhost:8001/health](http://localhost:8001/health)** for health status.
> 2. **Host Ollama (`localhost:11434`)**: Ollama runs on your host machine outside Docker. If port 11434 fails to open, start it with `open -a Ollama` or `ollama serve`.

> [!NOTE]
> All services run under the shared internal bridge network `app-network` (`atlas-commerce-lab_app-network`). Inside containers, services communicate using service names as hostnames: `http://frontend:80`, `http://backend:3000`, `http://ai-service:8000`, and `vector-db:6333`.

---

## 🚀 1. Lifecycle & Smart Orchestration

### Start Entire Stack in Detached Mode
Builds images if missing and starts all services in the background:
```bash
docker compose up -d
```

### Force Complete Clean Rebuild & Launch
Rebuilds without cached layers and launches detached:
```bash
docker compose up -d --build --force-recreate
```

### Targeted Single-Service Rebuild (No Interruption to Others)
Rebuild and recreate only one service (e.g., after modifying backend or AI service code) without restarting database or other containers:
```bash
docker compose up -d --no-deps --build backend
```
```bash
docker compose up -d --no-deps --build ai-service
```

### Graceful Shutdown vs. Volume Purge
Stop containers preserving data in volumes:
```bash
docker compose down
```

Stop and eliminate all orphaned containers and delete named volumes (`qdrant_data`):
```bash
docker compose down -v --remove-orphans
```

### Restart a Stale or Unhealthy Service
```bash
docker compose restart ai-service
```

---

## 🔍 2. Deep Diagnostics & Advanced Debugging

### Real-time Filtered Logs with High Precision
View timestamped live logs with a fixed history window:
```bash
# Stream last 100 lines with timestamps for a specific service
docker compose logs -f --tail=100 -t backend

# Stream logs for AI and Database services together
docker compose logs -f --tail=50 ai-service vector-db
```

### Check Detailed Container Health Checks
Inspect the exact exit codes, stdout, and status of health checks configured in Compose:
```bash
docker inspect --format='{{json .State.Health}}' atlas-commerce-lab-backend-1 | jq .
```
```bash
docker inspect --format='{{json .State.Health}}' atlas-commerce-lab-ai-service-1 | jq .
```

### Live Resource Utilization Monitoring (`docker stats`)
Real-time CPU, RAM usage, memory limits, and I/O metrics:
```bash
# Pretty table of all project containers
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}"
```

### Interactive Shell & Terminal Access
Drop directly into the container environment for debugging:
```bash
# Backend (Node/NestJS container)
docker compose exec -it backend sh

# AI Service (Python container)
docker compose exec -it ai-service bash

# Run interactive command as root user (useful if default user lacks permissions)
docker compose exec -u 0 -it ai-service bash
```

### Inspect Processes Running Inside a Container
```bash
docker compose top backend
docker compose top ai-service
```

### Ephemeral Network Troubleshooter (`netshoot`)
Spawn a temporary diagnostic container directly inside the `app-network` namespace with tools like `curl`, `dig`, `tcpdump`, `nc`:
```bash
docker run --rm -it --network atlas-commerce-lab_app-network nicolaka/netshoot curl -v http://backend:3000/health
```

---

## 💾 3. Database & Storage Debugging


### Inspect Qdrant Vector Collections
Query Qdrant collections and cluster telemetry from the host terminal:
```bash
# List all collections
curl -s http://localhost:6333/collections | jq .

# Inspect specific collection (e.g., knowledge or products)
curl -s http://localhost:6333/collections/knowledge | jq .

# Check Qdrant cluster telemetry & version
curl -s http://localhost:6333/telemetry | jq .
```

### Inspect Named Volumes & Disk Usage
```bash
# List named volumes
docker volume ls --filter "name=atlas-commerce-lab"

# Inspect mount point on host
docker volume inspect atlas-commerce-lab_pgvector_data
docker volume inspect atlas-commerce-lab_qdrant_data
```

---

## 🌐 4. Network, DNS & Connectivity Diagnostics

### Inspect Docker Compose Network
View all connected containers, assigned internal IPs, and gateway configurations:
```bash
docker network inspect atlas-commerce-lab_app-network
```

### Verify Inter-Container DNS Resolution
Test if containers can resolve each other by internal hostname:
```bash
# From backend to ai-service
docker compose exec backend node -e "fetch('http://ai-service:8000/health').then(r=>console.log('Status:', r.status))"

# From ai-service to vector-db (Qdrant)
docker compose exec ai-service python -c "import urllib.request; print(urllib.request.urlopen('http://vector-db:6333/collections').read().decode())"
```

### Test Host Gateway (`host.docker.internal` -> Ollama)
Verify that containers can reach Ollama running on your host machine:
```bash
docker compose exec ai-service python -c "import urllib.request; print(urllib.request.urlopen('http://host.docker.internal:11434/api/tags').read().decode()[:200])"
```

### Check Host Port Bindings
Confirm which ports are actively bound to host interfaces:
```bash
docker compose port frontend 80
docker compose port backend 3000
docker compose port ai-service 8000
docker compose port vector-db 6333
```

---

## 📁 5. Container Filesystem & Artifact Extraction

### Copy Files To and From Containers
```bash
# Copy a file from container to local directory
docker compose cp backend:/app/package.json ./backend-package.json

# Copy local file into container without rebuilding
docker compose cp ./local-script.py ai-service:/app/local-script.py
```

### Detect File Modifications Inside Running Containers (`docker diff`)
Detect all files created (A), changed (C), or deleted (D) since container creation:
```bash
docker diff $(docker compose ps -q backend)
docker diff $(docker compose ps -q ai-service)
```

---

## 🧹 6. System Cleanup & Cache Optimization

### Analyze Docker Disk Usage
Identify images, build cache, and volume bloat:
```bash
docker system df -v
```

### Prune Build Cache (Frees GBs of dangling layers)
```bash
docker builder prune -f
```

### Complete Docker Reset (High Impact)
> [!CAUTION]
> The following command removes all stopped containers, unused networks, and dangling images:
```bash
docker system prune -a --volumes
```

---

## ⚡ 7. Daily Cheat Sheet: Top One-Liners

| Task | Command |
| :--- | :--- |
| **Start everything** | `docker compose up -d` |
| **Stop everything** | `docker compose down` |
| **Rebuild frontend fast** | `docker compose up -d --no-deps --build frontend` |
| **Rebuild backend fast** | `docker compose up -d --no-deps --build backend` |
| **Rebuild AI service fast** | `docker compose up -d --no-deps --build ai-service` |
| **Follow backend logs** | `docker compose logs -f backend` |
| **Follow AI logs** | `docker compose logs -f ai-service` |
| **Check container health** | `docker compose ps` |
| **Reset all DB volumes** | `docker compose down -v && docker compose up -d` |
| **Open Qdrant Dashboard** | Open [http://localhost:6333/dashboard](http://localhost:6333/dashboard) in browser |
