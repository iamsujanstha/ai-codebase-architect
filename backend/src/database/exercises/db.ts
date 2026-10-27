import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getRequiredPostgresUrl } from '../database-connection';

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

export const connectionString = getRequiredPostgresUrl(
  process.env.POSTGRES_URL,
);

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
