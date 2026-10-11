/**
 * Exercise 1: Data Modeling & Normalization
 *
 * Goal: Understand normalization forms and when to denormalize
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
