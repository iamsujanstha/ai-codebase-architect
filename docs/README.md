# Atlas Commerce — Documentation Hub

Welcome to the documentation for **Atlas Commerce** (AI Codebase Architect). This folder organizes architectural specifications, database guides, DevOps manuals, feature implementations, and milestone histories.

---

## Directory Overview

```
docs/
├── architecture/          # System design, ADRs, boundaries, and agent briefs
│   └── adr/               # Architecture Decision Records (ADRs 001–010)
├── database/              # PostgreSQL, Neon, pgvector, queries, and migrations
├── devops-deployment/     # Docker compose, Nginx, local setup, and production deployment
├── features/              # Feature guides (Payments/eSewa, Auth, Dashboard, Integration)
├── ai-infrastructure/     # AI service, Ollama, Qdrant semantic RAG, and adapters
├── career-interview/      # Architecture interview prep, exercises, and career guides
├── milestones/            # Project execution logs, phase summaries, and redesign steps
└── diagrams/              # Architecture diagrams (Mermaid .mmd and .svg)
```

---

## 1. Architecture & Design Decisions (`docs/architecture/`)

- [**System Architecture**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/architecture/ARCHITECTURE.md) — Comprehensive technical overview, stack, and domain boundaries.
- [**Architecture Gap Analysis**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/architecture/ARCHITECTURE_GAP_ANALYSIS.md) — Production gap assessment and resilience reviews.
- [**Agent Brief**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/architecture/AGENT_BRIEF.md) — High-level technical brief for AI and engineering agents.
- [**Agent Brief: Admin**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/architecture/AGENT_BRIEF_ADMIN.md) — Admin role, governance, and dashboard specifications.
- [**Architecture Decision Records (ADRs)**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/architecture/adr/)
  - `001`: NestJS as Backend Gateway
  - `002`: MongoDB for Commerce Data
  - `003`: PostgreSQL & pgvector for Hybrid RAG
  - `004`: Qdrant for Dense Vector Semantic Memory
  - `005`: Dedicated Python FastAPI AI Microservice
  - `006`: Redis Caching and Volatile State Strategy
  - `007`: Python RQ Worker Queues
  - `008`: Server-Sent Events (SSE) & NDJSON Streaming
  - `009`: Webhook-Driven Payment Orchestration
  - `010`: Modular Monolith vs. Distributed Microservices

---

## 2. Database & Persistence (`docs/database/`)

- [**Database Learning Roadmap**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/database/DATABASE_LEARNING_ROADMAP.md) — Progressive deep-dive into transactional and vector databases.
- [**Quick Start PostgreSQL**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/database/QUICK_START_POSTGRESQL.md) — Local PostgreSQL connection and repository setup.
- [**Neon Cloud Setup**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/database/NEON_SETUP.md) — Serverless PostgreSQL setup with connection pooling.
- [**PostgreSQL Migration Guide**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/database/POSTGRESQL_MIGRATION_GUIDE.md) — Prisma migrations, schema synchronization, and rollback procedures.
- [**PostgreSQL Production Commands**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/database/POSTGRESQL_PRODUCTION_COMMANDS.md) — Operational cheat sheet for indexing, vacuuming, and stats.
- [**PostgreSQL Complete Summary**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/database/POSTGRESQL_COMPLETE_SUMMARY.md) — End-to-end database implementation reference.
- [**PostgreSQL Interview Exercises**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/database/POSTGRESQL_INTERVIEW_EXERCISES.md) — SQL query optimization and indexing challenges.
- [**PostgreSQL Setup Commands**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/database/POSTGRES_SETUP_COMMANDS.md) — CLI reference for dockerized pgvector containers.
- [**Postgres Success**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/database/POSTGRES_SUCCESS.md) — Validation checklist and database connection verification.
- [**PostgreSQL Mastery Complete**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/database/POSTGRESQL_MASTERY_COMPLETE.md) — Advanced SQL, locking, and concurrency patterns.

---

## 3. DevOps & Deployment (`docs/devops-deployment/`)

- [**Installation Guide**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/devops-deployment/installation.md) — Prerequisites, environment variables, and bootstrap steps.
- [**Docker Advanced Microservices Guide**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/devops-deployment/DOCKER_ADVANCED_MICROSERVICES_GUIDE.md) — Multi-container networking, healthchecks, and volume persistence.
- [**Docker & Nginx Deployment**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/devops-deployment/DOCKER_NGINX_DEPLOYMENT.md) — Reverse proxy, SSL, and frontend static asset caching.
- [**Deployment Success**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/devops-deployment/DEPLOYMENT_SUCCESS.md) — Automated deployment checklist and service verification.

---

## 4. Features & Integrations (`docs/features/`)

- [**Payment Integration Guide**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/features/PAYMENT_INTEGRATION_GUIDE.md) — eSewa payment gateway, HMAC signatures, and webhook reconciliation.
- [**Authentication Flow**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/features/authentication_flow.md) — JWT tokens, refresh rotation, role guards, and session state.
- [**Product Dashboard**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/features/product_dashboard.md) — Catalog administration, inventory status, and CRUD forms.
- [**Application Integration**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/features/application-integration.md) — Frontend-to-backend API contract and error handling standards.

---

## 5. AI Infrastructure & RAG (`docs/ai-infrastructure/`)

- [**AI Infrastructure**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/ai-infrastructure/ai_infrastructure.md) — Architecture of the Python FastAPI service, Qdrant vector retrieval, and LLM inference.
- [**Provider Starter**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/ai-infrastructure/provider-starter.md) — Ollama local setup (`qwen`, `nomic-embed-text`) and cloud provider adapters (OpenAI, Anthropic).

---

## 6. Career & Interview Preparation (`docs/career-interview/`)

- [**Interview Prep Guide**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/career-interview/INTERVIEW_PREP_GUIDE.md) — Staff/Senior engineer architectural discussion topics and system design breakdowns.
- [**Interview Materials Complete**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/career-interview/INTERVIEW_MATERIALS_COMPLETE.md) — Behavioral, architectural, and coding talking points.
- [**Career Materials**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/career-interview/CAREER_MATERIALS.md) — Resume highlights, project bullet points, and portfolio presentation.
- [**AI Era Career Strategy**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/career-interview/AI_ERA_CAREER_STRATEGY.md) — Positioning software craftsmanship in the generative AI era.
- [**New Exercises Summary**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/career-interview/NEW_EXERCISES_SUMMARY.md) — Applied design exercises and code refactoring scenarios.

---

## 7. Milestones & Historical Progress (`docs/milestones/`)

- [**Implementation Summary**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/milestones/IMPLEMENTATION_SUMMARY.md) — Full recap of core build milestones.
- [**Phase 1 Progress**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/milestones/PHASE_1_PROGRESS.md) & [**Phase 1 Complete**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/milestones/PHASE_1_COMPLETE.md) — Foundation setup, Docker environment, and base APIs.
- [**Phase 2 Progress**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/milestones/PHASE_2_PROGRESS.md) & [**Phase 2 Complete**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/milestones/PHASE_2_COMPLETE.md) — Catalog persistence, PostgreSQL dual-write, and AI streaming.
- [**Redesign Step 2 Complete**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/milestones/REDESIGN_STEP2_COMPLETE.md) — Storefront UI refresh and component refactor.
- [**Redesign Step 3 Complete**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/milestones/REDESIGN_STEP3_COMPLETE.md) & [**Redesign Step 3 Fixes**](file:///Users/mac/Developer/AI/ai-codebase-architect/docs/milestones/REDESIGN_STEP3_FIXES.md) — Responsive drawer, cart integration, and performance polish.
