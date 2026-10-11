# ADR-005: Separate Python AI Service

**Status:** Accepted  
**Date:** 2024-04  
**Decision Makers:** Architecture Team  
**Related:** ADR-001 (NestJS Backend)

---

## Context

We need to integrate AI capabilities (LLM orchestration, RAG, embeddings) into our application. The question is: **Should AI features live in the NestJS backend, or in a separate Python service?**

### Requirements

1. **Multiple LLM providers** (Ollama, OpenAI, Claude, Gemini, compatible APIs)
2. **RAG pipeline** (document embedding, vector search, context assembly)
3. **Streaming responses** (token-by-token for chat UX)
4. **Background jobs** (PDF ingestion, bulk embeddings)
5. **Python ML ecosystem** (LangChain, sentence-transformers, pypdf, etc.)

### Constraints

- Backend team is TypeScript-first (limited Python expertise)
- AI landscape evolves rapidly (need flexibility to adopt new libraries)
- Some operations are CPU-intensive (embedding, PDF parsing)
- NestJS must remain responsive (AI shouldn't block HTTP requests)

---

## Decision

**We separated AI into a dedicated Python (FastAPI) service.**

**Architecture:**
```
React Frontend
  ↓
NestJS Backend (TypeScript)
  ├── Orchestrates: Auth, Catalog, Payments, Orders
  └── Proxies AI requests
        ↓
FastAPI AI Service (Python)
  ├── LLM provider routing
  ├── RAG pipeline
  ├── Embedding generation
  └── Background workers (RQ)
```

---

## Alternatives Considered

### 1. Everything in NestJS (TypeScript)

**Pros:**
- One language (simpler for TypeScript team)
- No network hop between services
- Unified deployment

**Cons:**
- **Python ML ecosystem is superior** (LangChain, sentence-transformers, pypdf)
  - TypeScript equivalents exist but are less mature
  - Example: sentence-transformers (Python) vs @xenova/transformers (TS) — Python is more mature
- **CPU-bound AI tasks block Node.js event loop**
  - PDF parsing, embedding generation are CPU-intensive
  - Node.js is single-threaded (blocks other requests)
  - Would need worker threads or child processes (complex)
- **AI landscape is Python-first**
  - New models, libraries, tutorials are Python
  - TypeScript support lags by months/years

**Why Not:** Fighting against the ecosystem. TypeScript for AI is possible but painful. Python is the native language of AI/ML.

**When TypeScript Would Work:**
- If only using OpenAI API (simple HTTP calls, no local models)
- If no PDF parsing, no local embeddings
- If team refuses to learn Python

### 2. Python AI Library in NestJS (Child Process)

**Approach:**
```typescript
// NestJS calls Python script via child_process
const python = spawn('python3', ['ai_script.py', prompt]);
```

**Pros:**
- One deployment unit
- No network configuration

**Cons:**
- **Process overhead** (spawn new Python process per request = slow)
- **No process pooling** (would need custom implementation)
- **Hard to debug** (logs scattered across Node + Python)
- **Complex IPC** (inter-process communication for streaming)
- **Messy code** (TypeScript calling Python scripts via shell)

**Why Not:** Worst of both worlds. Complex, slow, hard to maintain.

### 3. Serverless Functions (AWS Lambda)

**Approach:**
```
NestJS → AWS Lambda (Python) → LLM
```

**Pros:**
- Auto-scaling
- Pay per invocation
- No server management

**Cons:**
- **Cold starts** (2-5 seconds for Python + ML libraries)
- **Streaming complexity** (Lambda isn't designed for streaming)
- **Vendor lock-in** (AWS-specific)
- **Cost at scale** (1M requests/month = $200+)
- **Limited control** (15-minute timeout, memory limits)

**Why Not:** Cold starts kill UX (user waits 5 seconds before AI responds). Streaming is awkward. Cost grows quickly.

**When Lambda Would Work:**
- Infrequent AI usage (< 10k requests/month)
- Batch processing (not real-time chat)
- Already heavily invested in AWS

### 4. All-Python Backend (FastAPI for Everything)

**Approach:**
```
React → FastAPI (handles auth, catalog, payments, AI)
```

**Pros:**
- One language
- Python is great for AI
- FastAPI is fast

**Cons:**
- **Team is TypeScript-first** (would need to learn Python ecosystem)
- **Mongoose/MongoDB patterns are TypeScript-native**
- **NestJS has better structure** (DI, guards, pipes) than FastAPI
- **Frontend/backend mental model mismatch** (TS types don't transfer to Python)

**Why Not:** Playing against team strengths. TypeScript team would be learning Python while building business logic. NestJS is better for orchestration/auth/payments. Python is better for AI. Use both.

### 5. Microservices for Each AI Feature

**Approach:**
```
NestJS → Embedding Service (Python)
       → Generation Service (Python)
       → RAG Service (Python)
```

**Pros:**
- Fine-grained scaling
- Independent deployment

**Cons:**
- **Over-engineering** (3+ services instead of 1)
- **Network overhead** (multiple service hops)
- **Complex orchestration** (who calls whom?)
- **Distributed transactions** (what if embedding succeeds but generation fails?)

**Why Not:** Premature microservices. We're at <1000 req/sec, not 1M req/sec. One AI service is sufficient.

**When This Would Make Sense:**
- > 100k req/sec (different features have different scaling needs)
- Different teams own different AI features
- Some features need different infra (GPU vs CPU)

---

## Rationale

### Why Separate Python Service Wins

1. **Leverage Python ML Ecosystem**
   ```python
   # Python (natural)
   from sentence_transformers import SentenceTransformer
   model = SentenceTransformer('nomic-embed-text')
   embeddings = model.encode(texts)
   
   # TypeScript (awkward)
   const { pipeline } = require('@xenova/transformers');
   const extractor = await pipeline('feature-extraction', 'model');
   // More complex, less mature
   ```

2. **CPU-Bound Work Doesn't Block NestJS**
   ```
   User 1: Requests AI generation (slow, 10 seconds)
   User 2: Requests catalog (fast, 50ms)
   
   Same Process:
   - User 1's AI blocks event loop
   - User 2 waits for AI to finish
   - Poor UX
   
   Separate Process:
   - User 1's AI runs in Python
   - User 2's catalog runs in NestJS
   - Both fast
   ```

3. **Clear Service Boundaries**
   ```
   NestJS Responsibilities:
   - Authentication/authorization
   - Business logic (catalog, orders, payments)
   - Database orchestration
   - Public API gateway
   
   FastAPI Responsibilities:
   - LLM provider integration
   - RAG pipeline
   - Embedding generation
   - AI-specific background jobs
   ```

4. **Independent Scaling**
   ```
   Traffic Pattern:
   - Catalog: 1000 req/sec (lightweight, fast)
   - AI: 10 req/sec (heavyweight, slow)
   
   Scaling:
   - NestJS: 2 instances (handles catalog easily)
   - AI Service: 5 instances (handles AI load)
   - Cost-effective scaling
   ```

5. **Technology Flexibility**
   ```
   AI landscape changes:
   - New model released (llama-4, gpt-5)
   - New library (better RAG framework)
   - New approach (agents, tools, function calling)
   
   Separate Service:
   - Update Python dependencies
   - Deploy AI service
   - NestJS unchanged, zero risk
   
   Monolith:
   - Update would require NestJS rebuild
   - Risk to unrelated features
   - Slow deployment
   ```

---

## Service Communication

### Request Flow

```
User asks AI question
  ↓
React sends: POST /ai/generate
  ↓
NestJS receives request
  ↓
Validates user auth (JWT)
  ↓
Validates request (DTO)
  ↓
Applies rate limiting
  ↓
Proxies to FastAPI: POST http://ai-service:8000/generate
  ↓
FastAPI receives request
  ↓
Routes to provider (Ollama, OpenAI, Claude)
  ↓
Optionally retrieves context (RAG)
  ↓
Generates response (streaming)
  ↓
Streams back to NestJS
  ↓
NestJS streams to React
  ↓
User sees token-by-token response
```

### Why Proxy Through NestJS?

**Alternative:** React → FastAPI directly

**Why We Proxy:**
1. **Single public API** (frontend only knows about NestJS, not all services)
2. **Authentication** (NestJS validates JWT, FastAPI doesn't need auth logic)
3. **Rate limiting** (NestJS enforces, FastAPI focuses on AI)
4. **Monitoring** (all requests go through NestJS correlation ID middleware)
5. **Security** (FastAPI is internal-only, not exposed to internet)

### Contract Definition

```typescript
// Shared types (TypeScript)
interface GenerateRequest {
  prompt: string;
  messages?: Message[];
  model?: string;
}

interface GenerateResponse {
  response: string;
  model: string;
  usage?: TokenUsage;
}
```

```python
# Pydantic models (Python)
class GenerateRequest(BaseModel):
    prompt: str
    messages: Optional[List[Message]] = None
    model: Optional[str] = None

class GenerateResponse(BaseModel):
    response: str
    model: str
    usage: Optional[TokenUsage] = None
```

**Contract testing ensures compatibility** (see Phase 3).

---

## Tradeoffs

### What We Gain

- ✅ **Python ML Ecosystem:** LangChain, sentence-transformers, pypdf, numpy
- ✅ **Non-Blocking:** CPU-bound AI doesn't block NestJS event loop
- ✅ **Independent Scaling:** Scale AI service separately
- ✅ **Technology Flexibility:** Change AI stack without touching backend
- ✅ **Clear Boundaries:** Auth/business in NestJS, AI in FastAPI
- ✅ **Team Specialization:** TS team on backend, Python on AI (if needed)

### What We Lose

- ❌ **Network Hop:** Extra latency (~1-5ms for internal HTTP call)
- ❌ **Two Languages:** Team must maintain TS and Python
- ❌ **Deployment Complexity:** Two services to deploy
- ❌ **Distributed Debugging:** Trace requests across services (mitigated by correlation IDs)

### What It Costs

- **Network Latency:** ~1-5ms per AI request (negligible vs 10s AI generation time)
- **Infrastructure:** Two services instead of one (Docker makes this easy)
- **Learning Curve:** Team must understand both TS and Python (worth it for AI)

---

## Consequences

### Positive

1. **AI Features Develop Faster:** Python team can iterate without coordinating with backend team
2. **Backend Stays Responsive:** AI workload doesn't affect catalog/payment response times
3. **Future-Proof:** Easy to adopt new AI libraries/models as they emerge
4. **Resource Optimization:** Can run AI service on GPU instances, backend on CPU

### Negative

1. **Contract Maintenance:** Must keep TypeScript/Python types in sync
2. **Distributed System Complexity:** Need correlation IDs, tracing, retry logic
3. **Two Deployments:** Must deploy backend and AI service (can automate)

### Neutral

1. **Service Communication:** HTTP is simple but could upgrade to gRPC if performance matters

---

## When Would We Change This Decision?

### Triggers to Merge Services

1. **Team Becomes Python-First**
   - Example: Hire ML engineers, TypeScript team shrinks
   - Mitigation: Keep separate for now (team composition may change)
   - Alternative: Merge everything into FastAPI

2. **AI Becomes <5% of Traffic**
   - Example: Most users don't use AI features
   - Mitigation: Separate service is still fine (low overhead)
   - Alternative: Move AI into NestJS (use TypeScript libs)

3. **Network Latency Becomes Critical**
   - Example: AI latency must be < 100ms (e.g., autocomplete)
   - Mitigation: Deploy AI service on same host, use Unix sockets
   - Alternative: Merge into one process

### Triggers to Further Split

1. **AI Service Becomes Bottleneck**
   - Example: Embedding generation (CPU) blocks generation (GPU)
   - Mitigation: Separate embedding service from generation service
   - Alternative: Use message queue (RQ) for async embedding

2. **Different Teams Own Different AI Features**
   - Example: One team owns RAG, another owns agents
   - Mitigation: Keep in one service with clear module boundaries
   - Alternative: Split into RAG service + Agent service

---

## Interview Answer

**Q: "Why did you separate the AI service into Python?"**

**A:** "We separated AI into a Python FastAPI service for three main reasons. First, the Python ML ecosystem is far superior—libraries like LangChain, sentence-transformers, and pypdf are more mature than TypeScript alternatives. Second, AI operations are CPU-intensive (embedding generation, PDF parsing) and would block Node.js's single-threaded event loop, degrading response times for catalog and payment requests. By separating AI, NestJS stays responsive. Third, it provides clear service boundaries and independent scaling—we can scale the AI service (expensive, GPU) separately from the backend (cheap, CPU).

The tradeoff is network latency (~1-5ms for the internal HTTP call) and maintaining two languages. But the network hop is negligible compared to AI generation time (10+ seconds). We mitigate the two-language complexity with shared type definitions and contract tests. We proxy through NestJS rather than exposing FastAPI directly because NestJS handles auth, rate limiting, and monitoring—the AI service focuses purely on LLM orchestration.

We'd merge the services if the team becomes Python-first or if AI is <5% of traffic. We'd further split AI if embedding and generation need independent scaling. For now, one AI service is the right balance."

---

## References

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Microservices vs Monolith (Martin Fowler)](https://martinfowler.com/articles/microservices.html)
- [Node.js Event Loop (Deep Dive)](https://nodejs.org/en/guides/event-loop-timers-and-nexttick/)
- [Service Boundary Design Patterns](https://microservices.io/patterns/decomposition/decompose-by-subdomain.html)

---

**Last Updated:** 2024-04  
**Next Review:** If AI becomes bottleneck or team composition changes significantly
