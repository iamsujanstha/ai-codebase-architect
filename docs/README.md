# Documentation index

This index points to maintained project documentation. Implementation details should be checked against the source code, migrations, and Compose configuration when they differ from older notes.

## Architecture and decisions

- [System architecture](../ARCHITECTURE.md) — current service boundaries, request flows, and known gaps.
- [Architecture decision records](ADRs/) — numbered decisions, including superseded decisions retained for history.
- [Architecture gap analysis](architecture/ARCHITECTURE_GAP_ANALYSIS.md) — prior production-readiness findings; verify status before relying on recommendations.
- [Admin brief](architecture/AGENT_BRIEF_ADMIN.md) — admin feature context.

## Runbooks

- [Runbook index](RUNBOOKS/README.md)
- [PostgreSQL setup and operations](RUNBOOKS/postgresql.md)
- [Local development setup](RUNBOOKS/local-development.md)
- [Docker deployment](RUNBOOKS/docker-deployment.md)

## Learning

- [RabbitMQ production learning path](learning/architecture/RABBITMQ_PRODUCTION_LEARNING.md)
- [PostgreSQL learning materials](learning/postgresql/)
- [AI systems and provider integration](learning/ai-systems/)
- [Career and interview preparation](learning/career/)
- [Project history](learning/project-history.md)
- [Runnable PostgreSQL exercises](../backend/src/database/exercises/README.md)

## Feature references

- [Payments](features/PAYMENT_INTEGRATION_GUIDE.md)
- [Authentication](features/authentication_flow.md)
- [Product dashboard](features/product_dashboard.md)

## Document status

Older milestone reports and technology decisions describe historical states. ADRs remain as decision history, and superseded choices should be labeled rather than silently deleted. Treat unverified deployment instructions and examples as historical until reconciled with the current stack.
