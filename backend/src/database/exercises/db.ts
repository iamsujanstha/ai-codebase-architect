import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export const connectionString =
  process.env.POSTGRES_URL ||
  'postgresql://neondb_owner:npg_HkO0lvFZzJ1u@ep-super-rice-b34nlx0w-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

export const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export const getPool = () => pool;
