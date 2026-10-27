# Career and interview practice

Use this guide to turn work in the repository into evidence of engineering judgment. It is a practice framework, not an assessment of current proficiency or a claim that the project has production traffic.

## Build an architecture story from evidence

For each feature, be able to explain:

1. **Context:** user need, traffic assumptions, data sensitivity, and operational constraints.
2. **Options:** credible alternatives and the cost each introduces.
3. **Decision:** why the selected boundary or mechanism fits this context.
4. **Failure behavior:** what happens when PostgreSQL, a payment provider, or an LLM is slow or unavailable.
5. **Evidence:** tests, query plans, logs, measurements, or incident records that support the claim.
6. **Revision:** what new scale or requirement would change the design.

Avoid presenting aspirational ADR language as shipped behavior. State whether a capability is implemented, enabled locally, externally provisioned, or only proposed.

## Practice areas in this repository

| Area | Practice | Evidence to gather before claiming mastery |
|---|---|---|
| PostgreSQL | Transactions, locks, indexing, query plans, pool limits | Runnable exercise results and `EXPLAIN (ANALYZE, BUFFERS)` output from representative data |
| Node.js | Async I/O, cancellation, shutdown, timeouts, and backpressure | Code paths and failure-focused tests or measurements |
| AI systems | Provider adapters, prompt boundaries, retrieval, streaming, cost limits | Provider contract, bounded request behavior, evaluation results, and measured latency/cost |
| Reliability | Readiness, retries, idempotency, outbox processing, observability | Reproducible failure scenario and verified recovery behavior |
| Architecture | Module boundaries and trade-offs | Current code, an accurate ADR, and a clear reason to revisit the decision |

## Interview answer template

Start with the constraint that shaped the design. Describe the data and request flow. Compare at least one credible alternative. Explain the expected failure mode and the safeguard. Finish with evidence and a limitation. If evidence is missing, identify what you would measure or test rather than inventing an outcome.

## Using AI tools responsibly

Describe AI as part of your workflow when asked. Own the requirements, architecture decisions, review, and verification. Be ready to explain code without relying on generated explanations, and distinguish your measured results from examples or estimates.

## Exercises

- Work through the [interview preparation guide](INTERVIEW_PREP_GUIDE.md).
- Build a portfolio narrative from [career materials](CAREER_MATERIALS.md), verifying every project claim against the implementation.
- Use the [PostgreSQL exercises](../postgresql/POSTGRESQL_INTERVIEW_EXERCISES.md) and the [AI systems learning path](../ai-systems/README.md).
