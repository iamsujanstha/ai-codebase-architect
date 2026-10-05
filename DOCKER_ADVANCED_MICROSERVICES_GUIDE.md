# 🎓 Docker Advanced Architecture: LLMs, Vector DBs, Redis & Microservices
## The Complete Interview-Ready Guide

> **Purpose**: This guide covers everything you need to know about Docker, LLMs, Vector Databases, Redis, and microservices architecture. No external documentation needed - everything explained from first principles to production-level implementation.

---

## 📚 Table of Contents

### Part 1: Docker Fundamentals
1. [Docker Execution Flow Deep Dive](#docker-execution-flow)
2. [Docker Networking Mastery](#docker-networking)
3. [Docker Storage & Volumes](#docker-storage)
4. [Docker Compose Orchestration](#docker-compose)

### Part 2: LLM Architecture
5. [Understanding LLMs](#understanding-llms)
6. [LLM Serving Architecture](#llm-serving)
7. [Ollama Deep Dive](#ollama-deep-dive)
8. [LLM Optimization Techniques](#llm-optimization)

### Part 3: Vector Databases
9. [What are Vector Databases?](#vector-databases)
10. [Qdrant Architecture](#qdrant-architecture)
11. [RAG (Retrieval Augmented Generation)](#rag-architecture)
12. [Vector Search Algorithms](#vector-search)

### Part 4: Redis Mastery
13. [Redis Architecture](#redis-architecture)
14. [Redis Data Structures](#redis-data-structures)
15. [Redis Use Cases](#redis-use-cases)
16. [Redis Persistence](#redis-persistence)

### Part 5: Microservices
17. [Microservices Architecture](#microservices-architecture)
18. [Service Communication](#service-communication)
19. [Complete Production Stack](#production-stack)
20. [Monitoring & Observability](#monitoring)

### Part 6: Interview Preparation
21. [Common Interview Questions](#interview-questions)
22. [Hidden Knowledge & Myths](#hidden-knowledge)
23. [Real-World Scenarios](#real-world-scenarios)
24. [Performance Optimization](#performance-optimization)

---

## 🔄 PART 1: Docker Execution Flow Deep Dive {#docker-execution-flow}

### The Complete Docker Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DOCKER EXECUTION FLOW                                 │
│                    (What Happens Behind the Scenes)                      │
└─────────────────────────────────────────────────────────────────────────┘

STEP 1: DOCKERFILE → STEP 2: IMAGE → STEP 3: CONTAINER → STEP 4: RUNNING APP

Let me explain each step in extreme detail:
```

### Step 1: Dockerfile - The Blueprint

```dockerfile
# ============================================================================
# EXAMPLE DOCKERFILE WITH DETAILED EXPLANATIONS
# ============================================================================

# FROM - Base Image Selection
# What it does: Downloads and uses an existing image as starting point
# Why: Don't build from scratch, reuse tested base images
# Interview Q: "What's the difference between scratch and alpine?"
# Answer: 
# - scratch: Empty image, 0 bytes, for static binaries only
# - alpine: Minimal Linux (5MB), has package manager, shell
FROM python:3.11-slim
# slim: Debian-based, 50MB, has apt-get
# alpine: Alpine-based, 15MB, has apk
# full: Debian-based, 300MB, has everything

# LABEL - Metadata
# What it does: Adds metadata to image
# Why: Documentation, image management, filtering
# Interview Q: "How do you find all images from a specific maintainer?"
# Answer: docker images --filter "label=maintainer=you@example.com"
LABEL maintainer="you@example.com"
LABEL version="1.0"
LABEL description="Production Python API"

# ARG - Build-time Variables
# What it does: Variables available only during build
# Why: Customize builds without changing Dockerfile
# Interview Q: "Difference between ARG and ENV?"
# Answer:
# - ARG: Build-time only, not in final image
# - ENV: Runtime, persists in image, available to container
ARG PYTHON_VERSION=3.11
ARG APP_DIR=/app

# ENV - Environment Variables
# What it does: Sets environment variables in container
# Why: Configure application behavior
# Interview Q: "How to override ENV at runtime?"
# Answer: docker run -e NEW_VALUE=xyz image
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# WORKDIR - Set Working Directory
# What it does: Creates directory and sets it as current
# Why: All subsequent commands run from here
# Interview Q: "What if directory doesn't exist?"
# Answer: Docker creates it automatically
WORKDIR /app

# COPY vs ADD
# COPY: Simple file copy (preferred)
# ADD: Copy + extract tar + download URLs (avoid unless needed)
# Interview Q: "When to use ADD over COPY?"
# Answer: Only when you need to extract tar files automatically
COPY requirements.txt .
# Copies from build context to container
# . means current WORKDIR (/app)

# RUN - Execute Commands During Build
# What it does: Runs command and commits result as new layer
# Why: Install dependencies, setup environment
# Interview Q: "Why chain commands with &&?"
# Answer: Each RUN creates a new layer. Chaining reduces layers and image size
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        g++ \
        && \
    pip install --no-cache-dir -r requirements.txt && \
    apt-get purge -y gcc g++ && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*
# Why remove build tools? Reduce image size (security + performance)

# COPY Application Code
# Why separate from requirements? Layer caching!
# If code changes but requirements don't, Docker reuses cached layer
COPY . .

# USER - Security Best Practice
# What it does: Switch to non-root user
# Why: Security - if container compromised, attacker has limited permissions
# Interview Q: "Why not always run as root?"
# Answer: Principle of least privilege. Root in container = root on host (with escape)
RUN addgroup --system --gid 1001 appuser && \
    adduser --system --uid 1001 --gid 1001 appuser && \
    chown -R appuser:appuser /app
USER appuser

# EXPOSE - Document Ports
# What it does: Documents which ports app uses
# Why: Documentation only! Doesn't actually publish ports
# Interview Q: "Does EXPOSE publish the port?"
# Answer: No! It's documentation. Use -p flag in docker run to publish
EXPOSE 8000

# HEALTHCHECK - Container Health Monitoring
# What it does: Defines how to check if container is healthy
# Why: Docker can auto-restart unhealthy containers
# Interview Q: "What's the difference between healthy and running?"
# Answer: Running = process exists. Healthy = app responding correctly
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# CMD vs ENTRYPOINT
# CMD: Default command, can be overridden
# ENTRYPOINT: Always runs, CMD becomes arguments
# Interview Q: "When to use ENTRYPOINT vs CMD?"
# Answer:
# - CMD: When you want flexibility (docker run image different-command)
# - ENTRYPOINT: When container should always run specific executable
CMD ["python", "app.py"]
# Could also use ENTRYPOINT:
# ENTRYPOINT ["python"]
# CMD ["app.py"]
# Then: docker run image other-script.py (runs python other-script.py)
```

### Step 2: Image Building Process

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DOCKER BUILD PROCESS                                  │
└─────────────────────────────────────────────────────────────────────────┘

Command: docker build -t myapp:v1 .

What happens step-by-step:

1. BUILD CONTEXT PREPARATION
   ├─ Docker reads .dockerignore
   ├─ Collects all files in current directory (.)
   ├─ Sends context to Docker daemon
   └─ Size matters! Large context = slow build
   
   Interview Q: "How to reduce build context size?"
   Answer: Use .dockerignore, multi-stage builds, separate build directory

2. LAYER CREATION (Each instruction = 1 layer)
   
   Layer 1: FROM python:3.11-slim
   ├─ Check local cache
   ├─ If not found, pull from Docker Hub
   ├─ Download: 50MB
   └─ SHA256: abc123...
   
   Layer 2: WORKDIR /app
   ├─ Create directory
   ├─ Size: 4KB
   └─ SHA256: def456...
   
   Layer 3: COPY requirements.txt .
   ├─ Copy file
   ├─ Size: 2KB
   └─ SHA256: ghi789...
   
   Layer 4: RUN pip install -r requirements.txt
   ├─ Execute command
   ├─ Install packages
   ├─ Size: 200MB
   └─ SHA256: jkl012...
   
   Layer 5: COPY . .
   ├─ Copy application code
   ├─ Size: 10MB
   └─ SHA256: mno345...
   
   Layer 6: CMD ["python", "app.py"]
   ├─ Metadata only
   ├─ Size: 0 bytes
   └─ SHA256: pqr678...

3. LAYER CACHING
   ├─ Docker checks if layer already exists
   ├─ Uses SHA256 hash of instruction + content
   ├─ If match found: "Using cache"
   ├─ If no match: Rebuild from this layer onwards
   └─ Why order matters: Put changing layers last
   
   Interview Q: "Why put COPY . . after pip install?"
   Answer: Code changes frequently, dependencies don't. 
           This way, dependency layer is cached.

4. IMAGE STORAGE
   ├─ Layers stored in: /var/lib/docker/overlay2/
   ├─ Each layer is read-only
   ├─ Layers are shared between images
   └─ Total size: 262MB (but shared layers reduce actual disk usage)

5. IMAGE TAGGING
   ├─ Tag: myapp:v1
   ├─ Also tagged as: myapp:latest (if no tag specified)
   └─ Image ID: sha256:abc123def456...
```

### Step 3: Container Creation

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CONTAINER CREATION PROCESS                            │
└─────────────────────────────────────────────────────────────────────────┘

Command: docker run -d -p 8000:8000 --name myapp myapp:v1

What happens behind the scenes:

1. IMAGE LAYER PREPARATION
   ┌────────────────────────────────────────────────────────────────┐
   │ Read-Only Image Layers (from image)                            │
   ├────────────────────────────────────────────────────────────────┤
   │ Layer 6: CMD metadata                                          │
   │ Layer 5: Application code (10MB)                               │
   │ Layer 4: Python packages (200MB)                               │
   │ Layer 3: requirements.txt (2KB)                                │
   │ Layer 2: /app directory (4KB)                                  │
   │ Layer 1: Base OS + Python (50MB)                               │
   └────────────────────────────────────────────────────────────────┘
                            ↓
   ┌────────────────────────────────────────────────────────────────┐
   │ Read-Write Container Layer (new, empty)                        │
   ├────────────────────────────────────────────────────────────────┤
   │ • All file changes go here                                     │
   │ • Logs, temp files, uploaded files                             │
   │ • Uses Copy-on-Write (CoW)                                     │
   │ • Lost when container deleted (unless volume mounted)          │
   └────────────────────────────────────────────────────────────────┘

2. NAMESPACE CREATION (Isolation)
   
   ┌────────────────────────────────────────────────────────────────┐
   │ PID Namespace (Process Isolation)                              │
   ├────────────────────────────────────────────────────────────────┤
   │ Container View:          │ Host View:                          │
   │ PID 1: python app.py     │ PID 12345: python app.py            │
   │ PID 2: curl              │ PID 12346: curl                     │
   │                          │                                     │
   │ Container thinks it's    │ Host sees real PIDs                 │
   │ the only process         │                                     │
   └────────────────────────────────────────────────────────────────┘
   
   ┌────────────────────────────────────────────────────────────────┐
   │ Network Namespace (Network Isolation)                          │
   ├────────────────────────────────────────────────────────────────┤
   │ Container Network:       │ Host Network:                       │
   │ Interface: eth0          │ Interface: docker0                  │
   │ IP: 172.17.0.2           │ IP: 172.17.0.1                      │
   │ Ports: 8000              │ Ports: 8000 (mapped)                │
   │                          │                                     │
   │ Virtual network          │ Bridge to host                      │
   └────────────────────────────────────────────────────────────────┘
   
   ┌────────────────────────────────────────────────────────────────┐
   │ Mount Namespace (Filesystem Isolation)                         │
   ├────────────────────────────────────────────────────────────────┤
   │ Container sees:          │ Host sees:                          │
   │ /                        │ /var/lib/docker/overlay2/abc123/   │
   │ /app                     │ /var/lib/docker/overlay2/abc123/app│
   │ /tmp                     │ /var/lib/docker/overlay2/abc123/tmp│
   │                          │                                     │
   │ Isolated filesystem      │ Actual location on disk             │
   └────────────────────────────────────────────────────────────────┘
   
   ┌────────────────────────────────────────────────────────────────┐
   │ UTS Namespace (Hostname Isolation)                             │
   ├────────────────────────────────────────────────────────────────┤
   │ Container hostname: abc123def456                               │
   │ Host hostname: my-server                                       │
   └────────────────────────────────────────────────────────────────┘
   
   ┌────────────────────────────────────────────────────────────────┐
   │ IPC Namespace (Inter-Process Communication Isolation)          │
   ├────────────────────────────────────────────────────────────────┤
   │ Shared memory, semaphores isolated from host                   │
   └────────────────────────────────────────────────────────────────┘
   
   ┌────────────────────────────────────────────────────────────────┐
   │ User Namespace (User ID Isolation)                             │
   ├────────────────────────────────────────────────────────────────┤
   │ Container UID 1000 → Host UID 100000                           │
   │ Security: Root in container ≠ Root on host                     │
   └────────────────────────────────────────────────────────────────┘

3. CGROUPS (Resource Limits)
   
   ┌────────────────────────────────────────────────────────────────┐
   │ CPU Limits                                                     │
   ├────────────────────────────────────────────────────────────────┤
   │ --cpus=2.0          → Maximum 2 CPU cores                      │
   │ --cpu-shares=1024   → Relative weight (default)               │
   │ --cpuset-cpus=0,1   → Pin to specific cores                   │
   └────────────────────────────────────────────────────────────────┘
   
   ┌────────────────────────────────────────────────────────────────┐
   │ Memory Limits                                                  │
   ├────────────────────────────────────────────────────────────────┤
   │ --memory=512m       → Hard limit (OOM kill if exceeded)       │
   │ --memory-reservation=256m → Soft limit                        │
   │ --memory-swap=1g    → Memory + Swap limit                     │
   └────────────────────────────────────────────────────────────────┘
   
   ┌────────────────────────────────────────────────────────────────┐
   │ Disk I/O Limits                                                │
   ├────────────────────────────────────────────────────────────────┤
   │ --blkio-weight=500  → Relative I/O weight                     │
   │ --device-read-bps   → Read bytes per second                   │
   │ --device-write-bps  → Write bytes per second                  │
   └────────────────────────────────────────────────────────────────┘

4. NETWORK SETUP
   
   ┌────────────────────────────────────────────────────────────────┐
   │ Port Mapping: -p 8000:8000                                     │
   ├────────────────────────────────────────────────────────────────┤
   │                                                                │
   │ Client Request                                                 │
   │      ↓                                                         │
   │ Host:8000 (iptables NAT rule)                                  │
   │      ↓                                                         │
   │ docker0 bridge (172.17.0.1)                                    │
   │      ↓                                                         │
   │ Container eth0 (172.17.0.2:8000)                               │
   │      ↓                                                         │
   │ Application                                                    │
   │                                                                │
   │ iptables rule:                                                 │
   │ DNAT: 0.0.0.0:8000 → 172.17.0.2:8000                           │
   └────────────────────────────────────────────────────────────────┘

5. VOLUME MOUNTING
   
   ┌────────────────────────────────────────────────────────────────┐
   │ Volume Types                                                   │
   ├────────────────────────────────────────────────────────────────┤
   │ 1. Named Volume: -v mydata:/app/data                           │
   │    Location: /var/lib/docker/volumes/mydata/_data             │
   │    Managed by Docker, persists after container deletion        │
   │                                                                │
   │ 2. Bind Mount: -v /host/path:/container/path                   │
   │    Direct mapping to host filesystem                           │
   │    Changes visible on both sides immediately                   │
   │                                                                │
   │ 3. tmpfs Mount: --tmpfs /app/temp                              │
   │    Stored in RAM, fast but not persistent                      │
   │    Lost when container stops                                   │
   └────────────────────────────────────────────────────────────────┘

6. PROCESS EXECUTION
   
   ┌────────────────────────────────────────────────────────────────┐
   │ Container Startup Sequence                                     │
   ├────────────────────────────────────────────────────────────────┤
   │ 1. Create namespaces                                           │
   │ 2. Set up cgroups                                              │
   │ 3. Mount filesystem layers                                     │
   │ 4. Configure network                                           │
   │ 5. Set environment variables                                   │
   │ 6. Change to WORKDIR                                           │
   │ 7. Switch to USER                                              │
   │ 8. Execute CMD/ENTRYPOINT                                      │
   │ 9. Start health checks                                         │
   └────────────────────────────────────────────────────────────────┘
```



### Interview Question: What happens when you run `docker compose up`?

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DOCKER COMPOSE UP - COMPLETE FLOW                     │
└─────────────────────────────────────────────────────────────────────────┘

Command: docker compose up -d

Step-by-Step Execution:

1. PARSE DOCKER-COMPOSE.YML
   ├─ Read YAML file
   ├─ Validate syntax
   ├─ Resolve environment variables (${VAR})
   ├─ Merge multiple compose files (if any)
   └─ Build dependency graph
   
   Example dependency graph:
   nginx → api → database
         ↘     ↗
           redis

2. CREATE NETWORKS
   ├─ Check if network exists
   ├─ If not, create: myapp_default
   ├─ Type: bridge
   ├─ Subnet: 172.20.0.0/16 (auto-assigned)
   ├─ Gateway: 172.20.0.1
   └─ Enable DNS: Container name resolution
   
   Interview Q: "How do containers find each other?"
   Answer: Docker's embedded DNS server resolves container names to IPs

3. CREATE VOLUMES
   ├─ Named volumes: docker volume create myapp_data
   ├─ Location: /var/lib/docker/volumes/myapp_data/_data
   ├─ Bind mounts: Validate host path exists
   └─ Set permissions

4. PULL/BUILD IMAGES (in parallel when possible)
   ├─ Check if image exists locally
   ├─ If build: specified, run docker build
   ├─ If image: specified, pull from registry
   ├─ Use cache when possible
   └─ Tag images

5. CREATE CONTAINERS (respecting depends_on)
   
   Order based on dependencies:
   
   Step 1: Create database (no dependencies)
   ├─ Container name: myapp_database_1
   ├─ Network: myapp_default
   ├─ IP: 172.20.0.2
   └─ Status: Created
   
   Step 2: Create redis (no dependencies)
   ├─ Container name: myapp_redis_1
   ├─ Network: myapp_default
   ├─ IP: 172.20.0.3
   └─ Status: Created
   
   Step 3: Create api (depends on database, redis)
   ├─ Wait for database health check
   ├─ Wait for redis health check
   ├─ Container name: myapp_api_1
   ├─ Network: myapp_default
   ├─ IP: 172.20.0.4
   └─ Status: Created
   
   Step 4: Create nginx (depends on api)
   ├─ Wait for api health check
   ├─ Container name: myapp_nginx_1
   ├─ Network: myapp_default
   ├─ IP: 172.20.0.5
   └─ Status: Created

6. START CONTAINERS (in dependency order)
   ├─ Start database
   ├─ Start redis
   ├─ Wait for health checks
   ├─ Start api
   ├─ Wait for health check
   ├─ Start nginx
   └─ All services running

7. ATTACH TO LOGS (if not -d flag)
   └─ Stream logs from all containers

8. MONITOR HEALTH
   ├─ Run health check commands
   ├─ Update container status
   └─ Restart unhealthy containers (if restart policy set)
```

---

## 🌐 Docker Networking Mastery {#docker-networking}

### Network Types Deep Dive

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DOCKER NETWORK TYPES                                  │
└─────────────────────────────────────────────────────────────────────────┘

1. BRIDGE NETWORK (Default)
┌──────────────────────────────────────────────────────────────────────────┐
│ Host Machine (192.168.1.100)                                             │
│ ┌────────────────────────────────────────────────────────────────────┐  │
│ │ Docker Bridge (docker0)                                            │  │
│ │ IP: 172.17.0.1                                                     │  │
│ │ Subnet: 172.17.0.0/16                                              │  │
│ │                                                                    │  │
│ │ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │  │
│ │ │ Container 1  │  │ Container 2  │  │ Container 3  │             │  │
│ │ │ 172.17.0.2   │  │ 172.17.0.3   │  │ 172.17.0.4   │             │  │
│ │ │ nginx        │  │ api          │  │ database     │             │  │
│ │ │              │  │              │  │              │             │  │
│ │ │ Port: 80     │  │ Port: 8000   │  │ Port: 5432   │             │  │
│ │ └──────────────┘  └──────────────┘  └──────────────┘             │  │
│ └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│ Port Mapping (iptables NAT):                                             │
│ Host:8080 → 172.17.0.2:80                                                │
│ Host:3000 → 172.17.0.3:8000                                              │
└──────────────────────────────────────────────────────────────────────────┘

How it works:
• Each container gets its own network namespace
• Virtual ethernet pair (veth) connects container to bridge
• Docker's embedded DNS resolves container names
• iptables rules handle port forwarding

Communication:
• Container → Container: Use container name (api:8000)
• Container → Internet: Through docker0 bridge and host NAT
• Host → Container: Through port mapping (localhost:8080)
• External → Container: Through host IP and port mapping

Interview Q: "Can containers on different bridge networks communicate?"
Answer: No, unless you connect them to the same network or use host network

2. HOST NETWORK
┌──────────────────────────────────────────────────────────────────────────┐
│ Container shares host's network stack                                    │
│ No network isolation                                                     │
│ No port mapping needed                                                   │
│ Container binds directly to host ports                                   │
│                                                                          │
│ Use case:                                                                │
│ • Maximum network performance                                            │
│ • Network monitoring tools                                               │
│ • When you need to bind to all host interfaces                           │
│                                                                          │
│ Trade-off:                                                               │
│ • Less isolation (security concern)                                      │
│ • Port conflicts with host services                                      │
│ • Can't run multiple containers on same port                             │
└──────────────────────────────────────────────────────────────────────────┘

Example:
docker run --network host nginx
# Nginx binds to host's port 80 directly

3. OVERLAY NETWORK (Docker Swarm)
┌──────────────────────────────────────────────────────────────────────────┐
│ Multi-host networking                                                    │
│ Containers on different machines can communicate                         │
│                                                                          │
│ ┌─────────────────────┐         ┌─────────────────────┐                 │
│ │ Host 1              │         │ Host 2              │                 │
│ │ ┌─────────────────┐ │         │ ┌─────────────────┐ │                 │
│ │ │ Container A     │ │ VXLAN   │ │ Container B     │ │                 │
│ │ │ 10.0.0.2        │◄├─────────┤►│ 10.0.0.3        │ │                 │
│ │ └─────────────────┘ │         │ └─────────────────┘ │                 │
│ └─────────────────────┘         └─────────────────────┘                 │
│                                                                          │
│ How it works:                                                            │
│ • VXLAN encapsulation                                                    │
│ • Gossip protocol for service discovery                                  │
│ • Encrypted by default                                                   │
│                                                                          │
│ Use case:                                                                │
│ • Distributed applications                                               │
│ • Microservices across multiple hosts                                    │
│ • Docker Swarm or Kubernetes                                             │
└──────────────────────────────────────────────────────────────────────────┘

4. MACVLAN NETWORK
┌──────────────────────────────────────────────────────────────────────────┐
│ Container gets its own MAC address                                       │
│ Appears as physical device on network                                    │
│                                                                          │
│ ┌─────────────────────────────────────────────────────────────────┐     │
│ │ Physical Network (192.168.1.0/24)                               │     │
│ │                                                                  │     │
│ │ ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │     │
│ │ │ Host     │  │ Router   │  │ Container│  │ Container│         │     │
│ │ │ .100     │  │ .1       │  │ .101     │  │ .102     │         │     │
│ │ └──────────┘  └──────────┘  └──────────┘  └──────────┘         │     │
│ └─────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│ Use case:                                                                │
│ • Legacy applications expecting physical network                         │
│ • Network monitoring/packet capture                                      │
│ • When you need container to be "first-class" network citizen            │
└──────────────────────────────────────────────────────────────────────────┘

5. NONE NETWORK
┌──────────────────────────────────────────────────────────────────────────┐
│ No networking                                                            │
│ Only loopback interface                                                  │
│ Complete network isolation                                               │
│                                                                          │
│ Use case:                                                                │
│ • Batch processing jobs                                                  │
│ • Security-sensitive workloads                                           │
│ • When network is not needed                                             │
└──────────────────────────────────────────────────────────────────────────┘
```

### DNS Resolution in Docker

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DOCKER DNS RESOLUTION                                 │
└─────────────────────────────────────────────────────────────────────────┘

How containers find each other:

1. Container makes DNS query: "api"
   ↓
2. Query goes to Docker's embedded DNS server (127.0.0.11)
   ↓
3. DNS server looks up container name in network
   ↓
4. Returns IP address: 172.20.0.4
   ↓
5. Container connects to 172.20.0.4

Example:
┌──────────────────────────────────────────────────────────────────────────┐
│ docker-compose.yml                                                       │
├──────────────────────────────────────────────────────────────────────────┤
│ services:                                                                │
│   api:                                                                   │
│     image: myapi                                                         │
│   database:                                                              │
│     image: postgres                                                      │
└──────────────────────────────────────────────────────────────────────────┘

In api container:
• ping database → Works! Resolves to database container IP
• curl http://database:5432 → Works!
• psql -h database -U user → Works!

Interview Q: "What if I have multiple replicas of a service?"
Answer: Docker load balances DNS queries across all replicas (round-robin)

Interview Q: "Can I use custom DNS servers?"
Answer: Yes, use --dns flag or dns: in compose file
```

---

## 💾 Docker Storage & Volumes {#docker-storage}

### Storage Drivers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DOCKER STORAGE DRIVERS                                │
└─────────────────────────────────────────────────────────────────────────┘

1. OVERLAY2 (Recommended, Default on most systems)
┌──────────────────────────────────────────────────────────────────────────┐
│ How it works:                                                            │
│ ┌────────────────────────────────────────────────────────────────────┐  │
│ │ Container Layer (Read-Write)                                       │  │
│ │ /var/lib/docker/overlay2/abc123/diff                               │  │
│ ├────────────────────────────────────────────────────────────────────┤  │
│ │ Image Layer 3 (Read-Only)                                          │  │
│ │ /var/lib/docker/overlay2/def456/diff                               │  │
│ ├────────────────────────────────────────────────────────────────────┤  │
│ │ Image Layer 2 (Read-Only)                                          │  │
│ │ /var/lib/docker/overlay2/ghi789/diff                               │  │
│ ├────────────────────────────────────────────────────────────────────┤  │
│ │ Image Layer 1 (Read-Only)                                          │  │
│ │ /var/lib/docker/overlay2/jkl012/diff                               │  │
│ └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│ Copy-on-Write (CoW):                                                     │
│ • Read: From lowest layer that has the file                              │
│ • Write: Copy file to container layer, then modify                       │
│ • Delete: Create "whiteout" file in container layer                      │
│                                                                          │
│ Advantages:                                                              │
│ • Fast                                                                   │
│ • Efficient disk usage                                                   │
│ • Native Linux kernel support                                            │
└──────────────────────────────────────────────────────────────────────────┘

2. AUFS (Legacy)
• Older union filesystem
• Used on Ubuntu 14.04
• Being phased out

3. DEVICEMAPPER
• Block-level storage
• Used on older RHEL/CentOS
• More complex configuration

4. BTRFS
• Copy-on-write filesystem
• Requires Btrfs filesystem on host
• Good for snapshots

5. ZFS
• Advanced filesystem
• Excellent for data integrity
• Higher memory usage
```

### Volume Types Deep Dive

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    DOCKER VOLUME TYPES                                   │
└─────────────────────────────────────────────────────────────────────────┘

1. NAMED VOLUMES (Recommended for production)
┌──────────────────────────────────────────────────────────────────────────┐
│ Creation:                                                                │
│ docker volume create mydata                                              │
│                                                                          │
│ Usage:                                                                   │
│ docker run -v mydata:/app/data myapp                                     │
│                                                                          │
│ Location:                                                                │
│ /var/lib/docker/volumes/mydata/_data                                     │
│                                                                          │
│ Characteristics:                                                         │
│ • Managed by Docker                                                      │
│ • Persists after container deletion                                      │
│ • Can be shared between containers                                       │
│ • Backed up easily                                                       │
│ • Works across different hosts (with volume drivers)                     │
│                                                                          │
│ Use cases:                                                               │
│ • Database data                                                          │
│ • Application state                                                      │
│ • Uploaded files                                                         │
│ • Logs                                                                   │
│                                                                          │
│ Interview Q: "What happens to volume when container is deleted?"         │
│ Answer: Volume persists! Must explicitly delete with docker volume rm    │
└──────────────────────────────────────────────────────────────────────────┘

2. BIND MOUNTS
┌──────────────────────────────────────────────────────────────────────────┐
│ Usage:                                                                   │
│ docker run -v /host/path:/container/path myapp                           │
│                                                                          │
│ Characteristics:                                                         │
│ • Direct mapping to host filesystem                                      │
│ • Changes visible on both sides immediately                              │
│ • Host path must exist                                                   │
│ • Full host filesystem access (security concern)                         │
│                                                                          │
│ Use cases:                                                               │
│ • Development (live code reload)                                         │
│ • Configuration files                                                    │
│ • Sharing files between host and container                               │
│                                                                          │
│ Example:                                                                 │
│ docker run -v $(pwd)/src:/app/src myapp                                  │
│ # Edit src/app.py on host → Changes immediately in container             │
│                                                                          │
│ Interview Q: "Bind mount vs named volume?"                               │
│ Answer:                                                                  │
│ • Bind mount: Development, need host access                              │
│ • Named volume: Production, Docker-managed, portable                     │
└──────────────────────────────────────────────────────────────────────────┘

3. TMPFS MOUNTS
┌──────────────────────────────────────────────────────────────────────────┐
│ Usage:                                                                   │
│ docker run --tmpfs /app/temp:rw,size=100m myapp                          │
│                                                                          │
│ Characteristics:                                                         │
│ • Stored in RAM                                                          │
│ • Very fast                                                              │
│ • Not persistent                                                         │
│ • Lost when container stops                                              │
│ • Never written to disk                                                  │
│                                                                          │
│ Use cases:                                                               │
│ • Temporary files                                                        │
│ • Sensitive data (passwords, keys)                                       │
│ • Cache                                                                  │
│ • High-performance temp storage                                          │
│                                                                          │
│ Interview Q: "When to use tmpfs?"                                        │
│ Answer: When you need fast temp storage and don't want data on disk      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Volume Drivers

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    VOLUME DRIVERS                                        │
└─────────────────────────────────────────────────────────────────────────┘

1. LOCAL (Default)
• Stores data on host filesystem
• /var/lib/docker/volumes/

2. NFS
• Network File System
• Share volumes across hosts
• Example:
  docker volume create --driver local \
    --opt type=nfs \
    --opt o=addr=192.168.1.100,rw \
    --opt device=:/path/to/dir \
    nfs-volume

3. CIFS/SMB
• Windows file sharing
• Mount Windows shares in containers

4. CLOUD PROVIDERS
• AWS EBS
• Azure Disk
• Google Persistent Disk
• Allows volumes to move with containers

5. DISTRIBUTED STORAGE
• GlusterFS
• Ceph
• Portworx
• For high availability
```

---

## 🤖 PART 2: Understanding LLMs {#understanding-llms}

### What is an LLM?

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LARGE LANGUAGE MODEL (LLM)                            │
└─────────────────────────────────────────────────────────────────────────┘

SIMPLE EXPLANATION:
An LLM is like a super-smart autocomplete that understands context.
It predicts what word/token comes next based on patterns learned from
billions of text examples.

TECHNICAL EXPLANATION:
• Architecture: Transformer-based neural network
• Training: Self-supervised learning on massive text corpora
• Size: Billions of parameters (weights)
  - GPT-3: 175 billion parameters
  - LLaMA 2: 7B, 13B, 70B parameters
  - GPT-4: ~1.7 trillion parameters (estimated)
• Function: Text generation, understanding, reasoning, translation

HOW IT WORKS:
┌──────────────────────────────────────────────────────────────────────────┐
│ Input: "The capital of France is"                                       │
│                                                                          │
│ 1. TOKENIZATION                                                          │
│    "The capital of France is" → [464, 3139, 286, 4881, 318]             │
│    Each word/subword becomes a number                                    │
│                                                                          │
│ 2. EMBEDDING                                                             │
│    [464, 3139, 286, 4881, 318] → [[0.1, 0.5, ...], [0.3, 0.2, ...]]    │
│    Convert tokens to high-dimensional vectors (e.g., 4096 dimensions)   │
│                                                                          │
│ 3. TRANSFORMER LAYERS (repeated 32-96 times)                             │
│    ┌────────────────────────────────────────────────────────────────┐   │
│    │ Self-Attention                                                 │   │
│    │ • Each token "looks at" all other tokens                       │   │
│    │ • Learns relationships: "capital" relates to "France"          │   │
│    │ • Attention weights: Which tokens are important?               │   │
│    ├────────────────────────────────────────────────────────────────┤   │
│    │ Feed-Forward Network                                           │   │
│    │ • Process each token independently                             │   │
│    │ • Learn patterns and transformations                           │   │
│    └────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│ 4. OUTPUT LAYER                                                          │
│    Probability distribution over all possible next tokens:              │
│    "Paris": 0.85                                                         │
│    "London": 0.05                                                        │
│    "Berlin": 0.03                                                        │
│    ...                                                                   │
│                                                                          │
│ 5. SAMPLING                                                              │
│    Select next token based on probabilities and temperature              │
│    Temperature = 0: Always pick highest probability (deterministic)     │
│    Temperature = 1: Sample from distribution (creative)                 │
│                                                                          │
│ 6. REPEAT                                                                │
│    Add "Paris" to input, generate next token, repeat until done         │
│                                                                          │
│ Output: "The capital of France is Paris"                                │
└──────────────────────────────────────────────────────────────────────────┘
```

### LLM Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    TRANSFORMER ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────┘

Input Text: "Hello, how are you?"
     ↓
┌────────────────────────────────────────────────────────────────────────┐
│ TOKENIZATION                                                           │
│ "Hello" → 15496                                                        │
│ "," → 11                                                               │
│ "how" → 703                                                            │
│ "are" → 389                                                            │
│ "you" → 345                                                            │
│ "?" → 30                                                               │
└────────────────────────────────────────────────────────────────────────┘
     ↓
┌────────────────────────────────────────────────────────────────────────┐
│ EMBEDDING LAYER                                                        │
│ Convert token IDs to dense vectors                                    │
│ 15496 → [0.123, -0.456, 0.789, ..., 0.234]  (4096 dimensions)        │
└────────────────────────────────────────────────────────────────────────┘
     ↓
┌────────────────────────────────────────────────────────────────────────┐
│ POSITIONAL ENCODING                                                    │
│ Add position information (word order matters!)                        │
│ Position 0: [0.000, 1.000, 0.000, ...]                               │
│ Position 1: [0.841, 0.540, 0.909, ...]                               │
└────────────────────────────────────────────────────────────────────────┘
     ↓
┌────────────────────────────────────────────────────────────────────────┐
│ TRANSFORMER BLOCK 1 (repeated N times, e.g., 32 layers)               │
│ ┌──────────────────────────────────────────────────────────────────┐  │
│ │ MULTI-HEAD SELF-ATTENTION                                        │  │
│ │                                                                  │  │
│ │ Query (Q): What am I looking for?                                │  │
│ │ Key (K): What do I contain?                                      │  │
│ │ Value (V): What information do I have?                           │  │
│ │                                                                  │  │
│ │ Attention Score = softmax(Q × K^T / √d)                          │  │
│ │ Output = Attention Score × V                                     │  │
│ │                                                                  │  │
│ │ Example:                                                         │  │
│ │ "Hello" pays attention to:                                       │  │
│ │ • "Hello": 0.3                                                   │  │
│ │ • ",": 0.1                                                       │  │
│ │ • "how": 0.2                                                     │  │
│ │ • "are": 0.2                                                     │  │
│ │ • "you": 0.2                                                     │  │
│ └──────────────────────────────────────────────────────────────────┘  │
│ ┌──────────────────────────────────────────────────────────────────┐  │
│ │ ADD & NORMALIZE                                                  │  │
│ │ Residual connection + Layer normalization                        │  │
│ └──────────────────────────────────────────────────────────────────┘  │
│ ┌──────────────────────────────────────────────────────────────────┐  │
│ │ FEED-FORWARD NETWORK                                             │  │
│ │ Two linear layers with activation (GELU/ReLU)                    │  │
│ │ Hidden size: 4x embedding size (e.g., 16384)                     │  │
│ └──────────────────────────────────────────────────────────────────┘  │
│ ┌──────────────────────────────────────────────────────────────────┐  │
│ │ ADD & NORMALIZE                                                  │  │
│ └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
     ↓
┌────────────────────────────────────────────────────────────────────────┐
│ TRANSFORMER BLOCK 2                                                    │
│ (same structure, different weights)                                    │
└────────────────────────────────────────────────────────────────────────┘
     ↓
     ... (repeat 30 more times)
     ↓
┌────────────────────────────────────────────────────────────────────────┐
│ OUTPUT LAYER                                                           │
│ Linear layer: 4096 → 50,000 (vocabulary size)                         │
│ Softmax: Convert to probabilities                                     │
│                                                                        │
│ Next token probabilities:                                             │
│ "I": 0.25                                                             │
│ "I'm": 0.35                                                           │
│ "Fine": 0.15                                                          │
│ "Good": 0.10                                                          │
│ ...                                                                   │
└────────────────────────────────────────────────────────────────────────┘
     ↓
Selected token: "I'm"
```



### LLM Parameters Explained

### LLM Parameters Explained

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    KEY LLM PARAMETERS                                    │
└─────────────────────────────────────────────────────────────────────────┘

1. TEMPERATURE (0.0 - 2.0)
   Controls randomness in output
   
   Temperature = 0.0 (Deterministic)
   ├─ Always picks highest probability token
   ├─ Consistent, predictable output
   ├─ Good for: Code generation, factual Q&A, translations
   └─ Example: "The capital of France is Paris" (always same)
   
   Temperature = 0.7 (Balanced)
   ├─ Some randomness, still coherent
   ├─ Good for: General conversation, creative writing
   └─ Example: "The capital of France is Paris, a beautiful city..."
   
   Temperature = 1.5 (Creative)
   ├─ High randomness
   ├─ More diverse, sometimes incoherent
   ├─ Good for: Brainstorming, poetry, experimental content
   └─ Example: "The capital of France... Paris! Or perhaps Lyon..."

2. TOP_P (Nucleus Sampling) (0.0 - 1.0)
   Alternative to temperature
   
   Top_p = 0.1
   ├─ Only consider tokens in top 10% probability
   ├─ Very focused output
   └─ Less diverse
   
   Top_p = 0.9
   ├─ Consider tokens in top 90% probability
   ├─ More diverse while filtering nonsense
   └─ Recommended for most use cases

3. TOP_K (1 - 100)
   Limits vocabulary to top K tokens
   
   Top_k = 1
   └─ Same as temperature = 0 (deterministic)
   
   Top_k = 40
   └─ Consider only top 40 most likely tokens

4. MAX_TOKENS
   Maximum length of generated response
   
   Interview Q: "What's a token?"
   Answer: Subword unit. ~1 token = 0.75 words
           "Hello world" = 2 tokens
           "Artificial Intelligence" = 3-4 tokens

5. CONTEXT_LENGTH
   How much input the model can process
   
   GPT-3.5: 4,096 tokens (~3,000 words)
   GPT-4: 8,192 - 32,768 tokens
   Claude: 100,000 tokens
   GPT-4 Turbo: 128,000 tokens
   
   Interview Q: "What happens if input exceeds context length?"
   Answer: Truncate or use techniques like:
           - Sliding window
           - Summarization
           - RAG (Retrieval Augmented Generation)
```

---

## 🚀 LLM Serving Architecture {#llm-serving}

### Production LLM Deployment

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LLM SERVING STACK                                     │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Client (Browser/Mobile)                                                  │
└──────────────────────────────────────────────────────────────────────────┘
                            ↓ HTTPS
┌──────────────────────────────────────────────────────────────────────────┐
│ Load Balancer / API Gateway (Nginx)                                     │
│ • SSL termination                                                        │
│ • Rate limiting                                                          │
│ • Request routing                                                        │
└──────────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ API Service (FastAPI/Express)                                            │
│ • Authentication                                                         │
│ • Request validation                                                     │
│ • Prompt engineering                                                     │
│ • Response formatting                                                    │
└──────────────────────────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────┼───────────────────┐
        ↓                   ↓                   ↓
┌───────────────┐  ┌────────────────┐  ┌───────────────┐
│ Redis Cache   │  │ Vector DB      │  │ LLM Engine    │
│               │  │ (Qdrant)       │  │ (Ollama)      │
│ • Responses   │  │ • Embeddings   │  │ • Inference   │
│ • Sessions    │  │ • RAG context  │  │ • Models      │
└───────────────┘  └────────────────┘  └───────────────┘
```

### Ollama Deep Dive {#ollama-deep-dive}

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WHAT IS OLLAMA?                                       │
└─────────────────────────────────────────────────────────────────────────┘

Ollama is a tool to run LLMs locally with a simple API.

Think of it as:
• Docker for LLMs
• Download, run, and manage models easily
• Provides OpenAI-compatible API
• Optimized for CPU and GPU inference

Architecture:
┌──────────────────────────────────────────────────────────────────────────┐
│ Ollama Server (Port 11434)                                               │
│ ┌────────────────────────────────────────────────────────────────────┐  │
│ │ HTTP API Layer                                                     │  │
│ │ • /api/generate (text generation)                                  │  │
│ │ • /api/chat (chat completion)                                      │  │
│ │ • /api/embeddings (vector embeddings)                              │  │
│ │ • /api/tags (list models)                                          │  │
│ └────────────────────────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────────────────────────┐  │
│ │ Model Management                                                   │  │
│ │ • Download models from registry                                    │  │
│ │ • Load/unload models from memory                                   │  │
│ │ • Model quantization (GGUF format)                                 │  │
│ └────────────────────────────────────────────────────────────────────┘  │
│ ┌────────────────────────────────────────────────────────────────────┐  │
│ │ Inference Engine (llama.cpp)                                       │  │
│ │ • Optimized C++ implementation                                     │  │
│ │ • CPU: AVX2, AVX512 instructions                                   │  │
│ │ • GPU: CUDA (Nvidia), Metal (Mac), ROCm (AMD)                      │  │
│ │ • Memory management                                                │  │
│ └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘

Models stored in: ~/.ollama/models/
```

### Docker Compose for LLM Stack

```yaml
version: '3.9'

services:
  # ============================================================================
  # OLLAMA - LLM Inference Engine
  # ============================================================================
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    
    # GPU Support (Nvidia)
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    
    # Ports
    ports:
      - "11434:11434"
    
    # Volumes
    volumes:
      # Persist downloaded models
      - ollama_models:/root/.ollama
    
    # Environment
    environment:
      # Number of parallel requests
      - OLLAMA_NUM_PARALLEL=4
      # Keep models in memory
      - OLLAMA_KEEP_ALIVE=24h
      # Max loaded models
      - OLLAMA_MAX_LOADED_MODELS=2
    
    # Health check
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"\]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
    
    # Restart policy
    restart: unless-stopped
    
    networks:
      - ai_network

  # ============================================================================
  # QDRANT - Vector Database
  # ============================================================================
  qdrant:
    image: qdrant/qdrant:latest
    container_name: qdrant
    
    ports:
      - "6333:6333"  # HTTP API
      - "6334:6334"  # gRPC API
    
    volumes:
      # Persist vector data
      - qdrant_storage:/qdrant/storage
    
    environment:
      # Performance tuning
      - QDRANT__SERVICE__GRPC_PORT=6334
      - QDRANT__SERVICE__HTTP_PORT=6333
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6333/health"\]
      interval: 30s
      timeout: 10s
      retries: 3
    
    restart: unless-stopped
    
    networks:
      - ai_network

  # ============================================================================
  # REDIS - Caching & Session Store
  # ============================================================================
  redis:
    image: redis:7-alpine
    container_name: redis
    
    ports:
      - "6379:6379"
    
    volumes:
      - redis_data:/data
    
    # Redis configuration
    command: >
      redis-server
      --appendonly yes
      --appendfsync everysec
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
    
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
    
    restart: unless-stopped
    
    networks:
      - ai_network

  # ============================================================================
  # API SERVICE - FastAPI Backend
  # ============================================================================
  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: ai_api
    
    ports:
      - "8000:8000"
    
    environment:
      # Service URLs
      - OLLAMA_URL=http://ollama:11434
      - QDRANT_URL=http://qdrant:6333
      - REDIS_URL=redis://redis:6379
      
      # Database
      - DATABASE_URL=postgresql://user:pass@postgres:5432/aidb
      
      # API Keys
      - JWT_SECRET=${JWT_SECRET}
      - API_KEY=${API_KEY}
    
    depends_on:
      ollama:
        condition: service_healthy
      qdrant:
        condition: service_healthy
      redis:
        condition: service_healthy
      postgres:
        condition: service_healthy
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"\]
      interval: 30s
      timeout: 10s
      retries: 3
    
    restart: unless-stopped
    
    networks:
      - ai_network

  # ============================================================================
  # POSTGRES - Relational Database
  # ============================================================================
  postgres:
    image: postgres:15-alpine
    container_name: postgres
    
    ports:
      - "5432:5432"
    
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=aidb
    
    volumes:
      - postgres_data:/var/lib/postgresql/data
    
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 10s
      timeout: 5s
      retries: 5
    
    restart: unless-stopped
    
    networks:
      - ai_network

  # ============================================================================
  # NGINX - Reverse Proxy & Load Balancer
  # ============================================================================
  nginx:
    image: nginx:alpine
    container_name: nginx
    
    ports:
      - "80:80"
      - "443:443"
    
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    
    depends_on:
      - api
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"\]
      interval: 30s
      timeout: 10s
      retries: 3
    
    restart: unless-stopped
    
    networks:
      - ai_network

# ==============================================================================
# VOLUMES
# ==============================================================================
volumes:
  ollama_models:
    driver: local
  qdrant_storage:
    driver: local
  redis_data:
    driver: local
  postgres_data:
    driver: local

# ==============================================================================
# NETWORKS
# ==============================================================================
networks:
  ai_network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.25.0.0/16
```

### Why Each Service?

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SERVICE RESPONSIBILITIES                              │
└─────────────────────────────────────────────────────────────────────────┘

OLLAMA (LLM Engine)
├─ Purpose: Run language models locally
├─ Why: Privacy, cost savings, low latency
├─ When to use: Text generation, chat, embeddings
└─ Alternatives: OpenAI API, Anthropic API, HuggingFace

QDRANT (Vector Database)
├─ Purpose: Store and search embeddings
├─ Why: Semantic search, RAG, similarity matching
├─ When to use: "Find similar documents", "Search by meaning"
└─ Alternatives: Pinecone, Weaviate, Milvus, pgvector

REDIS (Cache)
├─ Purpose: Fast in-memory data store
├─ Why: Reduce LLM calls, session management, rate limiting
├─ When to use: Frequently accessed data, temporary storage
└─ Alternatives: Memcached, DragonflyDB

POSTGRES (Database)
├─ Purpose: Persistent structured data
├─ Why: User accounts, chat history, application state
├─ When to use: Relational data, transactions, complex queries
└─ Alternatives: MySQL, MongoDB, CockroachDB

NGINX (Reverse Proxy)
├─ Purpose: Route requests, SSL termination, load balancing
├─ Why: Single entry point, security, scalability
├─ When to use: Production deployments
└─ Alternatives: Traefik, HAProxy, Caddy
```


### LLM Parameters Explained

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LLM GENERATION PARAMETERS                             │
└─────────────────────────────────────────────────────────────────────────┘

1. TEMPERATURE (0.0 - 2.0)
   Controls randomness in output
   
   Temperature = 0.0 (Deterministic)
   ├─ Always picks highest probability token
   ├─ Same input → Same output
   ├─ Use for: Code generation, factual answers, translations
   └─ Example: "The capital of France is Paris" (always)
   
   Temperature = 0.7 (Balanced)
   ├─ Good mix of creativity and coherence
   ├─ Default for most applications
   ├─ Use for: General chat, content writing
   └─ Example: "The capital of France is Paris, a beautiful city..."
   
   Temperature = 1.5+ (Creative)
   ├─ Very random, creative outputs
   ├─ May produce nonsense
   ├─ Use for: Creative writing, brainstorming
   └─ Example: "The capital of France is... well, some say Paris..."

2. TOP_P (Nucleus Sampling) (0.0 - 1.0)
   Alternative to temperature
   
   Top_p = 0.1
   ├─ Only consider tokens in top 10% probability
   ├─ Very focused, deterministic
   └─ Use with: Factual tasks
   
   Top_p = 0.9
   ├─ Consider tokens in top 90% probability
   ├─ More diverse outputs
   └─ Use with: Creative tasks

3. TOP_K (1 - 100)
   Limits vocabulary to top K tokens
   
   Top_k = 1
   ├─ Only highest probability token (like temp=0)
   └─ Most deterministic
   
   Top_k = 50
   ├─ Choose from top 50 tokens
   └─ Balanced creativity

4. MAX_TOKENS / MAX_LENGTH
   Maximum number of tokens to generate
   
   ├─ Limits response length
   ├─ Prevents infinite generation
   └─ Example: max_tokens=100 → ~75 words

5. REPETITION_PENALTY (1.0 - 2.0)
   Penalizes repeated tokens
   
   1.0 = No penalty
   1.2 = Slight penalty (recommended)
   2.0 = Strong penalty (may produce nonsense)

6. PRESENCE_PENALTY & FREQUENCY_PENALTY
   Presence: Penalizes tokens that appeared at all
   Frequency: Penalizes based on how often token appeared
   
   Use for: Encouraging topic diversity

Interview Q: "Temperature vs Top_p - which to use?"
Answer: Use one or the other, not both. Temperature is more intuitive.
        Top_p is better for maintaining quality while adding randomness.
```

---

## 🚀 LLM Serving Architecture {#llm-serving}

### Production LLM Deployment

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LLM SERVING STACK                                     │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ Client (Browser/Mobile)                                                  │
└──────────────────────────────────────────────────────────────────────────┘
                            ↓ HTTPS
┌──────────────────────────────────────────────────────────────────────────┐
│ Load Balancer / API Gateway (Nginx)                                     │
│ • SSL Termination                                                        │
│ • Rate limiting                                                          │
│ • Request routing                                                        │
└──────────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ API Service (FastAPI/Node.js)                                           │
│ • Authentication                                                         │
│ • Request validation                                                     │
│ • Prompt engineering                                                     │
│ • Response formatting                                                    │
│ • Caching (Redis)                                                        │
└──────────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ LLM Inference Engine (Ollama/vLLM/TGI)                                  │
│ • Model loading                                                          │
│ • Batching requests                                                      │
│ • GPU acceleration                                                       │
│ • Token generation                                                       │
└──────────────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────────────┐
│ GPU Memory                                                               │
│ • Model weights (7B model ≈ 14GB)                                       │
│ • KV cache (context)                                                     │
│ • Activations                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 🦙 Ollama Deep Dive {#ollama-deep-dive}

### What is Ollama?

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    OLLAMA ARCHITECTURE                                   │
└─────────────────────────────────────────────────────────────────────────┘

Ollama is a tool for running LLMs locally with ease.

Think of it as "Docker for LLMs":
• Pull models like: ollama pull llama2
• Run models like: ollama run llama2
• Serve via API like: curl http://localhost:11434/api/generate

┌──────────────────────────────────────────────────────────────────────────┐
│ OLLAMA COMPONENTS                                                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ 1. MODEL REGISTRY                                                        │
│    ├─ Hosts pre-quantized models                                        │
│    ├─ Models: llama2, mistral, codellama, etc.                          │
│    └─ Sizes: 7B, 13B, 70B parameters                                    │
│                                                                          │
│ 2. MODEL LOADER                                                          │
│    ├─ Downloads models to ~/.ollama/models                              │
│    ├─ Loads into GPU/CPU memory                                         │
│    └─ Manages model lifecycle                                           │
│                                                                          │
│ 3. INFERENCE ENGINE                                                      │
│    ├─ Built on llama.cpp (C++ implementation)                           │
│    ├─ Optimized for CPU and GPU                                         │
│    ├─ Supports quantization (4-bit, 8-bit)                              │
│    └─ Batching and caching                                              │
│                                                                          │
│ 4. API SERVER                                                            │
│    ├─ REST API on port 11434                                            │
│    ├─ Endpoints: /api/generate, /api/chat, /api/embeddings             │
│    └─ Streaming support                                                 │
│                                                                          │
│ 5. CLI                                                                   │
│    ├─ Interactive chat: ollama run llama2                               │
│    ├─ Model management: ollama list, ollama rm                          │
│    └─ Server control: ollama serve                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Ollama in Docker

```dockerfile
# ============================================================================
# OLLAMA DOCKERFILE EXPLAINED
# ============================================================================

FROM ollama/ollama:latest

# Why this base image?
# • Pre-built with llama.cpp
# • Optimized for inference
# • Supports GPU (CUDA) and CPU
# • Small size (~1GB)

# Expose API port
EXPOSE 11434

# Volume for models (persistent storage)
# Why? Models are large (4GB-40GB), don't want to re-download
VOLUME /root/.ollama

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:11434/api/tags || exit 1

# Start Ollama server
CMD ["serve"]
```

### Docker Compose with Ollama

```yaml
# ============================================================================
# COMPLETE LLM STACK WITH OLLAMA
# ============================================================================

version: '3.9'

services:
  # ============================================================================
  # OLLAMA - LLM Inference Engine
  # ============================================================================
  ollama:
    image: ollama/ollama:latest
    container_name: ollama
    
    # GPU Support (NVIDIA)
    # Uncomment if you have NVIDIA GPU
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]
    
    ports:
      - "11434:11434"
    
    volumes:
      # Persist models (they're large!)
      - ollama_models:/root/.ollama
    
    environment:
      # Ollama configuration
      - OLLAMA_HOST=0.0.0.0
      - OLLAMA_ORIGINS=*
      # GPU memory fraction (0.0-1.0)
      - OLLAMA_GPU_MEMORY_FRACTION=0.9
      # Number of parallel requests
      - OLLAMA_NUM_PARALLEL=4
      # Context window size
      - OLLAMA_CONTEXT_LENGTH=4096
    
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:11434/api/tags"\]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s  # Models take time to load
    
    restart: unless-stopped
    
    networks:
      - ai_network

  # ============================================================================
  # API SERVICE - Application Layer
  # ============================================================================
  api:
    build: ./api
    container_name: ai_api
    
    ports:
      - "8000:8000"
    
    environment:
      # Ollama connection
      - OLLAMA_BASE_URL=http://ollama:11434
      - OLLAMA_MODEL=llama2:7b
      
      # Redis connection
      - REDIS_URL=redis://redis:6379
      
      # Vector DB connection
      - QDRANT_URL=http://qdrant:6333
      
      # Database
      - DATABASE_URL=postgresql://user:pass@postgres:5432/aidb
    
    depends_on:
      ollama:
        condition: service_healthy
      redis:
        condition: service_healthy
      qdrant:
        condition: service_started
      postgres:
        condition: service_healthy
    
    volumes:
      # Development: live code reload
      - ./api:/app
    
    restart: unless-stopped
    
    networks:
      - ai_network

  # ============================================================================
  # REDIS - Caching & Session Storage
  # ============================================================================
  redis:
    image: redis:7-alpine
    container_name: redis
    
    ports:
      - "6379:6379"
    
    command: >
      redis-server
      --appendonly yes
      --appendfsync everysec
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
    
    volumes:
      - redis_data:/data
    
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3
    
    restart: unless-stopped
    
    networks:
      - ai_network

  # ============================================================================
  # QDRANT - Vector Database
  # ============================================================================
  qdrant:
    image: qdrant/qdrant:latest
    container_name: qdrant
    
    ports:
      - "6333:6333"  # HTTP API
      - "6334:6334"  # gRPC API
    
    volumes:
      - qdrant_data:/qdrant/storage
    
    environment:
      - QDRANT__SERVICE__HTTP_PORT=6333
      - QDRANT__SERVICE__GRPC_PORT=6334
    
    restart: unless-stopped
    
    networks:
      - ai_network

  # ============================================================================
  # POSTGRES - Relational Database
  # ============================================================================
  postgres:
    image: postgres:15-alpine
    container_name: postgres
    
    ports:
      - "5432:5432"
    
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=aidb
    
    volumes:
      - postgres_data:/var/lib/postgresql/data
    
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 10s
      timeout: 5s
      retries: 5
    
    restart: unless-stopped
    
    networks:
      - ai_network

  # ============================================================================
  # NGINX - Reverse Proxy & Load Balancer
  # ============================================================================
  nginx:
    image: nginx:alpine
    container_name: nginx
    
    ports:
      - "80:80"
      - "443:443"
    
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    
    depends_on:
      - api
    
    restart: unless-stopped
    
    networks:
      - ai_network

# ============================================================================
# VOLUMES - Persistent Storage
# ============================================================================
volumes:
  ollama_models:
    driver: local
  redis_data:
    driver: local
  qdrant_data:
    driver: local
  postgres_data:
    driver: local

# ============================================================================
# NETWORKS - Service Communication
# ============================================================================
networks:
  ai_network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.25.0.0/16
```

### How to Use This Stack

```bash
# ============================================================================
# DEPLOYMENT COMMANDS
# ============================================================================

# 1. Start all services
docker compose up -d

# 2. Wait for Ollama to be ready (check logs)
docker compose logs -f ollama

# 3. Pull an LLM model
docker compose exec ollama ollama pull llama2:7b

# Alternative models:
# docker compose exec ollama ollama pull mistral:7b
# docker compose exec ollama ollama pull codellama:7b
# docker compose exec ollama ollama pull llama2:13b

# 4. Test Ollama directly
curl http://localhost:11434/api/generate -d '{
  "model": "llama2:7b",
  "prompt": "Why is the sky blue?",
  "stream": false
}'

# 5. Test through API service
curl http://localhost:8000/api/chat -d '{
  "message": "Hello, how are you?"
}'

# 6. Check service health
docker compose ps

# 7. View logs
docker compose logs -f api

# 8. Scale API service (if needed)
docker compose up -d --scale api=3

# 9. Stop all services
docker compose down

# 10. Stop and remove volumes (clean slate)
docker compose down -v
```

