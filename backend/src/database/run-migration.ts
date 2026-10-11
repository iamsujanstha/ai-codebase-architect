#!/usr/bin/env ts-node
/**
 * PostgreSQL Migration Runner
 * Runs the initial schema migration to create all tables
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const connectionString = process.env.POSTGRES_URL || 
  'postgresql://neondb_owner:npg_HkO0lvFZzJ1u@ep-super-rice-b34nlx0w-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function runMigration() {
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false, // Neon uses self-signed certs
    },
  });

  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully!');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '001-initial-schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    console.log('\n📝 Running migration: 001-initial-schema.sql');
    console.log('⏳ Creating tables, indexes, and sample data...\n');

    // Execute migration
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!\n');

    // Verify tables created
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    console.log('📊 Tables created:');
    result.rows.forEach((row) => {
      console.log(`   ✓ ${row.tablename}`);
    });

    // Count rows in each table
    console.log('\n📈 Sample data:');
    const tables = result.rows.map(r => r.tablename);
    for (const table of tables) {
      const countResult = await client.query(`SELECT COUNT(*) FROM ${table}`);
      const count = countResult.rows[0].count;
      console.log(`   ${table}: ${count} rows`);
    }

    // Verify indexes
    const indexResult = await client.query(`
      SELECT tablename, COUNT(*) as index_count
      FROM pg_indexes
      WHERE schemaname = 'public'
      GROUP BY tablename
      ORDER BY tablename;
    `);

    console.log('\n🔍 Indexes created:');
    indexResult.rows.forEach((row) => {
      console.log(`   ${row.tablename}: ${row.index_count} indexes`);
    });

    console.log('\n🎉 PostgreSQL setup complete!');
    console.log('\n📚 Next steps:');
    console.log('   1. Practice SQL queries (see POSTGRES_SETUP_COMMANDS.md)');
    console.log('   2. Learn indexes with EXPLAIN ANALYZE');
    console.log('   3. Test transactions and isolation levels');
    console.log('   4. Start dual-write implementation\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('✅ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
