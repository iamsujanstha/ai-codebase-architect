import { Client } from 'pg';

/**
 * Applies one migration and records its version in the same transaction.
 *
 * @param client Connected PostgreSQL client that owns the transaction.
 * @param version Migration filename recorded after its SQL succeeds.
 * @param migrationSql Complete SQL file contents, sent as one command.
 * @throws The original PostgreSQL error after rolling back the transaction.
 */
export async function applyMigration(
  client: Client,
  version: string,
  migrationSql: string,
): Promise<void> {
  await client.query('BEGIN');

  try {
    await client.query(migrationSql);
    await client.query(
      'INSERT INTO schema_migrations (version) VALUES ($1);',
      [version],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
