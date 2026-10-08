# Architecture

The frontend talks to NestJS; NestJS talks to FastAPI; FastAPI selects a server-configured provider. All providers implement the same chat contract. Model-specific request formats stay in adapters, while prompt assembly and streaming events stay in ChatService.

| Boundary                                                             | Owner                |
| -------------------------------------------------------------------- | -------------------- |
| Browser state and Markdown                                           | React features       |
| Public request validation, response mapping, downstream cancellation | NestJS AI module     |
| Context, concurrency, common event contract                          | Python ChatService   |
| Model catalog and native inference protocol                          | ChatProvider adapter |
| Optional evidence lookup                                             | Retriever adapter    |
| Background indexing                                                  | Python RQ job        |
| Resource construction and cleanup                                    | FastAPI lifespan     |

Ollama, mock, OpenAI Responses, Claude Messages, Gemini Developer API, and OpenAI-compatible Chat Completions adapters are implemented. Provider, model allowlist, keys, and compatible API base URL are environment configuration. Retrieval defaults to none; the opt-in Qdrant adapter uses a separate embedding model and async startup validation. There are no network calls during module import.

The public APIs remain `GET /ai/models`, `POST /ai/generate`, and `POST /ai/generate/stream`. FastAPI exposes `/models`, `/generate`, and `/generate/stream`. Streaming uses NDJSON, not SSE. Native vendor events must be translated by the provider adapter before reaching ChatService.

Read the [starter guide](docs/provider-starter.md) for code organization, configuration, and migration notes. Read the [integration guide](docs/application-integration.md) for diagrams and proposed production flows.

## Limits

The starter has no authentication, authoritative conversation database, public upload API, or executable business tools. Corpus filters are not tenant authorization. In-process concurrency limits do not coordinate multiple workers. Hosted account access and live retrieval require separate credentialed integration validation. These are documented extension responsibilities, not hidden capabilities.
