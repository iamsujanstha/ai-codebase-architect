-- The marker and inventory updates commit together, preventing a reclaimed event
-- from decrementing stock twice after the worker crashes.
CREATE TABLE IF NOT EXISTS outbox_effects (
  event_id INTEGER NOT NULL REFERENCES outbox_events(id) ON DELETE CASCADE,
  effect_type VARCHAR(100) NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, effect_type)
);
