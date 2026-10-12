<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **ai-codebase-architect** (4627 symbols, 7547 relationships, 147 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/ai-codebase-architect/context` | Codebase overview, check index freshness |
| `gitnexus://repo/ai-codebase-architect/clusters` | All functional areas |
| `gitnexus://repo/ai-codebase-architect/processes` | All execution flows |
| `gitnexus://repo/ai-codebase-architect/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

---

# Architecture Rules & Documentation Protocol

## 1. Architectural Decision & Interview Q/A Documentation Protocol
- **Document Architectural Decisions in Docs (Never Leave in Chat)**: Whenever an architectural discussion, technology comparison (e.g., pgvector vs. Qdrant, REST vs. SSE, Mongo vs. Postgres), or trade-off analysis is made in chat, the agent **MUST** capture and refine it into `docs/architecture/adr/` as an accepted ADR or update existing architecture documents.
- **Mandatory Interview Questions & Follow-Up Q/A Section**: Every ADR or core architecture doc **MUST** include a dedicated **Senior / Staff System Design Interview Talking Points & Follow-Up Q/A** section. It must capture:
  - The core interview question ("Why X instead of Y?").
  - The architectural trade-off justification (cost, latency, complexity, team size).
  - Probing follow-up questions (failure modes, edge cases, dual-write issues, scaling bottlenecks).
  - Concrete step-by-step migration / mitigation playbooks.
- **Mandatory Mermaid Visuals**: Every decision document must include at least one Mermaid architecture diagram, sequence diagram, or decision-tree flowchart.
- **Keep `AGENTS.md` Synchronized**: Whenever a new decision or ADR is created, add its core rule and markdown link to this section in `AGENTS.md` so future agent sessions adhere to it.

---

## 2. Active Architectural Decisions

### Vector Search Strategy (ADR-011)
- **Start with `pgvector` First**: Store product catalog and AI semantic vectors inside the existing **Neon PostgreSQL** database (`vector` extension) during initial and mid-scale growth (< 500k vectors).
- **Interface-First Architecture**: Always code against an `IVectorStore` adapter abstraction. NEVER hardcode vendor-specific vector DB calls into business controllers or domain services.
- **Do Not Prematurely Optimize**: Do not spin up or re-introduce dedicated vector databases (e.g. Qdrant cluster/container) until concrete migration thresholds are breached (> 500k vectors, > 50ms search latency, or database RAM pressure).
- **Interview & Architecture Reference**: See [ADR-011: Vector Search Strategy — pgvector First, Scale to Qdrant](file:///Users/ebpearls/Documents/ai-codebase-architect/docs/architecture/adr/011-vector-search-strategy-pgvector-vs-qdrant.md).

### Pluggable AI Provider Architecture (ADR-012)
- **Adapter & Factory Pattern for Inference & Embeddings**: Never hardcode direct vendor HTTP endpoints (e.g., Ollama `/api/embed`, OpenAI `/v1/embeddings`) into domain services. Always program against `EmbeddingAdapter` and resolve instances via `EmbeddingFactory` / `VectorStoreFactory`.
- **Open Registration Extensibility**: New inference models or vector databases must register via `Factory.register()` without modifying core consumer services (Open/Closed Principle).
- **Dependency Injection**: Domain services like `ProductService` must accept optional adapter dependencies in constructors to allow deterministic mocking in tests and instant zero-dependency CI/CD execution.
- **Interview & Architecture Reference**: See [ADR-012: Pluggable AI Provider Architecture — Adapter & Factory Patterns](file:///Users/ebpearls/Documents/ai-codebase-architect/docs/architecture/adr/012-pluggable-provider-adapter-factory-pattern.md).

