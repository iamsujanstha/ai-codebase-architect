import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const testDatabaseUrl = process.env.TEST_POSTGRES_URL;
const postgresIntegrationTest = testDatabaseUrl ? it : it.skip;

describe('repository schema migration', () => {
  postgresIntegrationTest(
    'adds repository columns and preserves inactive user state',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl });
      const migrationPath = path.join(
        __dirname,
        'migrations',
        '003-align-repository-schema.sql',
      );
      const migrationSql = fs.readFileSync(migrationPath, 'utf8');

      await client.connect();

      try {
        await client.query('BEGIN');
        try {
          await client.query(`
            CREATE TEMP TABLE users (
              id INTEGER PRIMARY KEY,
              is_active BOOLEAN NOT NULL
            );
            CREATE TEMP TABLE products (id INTEGER PRIMARY KEY);
            INSERT INTO users (id, is_active) VALUES (1, true), (2, false);
            INSERT INTO products (id) VALUES (1);
          `);
          await client.query(migrationSql);

          const users = await client.query<{ status: string }>(
            'SELECT status FROM users ORDER BY is_active DESC;',
          );
          const products = await client.query<{
            sku: string | null;
            status: string;
            deleted_at: Date | null;
          }>('SELECT sku, status, deleted_at FROM products;');

          expect(users.rows.map((user) => user.status)).toEqual([
            'active',
            'suspended',
          ]);
          expect(products.rows[0]).toEqual({
            sku: null,
            status: 'active',
            deleted_at: null,
          });
        } finally {
          await client.query('ROLLBACK');
        }
      } finally {
        await client.end();
      }
    },
  );
});
