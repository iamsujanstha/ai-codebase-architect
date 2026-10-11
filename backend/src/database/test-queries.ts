#!/usr/bin/env ts-node
/**
 * PostgreSQL Learning - Practice SQL Queries
 * Run this script to practice SQL and see results
 */

import { Client } from 'pg';

const connectionString = process.env.POSTGRES_URL || 
  'postgresql://neondb_owner:npg_HkO0lvFZzJ1u@ep-super-rice-b34nlx0w-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function runQueries() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('🔌 Connected to PostgreSQL\n');

  try {
    // ========================================
    // LESSON 1: Basic SELECT
    // ========================================
    console.log('📚 LESSON 1: Basic SELECT\n');
    
    const users = await client.query('SELECT * FROM users;');
    console.log('All users:');
    console.table(users.rows);

    const products = await client.query('SELECT name, price, category FROM products ORDER BY price DESC;');
    console.log('Products (sorted by price):');
    console.table(products.rows);

    // ========================================
    // LESSON 2: WHERE Clause
    // ========================================
    console.log('\n📚 LESSON 2: WHERE Clause\n');

    const electronics = await client.query(`
      SELECT name, price, stock 
      FROM products 
      WHERE category = 'Electronics' AND stock > 50
      ORDER BY price DESC;
    `);
    console.log('Electronics with stock > 50:');
    console.table(electronics.rows);

    const admins = await client.query(`
      SELECT name, email, created_at 
      FROM users 
      WHERE role = 'admin';
    `);
    console.log('Admin users:');
    console.table(admins.rows);

    // ========================================
    // LESSON 3: Aggregations
    // ========================================
    console.log('\n📚 LESSON 3: Aggregations (COUNT, AVG, SUM)\n');

    const stats = await client.query(`
      SELECT 
        category,
        COUNT(*) as product_count,
        ROUND(AVG(price)::numeric, 2) as avg_price,
        SUM(stock) as total_stock
      FROM products
      GROUP BY category
      ORDER BY product_count DESC;
    `);
    console.log('Products by category:');
    console.table(stats.rows);

    // ========================================
    // LESSON 4: Understanding Indexes (EXPLAIN)
    // ========================================
    console.log('\n📚 LESSON 4: Understanding Indexes with EXPLAIN\n');

    // Query without using index (Seq Scan)
    const explain1 = await client.query(`
      EXPLAIN ANALYZE SELECT * FROM products WHERE name LIKE '%Laptop%';
    `);
    console.log('Query 1: Text search (should show Seq Scan):');
    console.log(explain1.rows.map(r => r['QUERY PLAN']).join('\n'));

    // Query using index (Index Scan)
    const explain2 = await client.query(`
      EXPLAIN ANALYZE SELECT * FROM products WHERE category = 'Electronics';
    `);
    console.log('\nQuery 2: Category filter (should show Index Scan):');
    console.log(explain2.rows.map(r => r['QUERY PLAN']).join('\n'));

    // ========================================
    // LESSON 5: Transactions (Atomicity)
    // ========================================
    console.log('\n📚 LESSON 5: Transactions (ACID)\n');

    console.log('Starting transaction...');
    await client.query('BEGIN;');

    // Insert test order
    const orderResult = await client.query(`
      INSERT INTO orders (user_id, order_number, total_amount, status)
      VALUES (1, 'TEST-ORDER-001', 99.99, 'pending')
      RETURNING id, order_number;
    `);
    console.log('Created order:', orderResult.rows[0]);

    // Insert order items
    const itemResult = await client.query(`
      INSERT INTO order_items (order_id, product_id, name, price, quantity)
      VALUES ($1, 1, 'Laptop Pro 15', 1299.99, 1)
      RETURNING *;
    `, [orderResult.rows[0].id]);
    console.log('Created order item:', itemResult.rows[0]);

    // Rollback (for testing - won't persist)
    await client.query('ROLLBACK;');
    console.log('Transaction rolled back (test data not persisted)');

    // ========================================
    // LESSON 6: JOINs
    // ========================================
    console.log('\n📚 LESSON 6: JOINs\n');

    // Left join to show users without orders
    const userOrders = await client.query(`
      SELECT 
        u.name,
        u.email,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_amount), 0) as total_spent
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'paid'
      GROUP BY u.id, u.name, u.email
      ORDER BY total_spent DESC;
    `);
    console.log('User order statistics:');
    console.table(userOrders.rows);

    // ========================================
    // LESSON 7: Subqueries and CTEs
    // ========================================
    console.log('\n📚 LESSON 7: Common Table Expressions (CTEs)\n');

    const cteQuery = await client.query(`
      WITH expensive_products AS (
        SELECT * FROM products WHERE price > 100
      ),
      category_stats AS (
        SELECT 
          category,
          COUNT(*) as count,
          AVG(price) as avg_price
        FROM expensive_products
        GROUP BY category
      )
      SELECT * FROM category_stats ORDER BY avg_price DESC;
    `);
    console.log('Expensive products by category (CTE):');
    console.table(cteQuery.rows);

    // ========================================
    // LESSON 8: Window Functions
    // ========================================
    console.log('\n📚 LESSON 8: Window Functions\n');

    const windowQuery = await client.query(`
      SELECT 
        name,
        category,
        price,
        ROW_NUMBER() OVER (PARTITION BY category ORDER BY price DESC) as rank_in_category,
        ROUND(AVG(price) OVER (PARTITION BY category)::numeric, 2) as category_avg_price
      FROM products
      ORDER BY category, rank_in_category;
    `);
    console.log('Products ranked within category:');
    console.table(windowQuery.rows);

    // ========================================
    // Summary
    // ========================================
    console.log('\n✅ Learning Complete!\n');
    console.log('📚 You\'ve practiced:');
    console.log('   ✓ SELECT, WHERE, ORDER BY');
    console.log('   ✓ Aggregations (COUNT, AVG, SUM, GROUP BY)');
    console.log('   ✓ EXPLAIN ANALYZE (understanding indexes)');
    console.log('   ✓ Transactions (BEGIN, ROLLBACK)');
    console.log('   ✓ JOINs (LEFT JOIN with aggregation)');
    console.log('   ✓ CTEs (WITH clause)');
    console.log('   ✓ Window Functions (ROW_NUMBER, AVG OVER)\n');

    console.log('🎯 Next Steps:');
    console.log('   1. Practice isolation levels (see POSTGRES_SETUP_COMMANDS.md)');
    console.log('   2. Trigger deadlocks and understand resolution');
    console.log('   3. Optimize slow queries with EXPLAIN ANALYZE');
    console.log('   4. Implement idempotency with UNIQUE constraints\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.end();
  }
}

runQueries();
