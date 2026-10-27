-- ADR: docs/ADRs/013-outbox-pattern-for-payment-events.md
-- Lease metadata lets another worker recover events after a process disappears.
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS claim_token UUID;

CREATE INDEX IF NOT EXISTS idx_outbox_processing_lease
  ON outbox_events (claimed_at)
  WHERE status = 'processing';
