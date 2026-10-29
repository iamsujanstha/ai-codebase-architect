-- Track broker handoff separately from downstream consumer completion.
ALTER TABLE outbox_events
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
