# Backend Service Notes

This folder contains the NestJS API gateway for the AI Code Assistant Platform.

Why a gateway layer exists:

- browsers should not directly orchestrate internal AI services
- request validation should happen in one trusted backend layer
- future concerns like auth, rate limiting, billing, and audit logging belong here

Public endpoints:

- `GET /ai/models` — configured provider and available models
- `POST /ai/generate` — complete JSON response
- `POST /ai/generate/stream` — NDJSON stream with cancellation propagation
- `GET /health` — process health

Helpful local commands:

```bash
npm install
npm run start:dev
npm run build
npm run test
```

For setup and provider extension instructions, read [the starter guide](../docs/provider-starter.md). The gateway is provider-neutral; keys and vendor clients belong in the Python service.

