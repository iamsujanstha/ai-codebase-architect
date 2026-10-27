# Docker deployment

The checked-in Compose file defines three services: `frontend`, `backend`, and `ai-service`. PostgreSQL, Ollama or hosted model APIs, payment providers, and SMTP are external dependencies. Redis/RQ and Qdrant are not Compose services in this topology, although optional integration code exists.

## Start and inspect

```bash
docker compose config
docker compose up --build
docker compose ps
docker compose logs --follow backend ai-service
```

The frontend container publishes port 8080 by default, the backend 8000, and the AI service 8001. Compose health checks call the backend and AI service health endpoints.

## Stop

```bash
docker compose down
```

## Known deployment gaps

- Set `POSTGRES_URL` in the Compose environment; Compose rejects startup when it is missing.
- Backend startup fails after PostgreSQL connection retries are exhausted, and the backend health check returns HTTP 503 when database queries fail.
- AI model-provider readiness is not included in the backend health check.
- Do not assume services described in older Docker guides (MongoDB, Dozzle, standalone Redis/RQ, or Qdrant) are part of the current Compose file.
