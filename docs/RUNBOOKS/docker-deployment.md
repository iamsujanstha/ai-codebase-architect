# Docker deployment

The checked-in Compose file defines `frontend`, `backend`, `backend-worker`, `ai-service`, and `rabbitmq`. PostgreSQL, Ollama or hosted model APIs, payment providers, and SMTP are external dependencies. RabbitMQ is a single-node local-learning topology with a persistent volume and classic queues; it is not a highly available production cluster. The API owns the outbox publisher; the separate worker owns order-paid inventory and email effects.

## Start and inspect

```bash
docker compose config
docker compose up --build
docker compose ps
docker compose logs --follow backend backend-worker rabbitmq ai-service
```

The frontend container publishes port 8080 by default, the backend 8000, and the AI service 8001. RabbitMQ publishes AMQP on localhost:5672 and its management UI on localhost:15672. Compose health checks call the backend, RabbitMQ, and AI service health endpoints. Backend health reports RabbitMQ connection state separately from PostgreSQL readiness because the outbox can buffer events during a broker outage. The worker runs without an HTTP listener; inspect its logs and RabbitMQ consumer metrics to monitor it.

## Stop

```bash
docker compose down
```

## Known deployment gaps

- Set `POSTGRES_URL` in the Compose environment; Compose rejects startup when it is missing.
- Backend startup fails after PostgreSQL connection retries are exhausted, and the backend health check returns HTTP 503 when database queries fail.
- RabbitMQ credentials in Compose are development defaults. Production deployments need unique credentials, secret storage, TLS for remote traffic, queue capacity limits, broker monitoring, and a multi-node quorum-queue topology if replicated queue data is required.
- AI model-provider readiness is not included in the backend health check.
- Do not assume services described in older Docker guides (MongoDB, Dozzle, standalone Redis/RQ, or Qdrant) are part of the current Compose file.
