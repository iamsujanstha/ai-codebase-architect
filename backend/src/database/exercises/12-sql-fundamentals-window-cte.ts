/**
 * Exercise 12: SQL Fundamentals — Window Functions, CTEs, & Recursive Queries
 *
 * Senior Backend / Architect Checklist — Topic 1: SQL Fundamentals
 *
 * Sequence:
 * WHY -> Problem -> Naive Solution -> Failure -> Correct Design -> Implementation -> Tradeoffs -> Interview Q&A
 */

import { pool } from './db';

export async function runSqlFundamentalsExercise() {
  console.log('\n=== Exercise 12: SQL Fundamentals — Window Functions & CTEs ===\n');

  try {
    // -------------------------------------------------------------
    // Setup Tables & Realistic Domain Data
    // -------------------------------------------------------------
    await pool.query(`
      DROP TABLE IF EXISTS employee_hierarchy CASCADE;
      DROP TABLE IF EXISTS daily_sales_analytics CASCADE;

      -- Categories with parent-child hierarchy for Recursive CTE
      CREATE TABLE employee_hierarchy (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        manager_id INT REFERENCES employee_hierarchy(id),
        department VARCHAR(100),
        salary NUMERIC(10, 2)
      );

      -- Daily sales records for Window Function analytics
      CREATE TABLE daily_sales_analytics (
        id SERIAL PRIMARY KEY,
        category VARCHAR(50) NOT NULL,
        sale_date DATE NOT NULL,
        revenue NUMERIC(10, 2) NOT NULL,
        units_sold INT NOT NULL
      );
    `);

    // Seed Hierarchy: CEO -> VP -> Leads -> Engineers
    await pool.query(`
      INSERT INTO employee_hierarchy (id, name, manager_id, department, salary) VALUES
        (1, 'Alice (CTO)', NULL, 'Executive', 250000),
        (2, 'Bob (VP Eng)', 1, 'Engineering', 190000),
        (3, 'Charlie (VP Prod)', 1, 'Product', 185000),
        (4, 'David (Staff Eng)', 2, 'Core Platform', 155000),
        (5, 'Eva (Sr Eng)', 4, 'Core Platform', 130000),
        (6, 'Frank (Sr Eng)', 4, 'Core Platform', 125000),
        (7, 'Grace (Eng)', 5, 'Core Platform', 95000);
    `);

    // Seed Daily Sales across 2 categories and 4 dates
    await pool.query(`
      INSERT INTO daily_sales_analytics (category, sale_date, revenue, units_sold) VALUES
        ('Electronics', '2026-10-01', 5400.00, 12),
        ('Electronics', '2026-10-02', 7200.00, 15),
        ('Electronics', '2026-10-03', 4800.00, 10),
        ('Electronics', '2026-10-04', 9600.00, 21),
        ('Furniture',   '2026-10-01', 3200.00, 5),
        ('Furniture',   '2026-10-02', 3200.00, 5),
        ('Furniture',   '2026-10-03', 4100.00, 7),
        ('Furniture',   '2026-10-04', 5900.00, 9);
    `);

    console.log('Setup: Populated realistic hierarchy and time-series sales records.\n');

    // -------------------------------------------------------------
    // Task 1: Window Functions (ROW_NUMBER, DENSE_RANK, Running Sum)
    // -------------------------------------------------------------
    console.log('Task 1: Advanced Window Functions (Partitioning, Cumulative Totals & Ranks)\n');
    console.log('Problem: In an analytics dashboard, calculate:');
    console.log('  1. Running revenue total across days per category');
    console.log('  2. Rank of sales days within each category\n');

    const windowRes = await pool.query(`
      SELECT 
        category,
        sale_date,
        revenue,
        -- Running cumulative revenue within category
        SUM(revenue) OVER (
          PARTITION BY category 
          ORDER BY sale_date 
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS cumulative_revenue,
        -- Rank sales performance within each category
        DENSE_RANK() OVER (
          PARTITION BY category 
          ORDER BY revenue DESC
        ) AS sales_rank
      FROM daily_sales_analytics
      ORDER BY category, sale_date;
    `);

    console.table(
      windowRes.rows.map((r) => ({
        Category: r.category,
        Date: r.sale_date.toISOString().split('T')[0],
        Revenue: `$${Number(r.revenue).toFixed(2)}`,
        'Cumulative Rev': `$${Number(r.cumulative_revenue).toFixed(2)}`,
        Rank: r.sales_rank,
      })),
    );
    console.log('✅ Window functions computed running aggregates without collapsing rows!\n');

    // -------------------------------------------------------------
    // Task 2: LAG / LEAD for Day-over-Day Growth Delta
    // -------------------------------------------------------------
    console.log('Task 2: LAG / LEAD Functions for Day-over-Day Revenue Deltas\n');

    const lagRes = await pool.query(`
      SELECT 
        category,
        sale_date,
        revenue,
        LAG(revenue, 1) OVER (
          PARTITION BY category 
          ORDER BY sale_date
        ) AS prev_day_revenue,
        ROUND(
          ((revenue - LAG(revenue, 1) OVER (PARTITION BY category ORDER BY sale_date)) / 
           NULLIF(LAG(revenue, 1) OVER (PARTITION BY category ORDER BY sale_date), 0)) * 100, 
          2
        ) AS dod_growth_pct
      FROM daily_sales_analytics
      ORDER BY category, sale_date;
    `);

    console.table(
      lagRes.rows.map((r) => ({
        Category: r.category,
        Date: r.sale_date.toISOString().split('T')[0],
        Today: `$${Number(r.revenue).toFixed(2)}`,
        Yesterday: r.prev_day_revenue ? `$${Number(r.prev_day_revenue).toFixed(2)}` : 'N/A',
        'Growth %': r.dod_growth_pct !== null ? `${r.dod_growth_pct}%` : 'Baseline',
      })),
    );
    console.log('✅ LAG accessed previous row in partition without expensive self-joins!\n');

    // -------------------------------------------------------------
    // Task 3: Recursive CTE (Tree Traversal & Level Calculation)
    // -------------------------------------------------------------
    console.log('Task 3: Recursive CTE — Hierarchical Tree Traversal\n');
    console.log('Problem: Find all direct and indirect reports of Alice (CTO) with depth level and path:\n');

    const recursiveRes = await pool.query(`
      WITH RECURSIVE OrgChart AS (
        -- Anchor member: The root leader (Alice)
        SELECT 
          id, 
          name, 
          manager_id, 
          department, 
          1 AS depth_level,
          name::text AS path
        FROM employee_hierarchy
        WHERE manager_id IS NULL

        UNION ALL

        -- Recursive member: Find subordinates who report to anyone in the previous tier
        SELECT 
          e.id, 
          e.name, 
          e.manager_id, 
          e.department, 
          o.depth_level + 1,
          o.path || ' -> ' || e.name
        FROM employee_hierarchy e
        INNER JOIN OrgChart o ON e.manager_id = o.id
      )
      SELECT depth_level, name, department, path
      FROM OrgChart
      ORDER BY depth_level, id;
    `);

    console.table(
      recursiveRes.rows.map((r) => ({
        Depth: r.depth_level,
        Employee: r.name,
        Department: r.department,
        'Reporting Chain': r.path,
      })),
    );
    console.log('✅ Recursive CTE resolved arbitrary-depth tree in a single database query!\n');

    // -------------------------------------------------------------
    // Staff/Principal Interview Questions & Answers
    // -------------------------------------------------------------
    console.log('═'.repeat(70));
    console.log('📚 Senior / Principal Architect Interview Prep');
    console.log('═'.repeat(70));
    console.log(`
Q: "What is the difference between GROUP BY and Window Functions?"
A: "GROUP BY collapses multiple rows into a single summary row, discarding original row
   identities. Window functions (OVER clause) perform calculations across a partitioned set
   of rows while PRESERVING each individual row's identity in the result set."

Q: "When would an ORM fail at window functions or recursive queries?"
A: "Standard ORM query builders (e.g. Prisma, TypeORM, Hibernate) are designed around 1:1 entity
   relations. They cannot express recursive graph traversals (WITH RECURSIVE) or arbitrary
   window framing (ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) without falling back
   to raw SQL escape hatches ($queryRaw)."

Q: "What are the performance implications of Recursive CTEs?"
A: "Recursive CTEs execute iteratively in memory. If the graph contains cycles, the query will
   loop infinitely unless cycle detection (e.g., using an array of visited IDs) is implemented
   or max_recursive_iterations / statement_timeout is configured."
`);

  } catch (error: any) {
    console.error('❌ Error in Exercise 12:', error?.message);
    throw error;
  }
}

if (require.main === module) {
  runSqlFundamentalsExercise()
    .then(() => pool.end())
    .catch(() => pool.end());
}
