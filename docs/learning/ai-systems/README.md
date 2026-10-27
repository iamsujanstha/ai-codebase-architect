# AI systems learning path

- [AI systems deep dive](AI_SYSTEMS_DEEP_DIVE.md) — RAG, vector search, prompt injection, agent budgets, evaluation, and failure exercises.

- [Service architecture](service-architecture.md) — provider boundaries and current limitations.
- [Provider starter](provider-starter.md) — adding and configuring model adapters.
- [Application integration](application-integration.md) — request, retrieval, streaming, and proposed production flows.
- [AI infrastructure notes](ai_infrastructure.md) — historical implementation detail; verify claims against the current service.

The runtime defaults to retrieval disabled. Background ingestion requires separately provisioned Redis/RQ infrastructure; there is no upload API that exposes ingestion to users.
