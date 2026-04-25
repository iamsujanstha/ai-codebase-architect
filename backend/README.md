# Backend Service Notes

This folder contains the NestJS API gateway for the AI Code Assistant Platform.

Why a gateway layer exists:

- browsers should not directly orchestrate internal AI services
- request validation should happen in one trusted backend layer
- future concerns like auth, rate limiting, billing, and audit logging belong here

Core endpoint:

- `POST /ai/generate`

Helpful local commands:

```bash
npm install
npm run start:dev
npm run build
npm run test
```

For the full platform walkthrough, use the repository root `README.md`.

