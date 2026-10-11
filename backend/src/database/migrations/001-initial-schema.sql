-- Initial PostgreSQL Schema Migration
-- From MongoDB to PostgreSQL
-- Date: 2026-10-11

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- Trigram search for fuzzy matching

-- ============================================================================
-- 1. USERS TABLE
-- ============================================================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  google_id VARCHAR(255) UNIQUE,
  avatar VARCHAR(500),
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_created_at ON users(created_at);
CREATE INDEX idx_users_role_active ON users(role, is_active) WHERE is_active = true;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. PRODUCTS TABLE
-- ============================================================================
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  category VARCHAR(100) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url VARCHAR(500),
  featured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for products
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_featured ON products(featured) WHERE featured = true;
CREATE INDEX idx_products_name_trgm ON products USING gin(name gin_trgm_ops);
CREATE INDEX idx_products_category_stock ON products(category, stock) WHERE stock > 0;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. ORDERS TABLE
-- ============================================================================
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  payment_method VARCHAR(20) CHECK (payment_method IN ('stripe', 'esewa')),
  payment_intent_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order items (normalized design)
CREATE TABLE order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  name VARCHAR(500) NOT NULL,              -- Denormalized for historical record
  price DECIMAL(10, 2) NOT NULL,           -- Denormalized for historical record
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal DECIMAL(10, 2) NOT NULL GENERATED ALWAYS AS (price * quantity) STORED
);

-- Indexes for orders
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);

-- Indexes for order_items
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

-- Triggers
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. CHAT THREADS & MESSAGES
-- ============================================================================
CREATE TABLE chat_threads (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for chat
CREATE INDEX idx_chat_threads_user_id ON chat_threads(user_id);
CREATE INDEX idx_chat_threads_created ON chat_threads(created_at DESC);
CREATE INDEX idx_chat_messages_thread_id ON chat_messages(thread_id);
CREATE INDEX idx_chat_messages_timestamp ON chat_messages(timestamp);
CREATE INDEX idx_chat_messages_thread_timestamp ON chat_messages(thread_id, timestamp);

-- Trigger
CREATE TRIGGER update_chat_threads_updated_at BEFORE UPDATE ON chat_threads
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. PAYMENT AUDIT LOGS
-- ============================================================================
CREATE TABLE payment_audit_logs (
  id SERIAL PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider VARCHAR(20) NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor VARCHAR(20) NOT NULL CHECK (actor IN ('USER', 'SYSTEM', 'WEBHOOK')),
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  details JSONB,                             -- Flexible JSON data
  ip_address INET,                           -- Native IP address type
  correlation_id UUID,                       -- Native UUID type
  success BOOLEAN NOT NULL,
  message TEXT
);

-- Indexes for audit logs
CREATE INDEX idx_audit_order_number ON payment_audit_logs(order_number);
CREATE INDEX idx_audit_timestamp ON payment_audit_logs(timestamp DESC);
CREATE INDEX idx_audit_correlation_id ON payment_audit_logs(correlation_id);
CREATE INDEX idx_audit_details_gin ON payment_audit_logs USING gin(details);
CREATE INDEX idx_audit_failed ON payment_audit_logs(timestamp DESC, event_type) WHERE success = false;

-- ============================================================================
-- 6. RATE LIMITING (migrating from MongoDB to PostgreSQL)
-- ============================================================================
CREATE TABLE rate_limits (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL UNIQUE,          -- e.g., 'user:123:ai_generate'
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for rate limiting queries
CREATE INDEX idx_rate_limits_key ON rate_limits(key);
CREATE INDEX idx_rate_limits_expires ON rate_limits(expires_at);

-- Cleanup expired rate limits (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. IDEMPOTENCY CACHE (migrating from MongoDB to PostgreSQL)
-- ============================================================================
CREATE TABLE idempotency_keys (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL UNIQUE,          -- Idempotency key
  response JSONB,                             -- Cached response
  status VARCHAR(20) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Indexes
CREATE INDEX idx_idempotency_key ON idempotency_keys(key);
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);

-- Cleanup expired keys
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS void AS $$
BEGIN
  DELETE FROM idempotency_keys WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. LEARNING: MATERIALIZED VIEWS FOR ANALYTICS
-- ============================================================================
-- Example: User order statistics
CREATE MATERIALIZED VIEW user_order_stats AS
SELECT
  u.id AS user_id,
  u.email,
  u.name,
  COUNT(o.id) AS total_orders,
  COALESCE(SUM(o.total_amount), 0) AS total_spent,
  MAX(o.created_at) AS last_order_at,
  MIN(o.created_at) AS first_order_at
FROM users u
LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'paid'
GROUP BY u.id, u.email, u.name;

-- Index on materialized view
CREATE INDEX idx_user_order_stats_user_id ON user_order_stats(user_id);
CREATE INDEX idx_user_order_stats_total_spent ON user_order_stats(total_spent DESC);

-- Refresh materialized view (run periodically or after significant updates)
-- REFRESH MATERIALIZED VIEW user_order_stats;

-- ============================================================================
-- 9. LEARNING: PARTITIONING FOR LARGE TABLES
-- ============================================================================
-- Example: Partition audit logs by month (for high-volume tables)
-- Uncomment when audit logs exceed 10M+ rows

-- CREATE TABLE payment_audit_logs_2024_10 PARTITION OF payment_audit_logs
-- FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');

-- CREATE TABLE payment_audit_logs_2024_11 PARTITION OF payment_audit_logs
-- FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');

-- ============================================================================
-- 10. SAMPLE DATA FOR TESTING
-- ============================================================================
-- Create admin user
INSERT INTO users (email, password, name, role, is_active)
VALUES ('admin@example.com', '$2b$10$hashedpassword', 'Admin User', 'admin', true);

-- Create test user
INSERT INTO users (email, password, name, role, is_active)
VALUES ('user@example.com', '$2b$10$hashedpassword', 'Test User', 'user', true);

-- Create sample products
INSERT INTO products (name, description, price, category, stock, image_url, featured) VALUES
('Laptop Pro 15', 'High-performance laptop for developers', 1299.99, 'Electronics', 50, 'https://example.com/laptop.jpg', true),
('Wireless Mouse', 'Ergonomic wireless mouse', 29.99, 'Electronics', 200, 'https://example.com/mouse.jpg', false),
('Mechanical Keyboard', 'RGB mechanical keyboard', 89.99, 'Electronics', 100, 'https://example.com/keyboard.jpg', true),
('USB-C Hub', '7-in-1 USB-C hub', 49.99, 'Electronics', 150, 'https://example.com/hub.jpg', false),
('Standing Desk', 'Adjustable standing desk', 599.99, 'Furniture', 30, 'https://example.com/desk.jpg', true);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify migration succeeded

-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check indexes
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Check constraints
SELECT
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, contype;

-- ============================================================================
-- CLEANUP (for reset/testing)
-- ============================================================================
-- DROP TABLE IF EXISTS payment_audit_logs CASCADE;
-- DROP TABLE IF EXISTS chat_messages CASCADE;
-- DROP TABLE IF EXISTS chat_threads CASCADE;
-- DROP TABLE IF EXISTS order_items CASCADE;
-- DROP TABLE IF EXISTS orders CASCADE;
-- DROP TABLE IF EXISTS products CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
-- DROP TABLE IF EXISTS rate_limits CASCADE;
-- DROP TABLE IF EXISTS idempotency_keys CASCADE;
-- DROP MATERIALIZED VIEW IF EXISTS user_order_stats;
-- DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
-- DROP FUNCTION IF EXISTS cleanup_expired_rate_limits;
-- DROP FUNCTION IF EXISTS cleanup_expired_idempotency_keys;

