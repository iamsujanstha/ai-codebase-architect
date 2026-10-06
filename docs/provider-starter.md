# Build your application from this starter

This repository demonstrates a small vertical slice: React sends a message to NestJS, NestJS forwards it to FastAPI, a provider generates text, and a stable NDJSON stream returns to React. Keep that contract while replacing the application domain or model vendor.

## What runs today

| Component | Status |
| --- | --- |
| Ollama chat and model discovery | Implemented HTTP adapter; requires a running Ollama instance and installed model |
| Mock provider | Implemented deterministic fixture for offline integration tests; not an AI model |
| OpenAI, Claude, Gemini | Implemented text-streaming adapters; configure provider, model ID and matching API key |
| OpenAI-compatible services | Implemented Chat Completions adapter; also configure the API base URL |
| Retrieval | Disabled by default; opt-in async Qdrant adapter with a separate Ollama embedding model |
| RQ ingestion | Internal job helper for a list of text chunks; no upload or job-status HTTP API |
| Business tools | Documented extension boundary only; no model-triggered execution |
| Authentication / tenant isolation | Not implemented; do not expose this starter as a multi-user production service |

No fallback changes providers behind the user's back. Supported text-chat APIs can be selected entirely through environment configuration. The adapters do not automatically support image/audio models, Vertex AI, Azure-specific authentication, or arbitrary vendor protocols. API keys stay in FastAPI; account access, model availability, and provider charges still apply.

## Start without downloading a model

Use Python 3.11+ and Node 20+. From the repository root:

```bash
cp .env.example .env
```

Set `AI_PROVIDER=mock` and `AI_MODEL=mock-model` in `.env`. Then:

```bash
docker compose up --build
```

Open `http://localhost:8080`. The basic stack starts only React/Nginx, NestJS, and FastAPI. Redis, Qdrant, and monitoring are optional profiles. Mock responses are clearly labelled and are only for developing the application flow.

For separate local processes:

```bash
# Terminal 1, from repository root
python3.11 -m venv ai-service/.venv
ai-service/.venv/bin/pip install -r ai-service/requirements.txt
cd ai-service
.venv/bin/uvicorn app.main:app --env-file ../.env --port 8000
```

```bash
# Terminal 2, from repository root
cd backend
npm install
npm run start:dev
```

```bash
# Terminal 3, from repository root
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. Test `GET /ai/models` and `POST /ai/generate/stream` through that origin. FastAPI exposes its request/response documentation at `http://localhost:8000/docs`. `/health` is a liveness endpoint, not a model-readiness guarantee.

## Understand the code by responsibility

```text
frontend/src/
  app/                 application shell and styles
  core/api/            HTTP and NDJSON client
  core/types/          browser contracts
  features/chat/       conversation state and presentation
  features/models/     provider/model presentation
  shared/              theme and layout
backend/src/
  ai/                  public DTOs, controllers, AI-service gateway
  common/              shared HTTP error handling
ai-service/app/
  main.py              composition root and resource lifetime
  config.py            environment configuration
  api/routes/          HTTP transport only
  models/              validated Python HTTP contracts
  services/            ChatService use case and stable stream events
  providers/           ChatProvider contract, registry, vendor adapters
  retrieval/           NoRetrieval and optional Qdrant adapter
  jobs/                RQ enqueue helper and ingestion entry point
  tools/               authorization-first extension guidance
ai-service/tests/      offline HTTP and provider contract tests
```

There is one registered NestJS AI controller. The obsolete duplicate controller and older Python singleton services were removed. No imports open network connections. FastAPI lifespan constructs resources and closes them on shutdown; tests can inject a ChatService directly into `create_app`.

## The provider contract

`ChatProvider` has two responsibilities: list allowed models and stream normalized output. It receives already assembled messages and a validated model name. It yields text fragments followed by exactly one `Completion`. Completion may include usage, but unavailable usage is omitted instead of invented. Provider adapters know nothing about React, NestJS, NDJSON, retrieval, or the application database.

`ChatService` owns the system prompt, bounded history, optional retrieved evidence, model validation, concurrency, and application events. Streaming and non-streaming requests consume the same provider path. The non-streaming endpoint keeps the existing response envelope: `summary` is an excerpt, and key points/follow-up lists are empty rather than fabricated. If your product needs genuine structured output, add a distinct validated use case instead of pretending every provider guarantees JSON.

The registry is server configuration, not a user-controlled URL router. One deployment selects one provider; the UI selects a model exposed by that provider. Supporting several providers at once is a later extension: use validated provider/model IDs, enforce permissions and quotas, and never accept credentials or base URLs from a browser request.

## Switch providers using environment variables

Copy `.env.example` to `.env`. Set the provider and an actual text-chat model ID available to your account, then fill the corresponding key. Restart FastAPI after editing environment settings. No frontend or NestJS changes are required.

| AI_PROVIDER | Required key variable | Native API used |
| --- | --- | --- |
| `openai` | `OPENAI_API_KEY` | Responses API: `POST /v1/responses` |
| `claude` | `ANTHROPIC_API_KEY` | Messages API: `POST /v1/messages` |
| `gemini` | `GEMINI_API_KEY` | Gemini Developer API: `POST /v1beta/models/{model}:streamGenerateContent` |
| `openai_compatible` | `AI_API_KEY` plus `AI_BASE_URL` | `POST {AI_BASE_URL}/chat/completions` |
| `ollama` | No API key | Installed models at `OLLAMA_BASE_URL` |
| `mock` | No API key | Local deterministic test output |

For example, replace the uppercase model placeholder below with your account's real model ID:

```dotenv
AI_PROVIDER=openai
AI_MODEL=YOUR_OPENAI_TEXT_MODEL_ID
OPENAI_API_KEY=YOUR_API_KEY
```

For Claude, change `AI_PROVIDER=claude`, set a Claude model ID in `AI_MODEL`, and fill `ANTHROPIC_API_KEY`. For Gemini, use `AI_PROVIDER=gemini`, a Gemini text model ID, and `GEMINI_API_KEY`. These variables are explicitly forwarded only to the AI service by Docker Compose.

For another service implementing OpenAI Chat Completions:

```dotenv
AI_PROVIDER=openai_compatible
AI_MODEL=YOUR_PROVIDER_MODEL_ID
AI_BASE_URL=https://YOUR_PROVIDER_HOST/v1
AI_API_KEY=YOUR_PROVIDER_KEY
```

`AI_BASE_URL` is only accepted for `openai_compatible`, includes any required API prefix, and must not contain credentials or query parameters. It is trusted deployment configuration, never a request field. Standard bearer authentication and the Chat Completions text streaming contract are required; vendor-specific headers or incompatible request formats need an adapter. Do not put an unrelated vendor's key into another service's configuration.

Optional settings:

```dotenv
# Extra models available in the UI, for this provider only.
AI_MODELS=ANOTHER_MODEL_ID,ONE_MORE_MODEL_ID
AI_MAX_OUTPUT_TOKENS=2048
AI_TIMEOUT_SECONDS=120
AI_CONCURRENCY=1
```

`AI_MODEL` is also included in the allowlist. Hosted model discovery shows configured IDs, not a fetched account catalog: a listed model is not proof of access. Choose models supporting the selected text protocol; the provider validates access on generation. Missing keys/models produce configuration errors. Ollama still discovers installed models dynamically.

For Docker, rebuild after code changes and recreate the service when changing configuration:

```bash
docker compose up -d --build ai-service
```

For local development, stop and restart `uvicorn app.main:app --env-file ../.env --port 8000`. Uvicorn reload does not reliably apply changed environment files to an existing process. Refresh the model list in the UI afterward. Keep `RETRIEVAL_BACKEND=none` for chat-only use; hosted chat does not require local Ollama unless retrieval is enabled.

Both `/ai/generate` and `/ai/generate/stream` use the same adapter. The first collects text into the existing JSON response envelope; the second streams it to the UI. These adapters cover text, not model-generated tool execution. Provider refusals, output-limit truncation, malformed events, and incomplete streams produce errors while preserving partial text. Reasoning/thinking text is not forwarded as an answer. There are no automatic retries after partial output and no automatic provider fallback.

The output-token cap is sent using each vendor's field. Some models count reasoning against that budget; increase it when an otherwise valid request reaches its limit. Model-specific options and capabilities still differ; a universal provider interface does not make every model interchangeable.

### Protocol references and verification

Implementations follow [OpenAI Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses), [Claude Messages streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), and [Gemini streaming content generation](https://ai.google.dev/api/generate-content). Native SSE is translated inside the adapter; React continues to receive the application's NDJSON events.

Offline tests exercise native request shapes, auth headers, custom URL prefixes, text/usage conversion, missing keys, truncation, rate limits, refusals, and malformed events. No real keys or paid requests were used for these tests. Perform a credentialed smoke test with your chosen model before treating that account/provider combination as verified.

### Add a different protocol

Implement `ChatProvider.list_models()` and `ChatProvider.stream()`, register the adapter, and wire a dedicated client in the composition root. Translate the vendor's text fragments into strings and its terminal event into `Completion`. Close resources on cancellation, keep errors safe, and add protocol fixtures. This is needed only when the service does not implement one of the supported API formats.

## Add retrieval without coupling it to chat

`Retriever.search(question)` returns relevant text. `NoRetrieval` returns no context. The default path therefore needs neither Qdrant nor an embedding model. The Qdrant reference adapter uses an independent Ollama embedding model even if the chat adapter is hosted.

To enable local retrieval, configure `RETRIEVAL_BACKEND=qdrant`, set `EMBEDDING_MODEL` to an installed embedding-capable model, and start `docker compose --profile rag up --build`. Ensure Qdrant and Ollama are reachable before AI startup; collection initialization verifies actual vector dimensions and fails clearly on mismatch. Restart the AI service after dependencies become ready if startup failed.

`app.jobs.ingestion.index_documents` indexes already extracted text chunks; `enqueue_documents` publishes that work to the `ai_tasks` queue. The worker runs one event loop per job, awaits writes, and closes its clients. Stable content-derived point IDs make repeated writes overwrite the same vectors. This is not a document parser, upload pipeline, deletion/version lifecycle, or exactly-once distributed job system.

Corpus and embedding-model filters prevent mixing different reference corpora and embedding spaces. A configured corpus is not user authorization. Before multi-tenant use, add authenticated scope from NestJS to every retrieval and indexing operation. Change collection/version and reindex when changing embedding models, even if dimensions happen to match. The sample similarity threshold and character budget need evaluation against your data.

Retrieval errors produce a failed response instead of quietly claiming a grounded answer. Chat messages are not automatically indexed as knowledge. Add an explicit retention and consent policy if you implement memory.

## Add business behavior where it belongs

NestJS owns user access, tenant membership, durable conversations, billing limits, and business writes. FastAPI owns model orchestration. The model may propose a tool call, but the tool adapter must call an authorized business endpoint. See `app/tools/README.md` and the [application flow guide](application-integration.md) for the target design. Tool execution is deliberately not enabled before these boundaries exist.

## Validate your fork

```bash
cd ai-service
.venv/bin/python -m unittest discover -s tests -v
```

```bash
npm test --prefix frontend
npm run build --prefix frontend
npm run build --prefix backend
npm test --prefix backend -- --runInBand
```

Tests cover mock HTTP requests, completion metadata, unknown model rejection, history validation, missing hosted configuration, provider truncation, cancellation cleanup, and Ollama protocol normalization. Live Ollama, embeddings, RQ execution, browser layout, and hosted credentials require separate integration checks. A compile or mock test is not evidence that a remote model works.

## Migration from the original demo

- `AI_PROVIDER` selects the adapter; `AI_MODEL` selects its default model. `OLLAMA_MODEL` remains a local fallback for non-Compose startup. The old display-only `PROVIDER_NAME` setting is no longer used.
- Model listings now include `provider`; the frontend displays it instead of assuming Ollama.
- Completion always carries provider/model metadata and total duration. Usage and provider-specific timing fields are optional.
- History accepts only user/assistant roles, with message-count and content limits. Do not forward old client-supplied system instructions.
- Retrieval is explicitly disabled by default. Existing unscoped conversation vectors are not treated as a trusted knowledge base.
- Old worker callable paths were removed. Drain or discard development jobs targeting the old modules before starting the new worker.
- Public `/ai/models`, `/ai/generate`, and `/ai/generate/stream` routes are preserved.
