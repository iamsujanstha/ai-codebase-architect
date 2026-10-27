ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku TEXT,
  -- WHY: Existing products were visible before draft publishing was introduced.
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

UPDATE users
SET status = 'suspended'
WHERE NOT is_active AND status = 'active';

ALTER TABLE users
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL;
