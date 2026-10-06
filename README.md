# AI Application Starter

A reusable React → NestJS → FastAPI reference application with a provider-neutral chat boundary, streaming responses, optional retrieval, and offline integration tests.

**Implemented adapters:** Ollama, OpenAI Responses, Claude Messages, Gemini Developer API, OpenAI-compatible Chat Completions, and deterministic mock mode. Switch supported text-chat providers with environment variables; hosted account access requires a real model ID and API key. Adapters are covered by offline protocol tests; credentialed inference must be verified in your environment.

## Start here

1. Read the [starter and provider guide](docs/provider-starter.md) for setup, module ownership, configuration, and extension instructions.
2. Read the [application integration guide](docs/application-integration.md) for HTTP flows, RAG ingestion, business tools, and target production APIs.
3. Read the [architecture overview](ARCHITECTURE.md) for the current boundaries and limitations.

For a model-free demonstration, copy `.env.example` to `.env`, set `AI_PROVIDER=mock` and `AI_MODEL=mock-model`, then run `docker compose up --build`. Open `http://localhost:8080`. Mock output is a fixture, not an AI answer.

The default stack needs only the frontend, gateway, and AI service. Add the `rag` Compose profile for Qdrant/Redis/RQ, or the `monitoring` profile for the local log viewer. Configuration and local-process commands are in the starter guide.

This is a reference foundation, not an authenticated multi-tenant production service. Provider keys stay server-side. Authentication, durable conversations, document lifecycle, and authorized business tools remain application-specific work.
