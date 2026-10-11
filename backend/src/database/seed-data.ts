#!/usr/bin/env ts-node
/**
 * PostgreSQL Data Seeding Script
 * Seeds all tables with realistic sample data for learning
 */

import { Client } from 'pg';

const connectionString = process.env.POSTGRES_URL || 
  'postgresql://neondb_owner:npg_HkO0lvFZzJ1u@ep-super-rice-b34nlx0w-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function seedData() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('🔌 Connected to PostgreSQL\n');

  try {
    // ========================================
    // 1. USERS (10 users: 2 admins, 8 regular)
    // ========================================
    console.log('👥 Seeding users...');
    
    await client.query(`
      INSERT INTO users (email, password, name, role, google_id, avatar, is_active, last_login_at)
      VALUES
        -- Admins
        ('admin@example.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU', 'John Admin', 'admin', null, 'https://i.pravatar.cc/150?img=1', true, NOW() - INTERVAL '1 hour'),
        ('support@example.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU', 'Sarah Support', 'admin', null, 'https://i.pravatar.cc/150?img=5', true, NOW() - INTERVAL '3 hours'),
        
        -- Regular users (some with Google OAuth)
        ('alice@example.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU', 'Alice Johnson', 'user', '123456789', 'https://i.pravatar.cc/150?img=10', true, NOW() - INTERVAL '2 days'),
        ('bob@example.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU', 'Bob Smith', 'user', null, 'https://i.pravatar.cc/150?img=12', true, NOW() - INTERVAL '5 days'),
        ('charlie@example.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU', 'Charlie Brown', 'user', '987654321', 'https://i.pravatar.cc/150?img=13', true, NOW() - INTERVAL '1 week'),
        ('diana@example.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU', 'Diana Prince', 'user', null, 'https://i.pravatar.cc/150?img=20', true, NOW() - INTERVAL '10 days'),
        ('eve@example.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU', 'Eve Anderson', 'user', null, 'https://i.pravatar.cc/150?img=23', true, NOW() - INTERVAL '2 weeks'),
        ('frank@example.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU', 'Frank Miller', 'user', '111222333', 'https://i.pravatar.cc/150?img=33', true, NOW() - INTERVAL '1 month'),
        ('grace@example.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU', 'Grace Lee', 'user', null, 'https://i.pravatar.cc/150?img=25', true, NOW() - INTERVAL '3 weeks'),
        ('henry@example.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTU', 'Henry Wilson', 'user', null, 'https://i.pravatar.cc/150?img=30', false, null)
      ON CONFLICT (email) DO NOTHING;
    `);
    console.log('✅ Users seeded (10 users)\n');

    // ========================================
    // 2. PRODUCTS (30 products across 5 categories)
    // ========================================
    console.log('📦 Seeding products...');
    
    await client.query(`
      INSERT INTO products (name, description, price, category, stock, image_url, featured)
      VALUES
        -- Electronics (10 products)
        ('MacBook Pro 16"', 'High-performance laptop with M3 chip, 16GB RAM, 512GB SSD', 2499.99, 'Electronics', 25, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400', true),
        ('Dell XPS 15', 'Premium laptop with Intel i7, 32GB RAM, 1TB SSD', 1899.99, 'Electronics', 30, 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?w=400', true),
        ('iPad Pro 12.9"', 'Apple tablet with M2 chip, 128GB storage', 1099.99, 'Electronics', 50, 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=400', true),
        ('Samsung Galaxy Tab S9', 'Android tablet with S Pen, 256GB storage', 899.99, 'Electronics', 40, 'https://images.unsplash.com/photo-1561154464-82e9adf32764?w=400', false),
        ('Sony WH-1000XM5', 'Premium noise-canceling headphones', 399.99, 'Electronics', 100, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400', true),
        ('Apple AirPods Pro 2', 'Wireless earbuds with active noise cancellation', 249.99, 'Electronics', 150, 'https://images.unsplash.com/photo-1606841837239-c5a1a4a07af7?w=400', true),
        ('Logitech MX Master 3S', 'Ergonomic wireless mouse for productivity', 99.99, 'Electronics', 200, 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400', false),
        ('Keychron K8 Pro', 'Wireless mechanical keyboard with hot-swappable switches', 109.99, 'Electronics', 80, 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400', false),
        ('LG 27" 4K Monitor', 'Ultra HD monitor with USB-C connectivity', 599.99, 'Electronics', 45, 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400', true),
        ('USB-C Hub 8-in-1', 'Multi-port adapter with HDMI, USB 3.0, SD card reader', 49.99, 'Electronics', 300, 'https://images.unsplash.com/photo-1625948515291-69613efd103f?w=400', false),
        
        -- Office Furniture (8 products)
        ('ErgoChair Pro', 'Ergonomic office chair with lumbar support', 449.99, 'Furniture', 60, 'https://images.unsplash.com/photo-1580480055273-228ff5388ef8?w=400', true),
        ('Standing Desk Pro', 'Electric height-adjustable desk, 60x30 inches', 699.99, 'Furniture', 35, 'https://images.unsplash.com/photo-1595515106969-1ce29566ff1c?w=400', true),
        ('Desk Organizer Set', 'Bamboo desk organizer with 5 compartments', 34.99, 'Furniture', 150, 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=400', false),
        ('Monitor Arm Dual', 'Adjustable dual monitor mount', 129.99, 'Furniture', 70, 'https://images.unsplash.com/photo-1593062096033-9a26b09da705?w=400', false),
        ('Cable Management Box', 'Hide and organize cables elegantly', 24.99, 'Furniture', 200, 'https://images.unsplash.com/photo-1601972599748-1ac5e8c3448f?w=400', false),
        ('LED Desk Lamp', 'Adjustable LED lamp with USB charging port', 59.99, 'Furniture', 120, 'https://images.unsplash.com/photo-1565611549602-c2a8c3e42eb6?w=400', false),
        ('Footrest Ergonomic', 'Adjustable footrest for better posture', 39.99, 'Furniture', 90, 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=400', false),
        ('Bookshelf Modern', 'Modern 5-tier bookshelf, 48" tall', 159.99, 'Furniture', 40, 'https://images.unsplash.com/photo-1594620302200-9a762244a156?w=400', false),
        
        -- Books (7 products)
        ('Clean Code by Robert Martin', 'A handbook of agile software craftsmanship', 39.99, 'Books', 100, 'https://images.unsplash.com/photo-1532012197267-da84d127e765?w=400', true),
        ('Designing Data-Intensive Applications', 'The Big Ideas Behind Reliable, Scalable Systems', 49.99, 'Books', 80, 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400', true),
        ('System Design Interview Vol 1', 'An insider guide by Alex Xu', 34.99, 'Books', 120, 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?w=400', true),
        ('The Pragmatic Programmer', '20th Anniversary Edition', 44.99, 'Books', 90, 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=400', false),
        ('Domain-Driven Design', 'Tackling Complexity in the Heart of Software', 54.99, 'Books', 60, 'https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=400', false),
        ('Code Complete 2nd Edition', 'A Practical Handbook of Software Construction', 44.99, 'Books', 70, 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=400', false),
        ('The DevOps Handbook', 'How to Create World-Class Agility, Reliability', 39.99, 'Books', 85, 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=400', false),
        
        -- Accessories (3 products)
        ('Laptop Stand Aluminum', 'Adjustable laptop stand for better ergonomics', 49.99, 'Accessories', 150, 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400', false),
        ('Webcam 1080p HD', 'Full HD webcam with stereo microphone', 79.99, 'Accessories', 100, 'https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=400', false),
        ('Microphone USB', 'Professional USB microphone for streaming', 129.99, 'Accessories', 60, 'https://images.unsplash.com/photo-1589003077984-894e133dabab?w=400', false),
        
        -- Software (2 products)
        ('Adobe Creative Cloud 1 Year', 'Full suite of creative apps subscription', 599.99, 'Software', 999, 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400', true),
        ('JetBrains All Products Pack', 'Annual subscription to all JetBrains IDEs', 249.99, 'Software', 999, 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400', true)
      ON CONFLICT DO NOTHING;
    `);
    console.log('✅ Products seeded (30 products)\n');

    // ========================================
    // 3. ORDERS (15 orders with various statuses)
    // ========================================
    console.log('🛒 Seeding orders...');
    
    // Get user IDs
    const usersResult = await client.query('SELECT id FROM users WHERE role = $1 LIMIT 8', ['user']);
    const userIds = usersResult.rows.map(r => r.id);

    // Create orders
    const orders = [
      { userId: userIds[0], orderNumber: 'ORD-241001-001', totalAmount: 2499.99, status: 'paid', paymentMethod: 'stripe', createdAt: "NOW() - INTERVAL '30 days'" },
      { userId: userIds[0], orderNumber: 'ORD-241005-002', totalAmount: 449.99, status: 'paid', paymentMethod: 'stripe', createdAt: "NOW() - INTERVAL '25 days'" },
      { userId: userIds[1], orderNumber: 'ORD-241008-003', totalAmount: 1899.99, status: 'paid', paymentMethod: 'esewa', createdAt: "NOW() - INTERVAL '22 days'" },
      { userId: userIds[1], orderNumber: 'ORD-241012-004', totalAmount: 89.99, status: 'paid', paymentMethod: 'stripe', createdAt: "NOW() - INTERVAL '19 days'" },
      { userId: userIds[2], orderNumber: 'ORD-241015-005', totalAmount: 1099.99, status: 'paid', paymentMethod: 'stripe', createdAt: "NOW() - INTERVAL '16 days'" },
      { userId: userIds[2], orderNumber: 'ORD-241018-006', totalAmount: 399.99, status: 'paid', paymentMethod: 'stripe', createdAt: "NOW() - INTERVAL '13 days'" },
      { userId: userIds[3], orderNumber: 'ORD-241020-007', totalAmount: 699.99, status: 'paid', paymentMethod: 'esewa', createdAt: "NOW() - INTERVAL '11 days'" },
      { userId: userIds[3], orderNumber: 'ORD-241022-008', totalAmount: 249.99, status: 'paid', paymentMethod: 'stripe', createdAt: "NOW() - INTERVAL '9 days'" },
      { userId: userIds[4], orderNumber: 'ORD-241025-009', totalAmount: 599.99, status: 'paid', paymentMethod: 'stripe', createdAt: "NOW() - INTERVAL '6 days'" },
      { userId: userIds[4], orderNumber: 'ORD-241027-010', totalAmount: 49.99, status: 'paid', paymentMethod: 'stripe', createdAt: "NOW() - INTERVAL '4 days'" },
      { userId: userIds[5], orderNumber: 'ORD-241029-011', totalAmount: 129.99, status: 'paid', paymentMethod: 'esewa', createdAt: "NOW() - INTERVAL '2 days'" },
      { userId: userIds[5], orderNumber: 'ORD-241030-012', totalAmount: 849.98, status: 'pending', paymentMethod: 'stripe', createdAt: "NOW() - INTERVAL '1 day'" },
      { userId: userIds[6], orderNumber: 'ORD-241031-013', totalAmount: 2499.99, status: 'pending', paymentMethod: 'stripe', createdAt: "NOW() - INTERVAL '12 hours'" },
      { userId: userIds[6], orderNumber: 'ORD-241031-014', totalAmount: 159.98, status: 'cancelled', paymentMethod: 'stripe', createdAt: "NOW() - INTERVAL '6 hours'" },
      { userId: userIds[7], orderNumber: 'ORD-241031-015', totalAmount: 99.99, status: 'pending', paymentMethod: 'esewa', createdAt: "NOW() - INTERVAL '2 hours'" },
    ];

    for (const order of orders) {
      await client.query(`
        INSERT INTO orders (user_id, order_number, total_amount, status, payment_method, created_at)
        VALUES ($1, $2, $3, $4, $5, ${order.createdAt})
      `, [order.userId, order.orderNumber, order.totalAmount, order.status, order.paymentMethod]);
    }
    console.log('✅ Orders seeded (15 orders)\n');

    // ========================================
    // 4. ORDER ITEMS (products in orders)
    // ========================================
    console.log('📋 Seeding order items...');
    
    // Get order IDs
    const ordersResult = await client.query('SELECT id, order_number FROM orders ORDER BY created_at');
    const orderIdMap = Object.fromEntries(ordersResult.rows.map(r => [r.order_number, r.id]));

    const orderItems = [
      // Order 1: MacBook Pro
      { orderId: orderIdMap['ORD-241001-001'], productId: 1, name: 'MacBook Pro 16"', price: 2499.99, quantity: 1 },
      
      // Order 2: Ergonomic chair
      { orderId: orderIdMap['ORD-241005-002'], productId: 11, name: 'ErgoChair Pro', price: 449.99, quantity: 1 },
      
      // Order 3: Dell laptop
      { orderId: orderIdMap['ORD-241008-003'], productId: 2, name: 'Dell XPS 15', price: 1899.99, quantity: 1 },
      
      // Order 4: Multiple accessories
      { orderId: orderIdMap['ORD-241012-004'], productId: 7, name: 'Logitech MX Master 3S', price: 99.99, quantity: 1 },
      
      // Order 5: iPad
      { orderId: orderIdMap['ORD-241015-005'], productId: 3, name: 'iPad Pro 12.9"', price: 1099.99, quantity: 1 },
      
      // Order 6: Headphones
      { orderId: orderIdMap['ORD-241018-006'], productId: 5, name: 'Sony WH-1000XM5', price: 399.99, quantity: 1 },
      
      // Order 7: Standing desk
      { orderId: orderIdMap['ORD-241020-007'], productId: 12, name: 'Standing Desk Pro', price: 699.99, quantity: 1 },
      
      // Order 8: AirPods
      { orderId: orderIdMap['ORD-241022-008'], productId: 6, name: 'Apple AirPods Pro 2', price: 249.99, quantity: 1 },
      
      // Order 9: Monitor
      { orderId: orderIdMap['ORD-241025-009'], productId: 9, name: 'LG 27" 4K Monitor', price: 599.99, quantity: 1 },
      
      // Order 10: Books
      { orderId: orderIdMap['ORD-241027-010'], productId: 10, name: 'USB-C Hub 8-in-1', price: 49.99, quantity: 1 },
      
      // Order 11: Multiple items
      { orderId: orderIdMap['ORD-241029-011'], productId: 8, name: 'Keychron K8 Pro', price: 109.99, quantity: 1 },
      { orderId: orderIdMap['ORD-241029-011'], productId: 15, name: 'Cable Management Box', price: 24.99, quantity: 1 },
      
      // Order 12: Books bundle
      { orderId: orderIdMap['ORD-241030-012'], productId: 19, name: 'Clean Code by Robert Martin', price: 39.99, quantity: 1 },
      { orderId: orderIdMap['ORD-241030-012'], productId: 20, name: 'Designing Data-Intensive Applications', price: 49.99, quantity: 1 },
      { orderId: orderIdMap['ORD-241030-012'], productId: 21, name: 'System Design Interview Vol 1', price: 34.99, quantity: 2 },
      
      // Order 13: MacBook (pending)
      { orderId: orderIdMap['ORD-241031-013'], productId: 1, name: 'MacBook Pro 16"', price: 2499.99, quantity: 1 },
      
      // Order 14: Accessories (cancelled)
      { orderId: orderIdMap['ORD-241031-014'], productId: 28, name: 'Laptop Stand Aluminum', price: 49.99, quantity: 1 },
      { orderId: orderIdMap['ORD-241031-014'], productId: 7, name: 'Logitech MX Master 3S', price: 99.99, quantity: 1 },
      
      // Order 15: Logitech mouse (pending)
      { orderId: orderIdMap['ORD-241031-015'], productId: 7, name: 'Logitech MX Master 3S', price: 99.99, quantity: 1 },
    ];

    for (const item of orderItems) {
      await client.query(`
        INSERT INTO order_items (order_id, product_id, name, price, quantity)
        VALUES ($1, $2, $3, $4, $5)
      `, [item.orderId, item.productId, item.name, item.price, item.quantity]);
    }
    console.log('✅ Order items seeded (20 items)\n');

    // ========================================
    // 5. CHAT THREADS (5 threads with messages)
    // ========================================
    console.log('💬 Seeding chat threads and messages...');
    
    const chatThreads = [
      { userId: userIds[0], title: 'Help with MacBook setup' },
      { userId: userIds[1], title: 'Product recommendations for home office' },
      { userId: userIds[2], title: 'iPad vs Surface Pro comparison' },
      { userId: userIds[3], title: 'Standing desk height recommendations' },
      { userId: userIds[4], title: 'Best monitor for programming' },
    ];

    for (const thread of chatThreads) {
      const threadResult = await client.query(`
        INSERT INTO chat_threads (user_id, title)
        VALUES ($1, $2)
        RETURNING id
      `, [thread.userId, thread.title]);
      
      const threadId = threadResult.rows[0].id;

      // Add messages to each thread
      await client.query(`
        INSERT INTO chat_messages (thread_id, role, content, timestamp)
        VALUES
          ($1, 'user', $2, NOW() - INTERVAL '10 minutes'),
          ($1, 'assistant', $3, NOW() - INTERVAL '9 minutes'),
          ($1, 'user', $4, NOW() - INTERVAL '5 minutes'),
          ($1, 'assistant', $5, NOW() - INTERVAL '4 minutes')
      `, [
        threadId,
        `Hello, I need help with: ${thread.title}`,
        `I'd be happy to help you with ${thread.title}. Let me provide you with some information...`,
        'That sounds great! Can you tell me more details?',
        'Of course! Here are the details you requested...'
      ]);
    }
    console.log('✅ Chat threads seeded (5 threads with 20 messages)\n');

    // ========================================
    // 6. PAYMENT AUDIT LOGS (sample audit events)
    // ========================================
    console.log('📝 Seeding payment audit logs...');
    
    // Get some order numbers
    const paidOrders = await client.query(`
      SELECT order_number FROM orders WHERE status = 'paid' LIMIT 5
    `);

    for (const order of paidOrders.rows) {
      await client.query(`
        INSERT INTO payment_audit_logs 
        (order_number, event_type, provider, user_id, actor, previous_status, new_status, details, ip_address, correlation_id, success, message)
        VALUES
          -- Checkout session created
          ($1, 'CHECKOUT_SESSION_CREATED', 'STRIPE', $2, 'USER', NULL, 'pending', 
           '{"session_id": "cs_test_abc123", "amount": 2499.99}'::jsonb, 
           '192.168.1.100'::inet, gen_random_uuid(), true, 'Checkout session created'),
          
          -- Payment successful webhook
          ($1, 'PAYMENT_SUCCESSFUL', 'STRIPE', $2, 'WEBHOOK', 'pending', 'paid',
           '{"payment_intent_id": "pi_test_xyz789", "amount": 2499.99}'::jsonb,
           '54.187.123.45'::inet, gen_random_uuid(), true, 'Payment completed successfully'),
          
          -- Order fulfilled
          ($1, 'ORDER_FULFILLED', 'SYSTEM', $2, 'SYSTEM', 'paid', 'paid',
           '{"fulfillment_id": "ff_abc123", "tracking_number": "1Z999AA10123456784"}'::jsonb,
           NULL, gen_random_uuid(), true, 'Order marked as fulfilled')
      `, [order.order_number, userIds[0]]);
    }
    console.log('✅ Payment audit logs seeded (15 events)\n');

    // ========================================
    // 7. RATE LIMITS (sample rate limit entries)
    // ========================================
    console.log('🚦 Seeding rate limits...');
    
    await client.query(`
      INSERT INTO rate_limits (key, count, window_start, expires_at)
      VALUES
        ('user:${userIds[0]}:ai_generate', 5, NOW() - INTERVAL '30 seconds', NOW() + INTERVAL '30 seconds'),
        ('user:${userIds[1]}:ai_generate', 12, NOW() - INTERVAL '45 seconds', NOW() + INTERVAL '15 seconds'),
        ('user:${userIds[2]}:catalog_search', 50, NOW() - INTERVAL '20 seconds', NOW() + INTERVAL '40 seconds')
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log('✅ Rate limits seeded (3 entries)\n');

    // ========================================
    // 8. IDEMPOTENCY KEYS (sample idempotency entries)
    // ========================================
    console.log('🔑 Seeding idempotency keys...');
    
    await client.query(`
      INSERT INTO idempotency_keys (key, response, status, expires_at)
      VALUES
        ('stripe_webhook:evt_test_abc123', '{"processed": true}'::jsonb, 'completed', NOW() + INTERVAL '23 hours'),
        ('stripe_webhook:evt_test_xyz789', '{"processed": true}'::jsonb, 'completed', NOW() + INTERVAL '22 hours'),
        ('payment_create:unique_key_123', '{"order_id": 1, "status": "created"}'::jsonb, 'completed', NOW() + INTERVAL '23.5 hours')
      ON CONFLICT (key) DO NOTHING;
    `);
    console.log('✅ Idempotency keys seeded (3 entries)\n');

    // ========================================
    // REFRESH MATERIALIZED VIEW
    // ========================================
    console.log('🔄 Refreshing materialized view...');
    await client.query('REFRESH MATERIALIZED VIEW user_order_stats;');
    console.log('✅ Materialized view refreshed\n');

    // ========================================
    // SUMMARY
    // ========================================
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('✅ DATABASE SEEDING COMPLETE!\n');
    console.log('📊 Summary:');
    
    const summary = await client.query(`
      SELECT 
        'users' as table_name, COUNT(*) as row_count FROM users
      UNION ALL
      SELECT 'products', COUNT(*) FROM products
      UNION ALL
      SELECT 'orders', COUNT(*) FROM orders
      UNION ALL
      SELECT 'order_items', COUNT(*) FROM order_items
      UNION ALL
      SELECT 'chat_threads', COUNT(*) FROM chat_threads
      UNION ALL
      SELECT 'chat_messages', COUNT(*) FROM chat_messages
      UNION ALL
      SELECT 'payment_audit_logs', COUNT(*) FROM payment_audit_logs
      UNION ALL
      SELECT 'rate_limits', COUNT(*) FROM rate_limits
      UNION ALL
      SELECT 'idempotency_keys', COUNT(*) FROM idempotency_keys
      ORDER BY table_name;
    `);

    console.table(summary.rows);

    console.log('\n🎯 What you can practice now:');
    console.log('   ✓ Complex JOINs (users + orders + order_items)');
    console.log('   ✓ Aggregations (total spent per user, products per category)');
    console.log('   ✓ Window functions (rank users by spending)');
    console.log('   ✓ Date filtering (orders in last 7 days, 30 days)');
    console.log('   ✓ Full-text search (products by name)');
    console.log('   ✓ JSONB queries (payment audit logs)');
    console.log('   ✓ Materialized views (user_order_stats)');
    console.log('\n🚀 Run test queries: npx ts-node src/database/test-queries.ts\n');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run seeding
seedData()
  .then(() => {
    console.log('✅ Done! Your database is now fully populated with realistic data.\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
