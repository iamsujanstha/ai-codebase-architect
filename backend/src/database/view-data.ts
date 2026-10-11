#!/usr/bin/env ts-node
/**
 * View all seeded data - Quick overview
 */

import { Client } from 'pg';

const connectionString =
  process.env.POSTGRES_URL ||
  'postgresql://neondb_owner:npg_HkO0lvFZzJ1u@ep-super-rice-b34nlx0w-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function viewData() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('🔌 Connected to PostgreSQL\n');

  try {
    // Users
    console.log('═══════════════════════════════════════════════════════════');
    console.log('👥 USERS (10 total)\n');
    const users = await client.query(`
      SELECT id, name, email, role, 
             CASE WHEN google_id IS NOT NULL THEN '✓ Google' ELSE 'Password' END as auth_method,
             is_active
      FROM users 
      ORDER BY role DESC, id
      LIMIT 10;
    `);
    console.table(users.rows);

    // Products by category
    console.log(
      '\n═══════════════════════════════════════════════════════════',
    );
    console.log('📦 PRODUCTS BY CATEGORY (30 total)\n');
    const productCategories = await client.query(`
      SELECT 
        category,
        COUNT(*) as product_count,
        CONCAT('$', MIN(price)::text, ' - $', MAX(price)::text) as price_range,
        SUM(stock) as total_stock
      FROM products
      GROUP BY category
      ORDER BY product_count DESC;
    `);
    console.table(productCategories.rows);

    // Top 10 products
    console.log(
      '\n═══════════════════════════════════════════════════════════',
    );
    console.log('🔥 TOP 10 MOST EXPENSIVE PRODUCTS\n');
    const topProducts = await client.query(`
      SELECT name, category, 
             CONCAT('$', price::text) as price,
             stock,
             CASE WHEN featured THEN '⭐' ELSE '' END as featured
      FROM products
      ORDER BY price DESC
      LIMIT 10;
    `);
    console.table(topProducts.rows);

    // Orders summary
    console.log(
      '\n═══════════════════════════════════════════════════════════',
    );
    console.log('🛒 ORDERS SUMMARY (15 total)\n');
    const orderSummary = await client.query(`
      SELECT 
        status,
        COUNT(*) as order_count,
        CONCAT('$', ROUND(SUM(total_amount)::numeric, 2)::text) as total_revenue,
        CONCAT('$', ROUND(AVG(total_amount)::numeric, 2)::text) as avg_order_value
      FROM orders
      GROUP BY status
      ORDER BY order_count DESC;
    `);
    console.table(orderSummary.rows);

    // Recent orders
    console.log(
      '\n═══════════════════════════════════════════════════════════',
    );
    console.log('🆕 RECENT ORDERS (Last 10)\n');
    const recentOrders = await client.query(`
      SELECT 
        o.order_number,
        u.name as customer,
        CONCAT('$', o.total_amount::text) as amount,
        o.status,
        o.payment_method,
        TO_CHAR(o.created_at, 'Mon DD, HH24:MI') as created
      FROM orders o
      JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 10;
    `);
    console.table(recentOrders.rows);

    // Top customers
    console.log(
      '\n═══════════════════════════════════════════════════════════',
    );
    console.log('💰 TOP CUSTOMERS BY SPENDING\n');
    const topCustomers = await client.query(`
      SELECT 
        u.name,
        u.email,
        COUNT(o.id) as total_orders,
        CONCAT('$', COALESCE(SUM(o.total_amount), 0)::numeric::text) as total_spent,
        CONCAT('$', ROUND(AVG(o.total_amount)::numeric, 2)::text) as avg_order
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'paid'
      WHERE u.role = 'user'
      GROUP BY u.id, u.name, u.email
      HAVING COUNT(o.id) > 0
      ORDER BY SUM(o.total_amount) DESC
      LIMIT 10;
    `);
    console.table(topCustomers.rows);

    // Popular products (by orders)
    console.log(
      '\n═══════════════════════════════════════════════════════════',
    );
    console.log('🌟 MOST ORDERED PRODUCTS\n');
    const popularProducts = await client.query(`
      SELECT 
        p.name,
        p.category,
        COUNT(oi.id) as times_ordered,
        SUM(oi.quantity) as total_quantity,
        CONCAT('$', p.price::text) as current_price
      FROM products p
      JOIN order_items oi ON p.id = oi.product_id
      GROUP BY p.id, p.name, p.category, p.price
      ORDER BY times_ordered DESC, total_quantity DESC
      LIMIT 10;
    `);
    console.table(popularProducts.rows);

    // Chat threads
    console.log(
      '\n═══════════════════════════════════════════════════════════',
    );
    console.log('💬 CHAT THREADS (5 total)\n');
    const chatThreads = await client.query(`
      SELECT 
        ct.id,
        u.name as user_name,
        ct.title,
        COUNT(cm.id) as message_count,
        TO_CHAR(MAX(cm.timestamp), 'Mon DD, HH24:MI') as last_message
      FROM chat_threads ct
      JOIN users u ON ct.user_id = u.id
      JOIN chat_messages cm ON ct.id = cm.thread_id
      GROUP BY ct.id, u.name, ct.title
      ORDER BY MAX(cm.timestamp) DESC;
    `);
    console.table(chatThreads.rows);

    // Payment audit logs
    console.log(
      '\n═══════════════════════════════════════════════════════════',
    );
    console.log('📝 PAYMENT AUDIT EVENTS (Sample)\n');
    const auditLogs = await client.query(`
      SELECT 
        order_number,
        event_type,
        provider,
        actor,
        CONCAT(previous_status, ' → ', new_status) as status_change,
        success,
        TO_CHAR(timestamp, 'Mon DD, HH24:MI') as timestamp
      FROM payment_audit_logs
      ORDER BY timestamp DESC
      LIMIT 10;
    `);
    console.table(auditLogs.rows);

    // Summary statistics
    console.log(
      '\n═══════════════════════════════════════════════════════════',
    );
    console.log('📊 OVERALL STATISTICS\n');

    const stats = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'user') as total_customers,
        (SELECT COUNT(*) FROM products) as total_products,
        (SELECT COUNT(*) FROM orders) as total_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'paid') as paid_orders,
        (SELECT CONCAT('$', SUM(total_amount)::numeric::text) FROM orders WHERE status = 'paid') as total_revenue,
        (SELECT COUNT(*) FROM chat_threads) as chat_threads,
        (SELECT COUNT(*) FROM chat_messages) as chat_messages;
    `);
    console.table(stats.rows);

    console.log(
      '\n═══════════════════════════════════════════════════════════\n',
    );
    console.log('✅ DATA OVERVIEW COMPLETE!\n');
    console.log('🎯 Ready for SQL practice:');
    console.log('   • Complex JOINs across multiple tables');
    console.log('   • Aggregations and GROUP BY');
    console.log('   • Window functions (ranking, analytics)');
    console.log('   • Date/time filtering');
    console.log('   • JSONB queries on audit logs');
    console.log('   • Materialized views for performance\n');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

viewData();
