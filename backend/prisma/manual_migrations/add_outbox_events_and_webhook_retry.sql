-- Migration: add_outbox_events_and_webhook_retry — 2026-10-25
-- ADR: docs/architecture/adr/013-outbox-pattern-for-payment-events.md
-- SAFE: all additive changes only.

-- 1. Harden webhook_events with retry/dead-letter tracking
ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS retry_count      INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message    TEXT,
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_webhook_events_retry
  ON webhook_events (status, next_retry_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_webhook_events_dead_letter
  ON webhook_events (dead_lettered_at)
  WHERE dead_lettered_at IS NOT NULL;

-- 2. Drop leftover duplicate demo index
DROP INDEX IF EXISTS idx_orders_status_demo;

-- 3. Create outbox_events table
CREATE TABLE IF NOT EXISTS outbox_events (
  id               SERIAL PRIMARY KEY,
  aggregate_id     VARCHAR(255)  NOT NULL,
  aggregate_type   VARCHAR(100)  NOT NULL,
  event_type       VARCHAR(100)  NOT NULL,
  payload          JSONB         NOT NULL,
  status           VARCHAR(20)   NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ,
  attempts         INTEGER       NOT NULL DEFAULT 0,
  max_attempts     INTEGER       NOT NULL DEFAULT 5,
  next_attempt_at  TIMESTAMPTZ,
  last_error       TEXT,
  dead_lettered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON outbox_events (created_at ASC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_outbox_aggregate_id
  ON outbox_events (aggregate_id);

CREATE INDEX IF NOT EXISTS idx_outbox_dead_letter
  ON outbox_events (dead_lettered_at)
  WHERE dead_lettered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_payload_gin
  ON outbox_events USING GIN (payload);

-- ROLLBACK:
-- ALTER TABLE webhook_events DROP COLUMN IF EXISTS retry_count, next_retry_at, error_message, dead_lettered_at;
-- DROP TABLE IF EXISTS outbox_events;
