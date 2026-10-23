/**
 * Exercise 1: Data Modeling & Normalization
 *
 * Goal: Understand normalization forms and when to denormalize
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * WHY THIS MATTERS (Production Importance)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Data modeling is the foundation that every other database concept rests on.
 * A poorly normalized schema does not fail on day one — it fails at scale,
 * silently corrupting data through anomalies that are invisible until an audit.
 *
 * Real-world failures caused by bad data modeling:
 *
 * 1. UPDATE ANOMALY (Silent Price Drift):
 *    An e-commerce platform stored product prices inside the orders table.
 *    When marketing updated the product price, 30% of historical order records
 *    were accidentally overwritten, destroying financial audit trails and causing
 *    $2M in tax discrepancies. A normalized design (price stored once in products,
 *    denormalized snapshot in order_items) prevents this entirely.
 *
 * 2. INSERT ANOMALY (Orphaned Entities):
 *    A SaaS platform stored company info alongside subscription records.
 *    New companies could not be onboarded until they purchased a subscription,
 *    because the company could not exist without a subscription row. This blocked
 *    the sales pipeline for "freemium" tier users.
 *
 * 3. DELETE ANOMALY (Catastrophic Data Loss):
 *    A logistics app stored driver details inside the shipment table.
 *    When the last shipment for a driver was deleted, the driver's contact info,
 *    license number, and insurance details vanished permanently.
 *
 * In Atlas Commerce Lab:
 *   - `users`, `products`, `orders`, `order_items` follow strict 3NF.
 *   - `order_items` deliberately denormalizes `name` and `price` as historical
 *     snapshots — this is intentional denormalization for audit correctness.
 *   - The `product_embeddings` table is a 1-to-1 extension table (not embedded
 *     in `products`) to keep the relational schema clean from vector concerns.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FROM SCRATCH (How to Build / Think About It)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Step 1 — Identify Entities:
 *   Ask "What are the nouns?" — Users, Products, Orders, Payments.
 *   Each noun becomes a table with its own PRIMARY KEY.
 *
 * Step 2 — Apply 1NF (First Normal Form):
 *   Every column holds a single atomic value. No arrays, no comma-separated
 *   lists, no nested objects. Each row is uniquely identifiable by a primary key.
 *   ❌ tags = "electronics,sale,featured"
 *   ✅ product_tags table with (product_id, tag) rows
 *
 * Step 3 — Apply 2NF (Second Normal Form):
 *   Remove partial dependencies. Every non-key column must depend on the
 *   *entire* primary key, not just part of a composite key.
 *   ❌ order_items(order_id, product_id, product_name) — product_name depends
 *      only on product_id, not on (order_id, product_id).
 *   ✅ Move product_name to the products table.
 *
 * Step 4 — Apply 3NF (Third Normal Form):
 *   Remove transitive dependencies. Non-key columns must not depend on other
 *   non-key columns.
 *   ❌ orders(user_id, user_email) — user_email depends on user_id, not on order.
 *   ✅ Store user_email only in users table, join when needed.
 *
 * Step 5 — Intentional Denormalization (Know the Rules to Break Them):
 *   After normalizing, selectively denormalize for:
 *   - Read performance: Materialized views, computed columns.
 *   - Historical accuracy: Snapshot price/name at time of purchase into order_items.
 *   - Cache efficiency: Precomputed aggregates (total_orders on user profile).
 *   Always document WHY you denormalized — future engineers will question it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTERVIEW Q&A (Senior / Staff Level)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Q1: "What is normalization and why does it matter?"
 * A:  Normalization is the process of organizing columns and tables to reduce
 *     data redundancy and eliminate anomalies (insert, update, delete).
 *     It matters because redundant data leads to inconsistency — if the same
 *     fact is stored in 5 rows and you update only 4, your database now
 *     contains contradictory information with no way to know which is correct.
 *
 * Q2: "When would you intentionally denormalize?"
 * A:  Three situations: (1) Read-heavy dashboards where JOINs across 6 tables
 *     on every page load are too slow — use a materialized view or precomputed
 *     summary table. (2) Historical snapshots — store the product price at time
 *     of purchase in order_items so price changes don't rewrite history.
 *     (3) Caching hot aggregates — store a `total_orders` counter on the user
 *     row to avoid COUNT(*) on every profile view.
 *     Follow-up: "How do you keep denormalized data consistent?"
 *     → Triggers, application-layer write-through, or periodic reconciliation jobs.
 *
 * Q3: "Explain the three data anomalies with a real example."
 * A:  Given a flat table `orders(order_id, customer_name, customer_email, product, price)`:
 *     - Insert anomaly: Cannot store a new customer until they place an order.
 *     - Update anomaly: Changing a customer's email requires updating every order row.
 *       Miss one row → the database now has two conflicting emails for the same person.
 *     - Delete anomaly: Deleting the last order deletes the customer's existence entirely.
 *
 * Q4: "What's the difference between 2NF and 3NF?"
 * A:  2NF eliminates partial dependencies (non-key columns depending on only part
 *     of a composite key). 3NF eliminates transitive dependencies (non-key columns
 *     depending on other non-key columns). In practice, if your tables all have
 *     single-column primary keys (SERIAL id), 2NF is automatically satisfied,
 *     so the main concern is 3NF — ensuring no column depends on another non-key column.
 *
 * Q5: "How do you decide between embedding (MongoDB) vs normalizing (PostgreSQL)?"
 * A:  Embed when: data is always read together, has a bounded size, and belongs
 *     exclusively to the parent (e.g., shipping address inside an order document).
 *     Normalize when: data is shared across entities, has unbounded growth, or
 *     requires independent querying (e.g., products referenced by many orders).
 *     The key question is ownership: "Does this data belong to one parent, or
 *     is it referenced by many?" If many → normalize. If one → consider embedding.
 */

import { pool } from './db';

async function demonstrateNormalization() {
  console.log('\n=== Exercise 1: Data Modeling & Normalization ===\n');

  try {
    // Task 1: Show denormalized data (bad)
    console.log('Task 1: Denormalized Table (Bad Design)');
    console.log('Creating a denormalized orders table with repeated data...\n');

    await pool.query(`
      DROP TABLE IF EXISTS orders_bad CASCADE;
      
      CREATE TABLE orders_bad (
        order_id SERIAL PRIMARY KEY,
        customer_name VARCHAR(255),
        customer_email VARCHAR(255),
        customer_phone VARCHAR(20),
        product_name VARCHAR(255),
        product_price DECIMAL(10, 2),
        quantity INTEGER,
        order_date TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Insert denormalized data
    await pool.query(`
      INSERT INTO orders_bad (customer_name, customer_email, customer_phone, product_name, product_price, quantity)
      VALUES 
        ('Alice Johnson', 'alice@example.com', '555-0101', 'Laptop', 1299.99, 1),
        ('Alice Johnson', 'alice@example.com', '555-0101', 'Mouse', 29.99, 2),
        ('Bob Smith', 'bob@example.com', '555-0102', 'Keyboard', 79.99, 1);
    `);

    const denormalized = await pool.query('SELECT * FROM orders_bad');
    console.log('Denormalized data (notice repeated customer info):');
    console.table(denormalized.rows);

    console.log('\n❌ Problems with denormalized design:');
    console.log("1. Data duplication (Alice's info repeated)");
    console.log(
      "2. Update anomaly (changing Alice's email requires updating multiple rows)",
    );
    console.log("3. Insert anomaly (can't store customer without order)");
    console.log(
      '4. Delete anomaly (deleting last order deletes customer info)\n',
    );

    // Task 2: Show normalized design (good)
    console.log('\nTask 2: Normalized Tables (Good Design - 3NF)');
    console.log('Creating normalized tables...\n');

    await pool.query(`
      DROP TABLE IF EXISTS customers_demo CASCADE;
      DROP TABLE IF EXISTS products_demo CASCADE;
      DROP TABLE IF EXISTS orders_demo CASCADE;
      DROP TABLE IF EXISTS order_items_demo CASCADE;

      -- Customers table (no redundancy)
      CREATE TABLE customers_demo (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20)
      );

      -- Products table (separate entity)
      CREATE TABLE products_demo (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL
      );

      -- Orders table (links to customer)
      CREATE TABLE orders_demo (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers_demo(id),
        order_date TIMESTAMPTZ DEFAULT NOW()
      );

      -- Order items (M:N relationship between orders and products)
      CREATE TABLE order_items_demo (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders_demo(id),
        product_id INTEGER REFERENCES products_demo(id),
        quantity INTEGER NOT NULL,
        price_at_purchase DECIMAL(10, 2) NOT NULL -- Denormalized for historical accuracy
      );
    `);

    // Insert normalized data
    await pool.query(`
      -- Insert customers (once)
      INSERT INTO customers_demo (name, email, phone) VALUES 
        ('Alice Johnson', 'alice@example.com', '555-0101'),
        ('Bob Smith', 'bob@example.com', '555-0102');

      -- Insert products (once)
      INSERT INTO products_demo (name, price) VALUES 
        ('Laptop', 1299.99),
        ('Mouse', 29.99),
        ('Keyboard', 79.99);

      -- Insert orders
      INSERT INTO orders_demo (customer_id) VALUES (1), (2);

      -- Insert order items
      INSERT INTO order_items_demo (order_id, product_id, quantity, price_at_purchase)
      VALUES 
        (1, 1, 1, 1299.99), -- Alice's order: Laptop
        (1, 2, 2, 29.99),   -- Alice's order: Mouse x2
        (2, 3, 1, 79.99);   -- Bob's order: Keyboard
    `);

    console.log('Customers (stored once):');
    const customers = await pool.query('SELECT * FROM customers_demo');
    console.table(customers.rows);

    console.log('\nProducts (stored once):');
    const products = await pool.query('SELECT * FROM products_demo');
    console.table(products.rows);

    console.log('\nOrders:');
    const orders = await pool.query('SELECT * FROM orders_demo');
    console.table(orders.rows);

    console.log('\nOrder Items (links orders to products):');
    const items = await pool.query('SELECT * FROM order_items_demo');
    console.table(items.rows);

    // Task 3: Show query comparison
    console.log('\n\nTask 3: Query Comparison\n');

    const normalizedQuery = await pool.query(`
      SELECT 
        c.name AS customer,
        c.email,
        o.id AS order_id,
        p.name AS product,
        oi.quantity,
        oi.price_at_purchase,
        (oi.quantity * oi.price_at_purchase) AS subtotal
      FROM customers_demo c
      JOIN orders_demo o ON c.id = o.customer_id
      JOIN order_items_demo oi ON o.id = oi.order_id
      JOIN products_demo p ON oi.product_id = p.id
      ORDER BY c.name, o.id;
    `);

    console.log('Normalized query result:');
    console.table(normalizedQuery.rows);

    console.log('\n✅ Benefits of normalized design:');
    console.log('1. No data duplication');
    console.log('2. Easy updates (change customer email in one place)');
    console.log('3. Referential integrity (foreign keys prevent orphans)');
    console.log('4. Flexible queries (join as needed)\n');

    // Task 4: Demonstrate strategic denormalization
    console.log('\nTask 4: Strategic Denormalization');
    console.log('Why we denormalize price_at_purchase:\n');

    // Update product price
    await pool.query(
      `UPDATE products_demo SET price = 1399.99 WHERE name = 'Laptop'`,
    );

    const priceComparison = await pool.query(`
      SELECT 
        p.name,
        p.price AS current_price,
        oi.price_at_purchase AS historical_price,
        CASE 
          WHEN p.price != oi.price_at_purchase THEN 'Price changed!'
          ELSE 'Same price'
        END AS status
      FROM order_items_demo oi
      JOIN products_demo p ON oi.product_id = p.id;
    `);

    console.log('Price comparison (current vs historical):');
    console.table(priceComparison.rows);

    console.log('\n💡 Denormalization Tradeoff:');
    console.log(
      '✅ Pros: Historical accuracy (orders show purchase-time price)',
    );
    console.log('❌ Cons: Data duplication');
    console.log(
      '✅ Decision: Worth it! Orders must reflect actual purchase price.\n',
    );

    // Cleanup
    await pool.query(`
      DROP TABLE IF EXISTS order_items_demo CASCADE;
      DROP TABLE IF EXISTS orders_demo CASCADE;
      DROP TABLE IF EXISTS products_demo CASCADE;
      DROP TABLE IF EXISTS customers_demo CASCADE;
      DROP TABLE IF EXISTS orders_bad CASCADE;
    `);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Interview Question Practice
function printInterviewQuestions() {
  console.log('\n=== Interview Questions ===\n');

  console.log('Q1: "Explain 3NF with an example"\n');
  console.log(
    'A: "3NF eliminates transitive dependencies. For example, in an orders table,',
  );
  console.log(
    "if we store customer_id, customer_name, and customer_city, there's a transitive",
  );
  console.log(
    'dependency: order → customer_id → customer_city. The city depends on customer_id,',
  );
  console.log(
    'not on the order itself. To normalize to 3NF, we separate customers into their',
  );
  console.log(
    'own table with customer_id as foreign key in orders. This prevents update',
  );
  console.log(
    'anomalies—if a customer moves cities, we update one row in customers table,',
  );
  console.log('not all their orders."\n');

  console.log('Q2: "When would you denormalize?"\n');
  console.log(
    'A: "I denormalize when read performance is critical and data rarely changes.',
  );
  console.log(
    'For example, in our order_items table, I store price_at_purchase even though',
  );
  console.log(
    'product price exists in products table. Why? Product prices change, but historical',
  );
  console.log(
    'orders must reflect the price at time of purchase. The tradeoff is data duplication,',
  );
  console.log(
    "but historical accuracy is non-negotiable for orders. I wouldn't denormalize if",
  );
  console.log(
    'data changes frequently—synchronization overhead would outweigh benefits."\n',
  );
}

// Run the exercise
if (require.main === module) {
  demonstrateNormalization()
    .then(() => {
      printInterviewQuestions();
      pool.end();
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      pool.end();
      process.exit(1);
    });
}

export { demonstrateNormalization };
