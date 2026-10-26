#!/usr/bin/env ts-node
/**
 * Production-Grade PostgreSQL Migration Runner
 * Tracks applied migrations in a schema_migrations table so migrations run idempotently.
 */

import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const connectionString =
  process.env.POSTGRES_URL ||
  'postgresql://neondb_owner:npg_HkO0lvFZzJ1u@ep-super-rice-b34nlx0w-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

async function runMigration() {
  const client = new Client({
    connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected successfully!\n');

    // 1. Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Fetch already applied migrations
    const appliedRes = await client.query<{ version: string }>(
      'SELECT version FROM schema_migrations;',
    );
    const appliedSet = new Set(appliedRes.rows.map((r) => r.version));

    // Special bootstrap check: If 001-initial-schema is not recorded but 'users' table exists, mark 001 as applied
    const usersTableCheck = await client.query(`
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users';
    `);
    if (usersTableCheck.rows.length > 0 && !appliedSet.has('001-initial-schema.sql')) {
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING;',
        ['001-initial-schema.sql'],
      );
      appliedSet.add('001-initial-schema.sql');
    }

    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    console.log(`📋 Found ${migrationFiles.length} migration(s):`);

    for (const file of migrationFiles) {
      if (appliedSet.has(file)) {
        console.log(`   ⏭️  Already applied: ${file}`);
        continue;
      }

      console.log(`   ⏳ Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');

      try {
        await client.query('BEGIN');
        
        // Split statements by semicolon while ignoring comments
        const cleanedSql = sql
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n');

        const statements = cleanedSql
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const stmt of statements) {
          console.log(`   🔹 Running: ${stmt.substring(0, 70)}...`);
          await client.query(stmt);
        }

        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1);',
          [file],
        );
        await client.query('COMMIT');
        console.log(`   ✅ Successfully applied: ${file}\n`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    // Verify active tables
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    console.log('\n📊 Active public tables:');
    result.rows.forEach((row) => {
      console.log(`   ✓ ${row.tablename}`);
    });

    console.log('\n🎉 PostgreSQL migrations verified & up to date!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
