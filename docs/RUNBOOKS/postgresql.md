# PostgreSQL setup and operations

The NestJS backend uses the `pg` connection pool and repository classes. PostgreSQL is an external dependency in the checked-in Compose topology; there is no database container in `docker-compose.yml`.

## Connection contract

Compose and the backend use the same required `POSTGRES_URL` connection string. Compose fails configuration when it is missing; direct backend startup also fails when it is missing or PostgreSQL remains unreachable after retries.

Set the connection string in the environment before running the backend or Compose:

```bash
export POSTGRES_URL='postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require'
```

The application verifies TLS certificates by default. Set `POSTGRES_SSL=false` only for a disposable local database that does not offer TLS; keep it enabled for production providers.

The `/health` endpoint returns HTTP 503 when database readiness checks fail. Do not commit credentials or paste production connection strings into documentation. Use a local environment file excluded from version control or a managed secret store.

## Safe connection checks

```bash
psql "$POSTGRES_URL" -c 'SELECT current_database(), current_user, now();'
psql "$POSTGRES_URL" -c 'SELECT version();'
```

If the backend cannot connect, check that the database is reachable from the runtime, the URL is injected under the expected variable, TLS settings match the provider, and the database user has the required privileges. Startup retries are bounded and NestJS bootstrap fails if the database remains unreachable.

## Repository and migration workflow

- Keep SQL in repository implementations or versioned migrations, not controllers or domain services.
- Bind values through `$1`, `$2`, and subsequent placeholders.
- Run migrations through the repository's migration tooling only after confirming the target database.
- Inspect query plans with `EXPLAIN (ANALYZE, BUFFERS)` against representative data before changing indexes.
- For transaction work, acquire one pool client and always release it in `finally`.

For hands-on database topics, use the [PostgreSQL learning materials](../learning/postgresql/).
Operational SQL examples are in the [PostgreSQL command reference](postgresql-commands.md).
