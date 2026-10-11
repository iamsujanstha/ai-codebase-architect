import { getPool } from './db';

/**
 * EXERCISE 08: Constraints (Enforcing Data Integrity at the Engine Level)
 * 
 * MongoDB vs PostgreSQL:
 * - MongoDB: Validation is typically soft or handled at the application layer (Mongoose schema).
 *   Orphaned references happen easily when documents are deleted.
 * - PostgreSQL: Guarantees relational and semantic validity directly in the storage engine.
 *   Transactions that violate constraints fail immediately before touching disk.
 * 
 * Concepts Demonstrated:
 * 1. CHECK Constraints (Range, format, enum-like conditions)
 * 2. FOREIGN KEY Constraints with Referencing Behaviors:
 *    - CASCADE
 *    - RESTRICT / NO ACTION
 *    - SET NULL
 * 3. UNIQUE & Composite UNIQUE Constraints
 * 4. NOT NULL Constraints
 */
export async function runConstraintsExercise(): Promise<void> {
  const pool = getPool();
  console.log('\n======================================================');
  console.log('--- EXERCISE 08: Relational Constraints & Integrity ---');
  console.log('======================================================\n');

  try {
    // 1. Setup tables with various constraint types
    await pool.query(`
      DROP TABLE IF EXISTS exercise_order_items CASCADE;
      DROP TABLE IF EXISTS exercise_orders CASCADE;
      DROP TABLE IF EXISTS exercise_customers CASCADE;

      -- Customers table with CHECK and UNIQUE constraints
      CREATE TABLE exercise_customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        age INT CHECK (age >= 18 AND age <= 120),
        status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED'))
      );

      -- Orders table with FOREIGN KEY (CASCADE) and CHECK constraints
      CREATE TABLE exercise_orders (
        id SERIAL PRIMARY KEY,
        customer_id INT NOT NULL REFERENCES exercise_customers(id) ON DELETE CASCADE,
        order_total NUMERIC(10, 2) NOT NULL CHECK (order_total >= 0),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- Order items table with composite UNIQUE and RESTRICT foreign key
      CREATE TABLE exercise_order_items (
        id SERIAL PRIMARY KEY,
        order_id INT NOT NULL REFERENCES exercise_orders(id) ON DELETE CASCADE,
        product_code VARCHAR(50) NOT NULL,
        quantity INT NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price > 0),
        -- Constraint: same product cannot be added twice to the same order (use quantity instead)
        CONSTRAINT uq_order_product UNIQUE (order_id, product_code)
      );
    `);
    console.log('✅ Created tables: exercise_customers, exercise_orders, exercise_order_items with constraints');

    // 2. Insert valid data
    const custRes = await pool.query(`
      INSERT INTO exercise_customers (name, email, age, status)
      VALUES ('Alice Engineer', 'alice@tech.io', 28, 'ACTIVE')
      RETURNING id;
    `);
    const custId = custRes.rows[0].id;
    console.log(`Inserted valid customer ID: ${custId}`);

    // 3. Test CHECK constraint violation (age < 18)
    try {
      await pool.query(`
        INSERT INTO exercise_customers (name, email, age, status)
        VALUES ('Underage User', 'kid@tech.io', 14, 'ACTIVE');
      `);
    } catch (err: any) {
      console.log(`🛡️  CHECK Constraint intercepted invalid age: "${err.message}" (code: ${err.code})`);
    }

    // 4. Test UNIQUE constraint violation (duplicate email)
    try {
      await pool.query(`
        INSERT INTO exercise_customers (name, email, age, status)
        VALUES ('Duplicate Alice', 'alice@tech.io', 30, 'ACTIVE');
      `);
    } catch (err: any) {
      console.log(`🛡️  UNIQUE Constraint intercepted duplicate email: "${err.message}" (code: ${err.code})`);
    }

    // 5. Test Composite UNIQUE constraint (same product twice in order)
    const orderRes = await pool.query(`
      INSERT INTO exercise_orders (customer_id, order_total)
      VALUES ($1, 150.00) RETURNING id;
    `, [custId]);
    const orderId = orderRes.rows[0].id;

    await pool.query(`
      INSERT INTO exercise_order_items (order_id, product_code, quantity, unit_price)
      VALUES ($1, 'PRD-M3-MAX', 1, 150.00);
    `, [orderId]);
    console.log(`Added product 'PRD-M3-MAX' to order ${orderId}`);

    try {
      await pool.query(`
        INSERT INTO exercise_order_items (order_id, product_code, quantity, unit_price)
        VALUES ($1, 'PRD-M3-MAX', 2, 150.00);
      `, [orderId]);
    } catch (err: any) {
      console.log(`🛡️  Composite UNIQUE intercepted duplicate product in order: "${err.message}"`);
    }

    // 6. Test Foreign Key ON DELETE CASCADE
    console.log('\n--- Demonstrating Foreign Key ON DELETE CASCADE ---');
    const itemsBefore = await pool.query('SELECT COUNT(*) FROM exercise_order_items WHERE order_id = $1;', [orderId]);
    console.log(`Order items before deleting customer: ${itemsBefore.rows[0].count}`);

    await pool.query('DELETE FROM exercise_customers WHERE id = $1;', [custId]);
    console.log(`Deleted customer ${custId}...`);

    const ordersAfter = await pool.query('SELECT COUNT(*) FROM exercise_orders WHERE customer_id = $1;', [custId]);
    const itemsAfter = await pool.query('SELECT COUNT(*) FROM exercise_order_items WHERE order_id = $1;', [orderId]);
    console.log(`Orders remaining: ${ordersAfter.rows[0].count}`);
    console.log(`Order items remaining: ${itemsAfter.rows[0].count} (automatically cascaded!)`);

    // Clean up
    await pool.query(`
      DROP TABLE IF EXISTS exercise_order_items CASCADE;
      DROP TABLE IF EXISTS exercise_orders CASCADE;
      DROP TABLE IF EXISTS exercise_customers CASCADE;
    `);
    console.log('\n✅ Cleaned up constraint exercise tables.');
  } catch (error) {
    console.error('❌ Exercise 08 failed:', error);
    throw error;
  }
}

if (require.main === module) {
  runConstraintsExercise().then(() => process.exit(0)).catch(() => process.exit(1));
}
