import { Client } from 'pg';
import { applyMigration } from './migration-executor';

describe('applyMigration', () => {
  it('sends the complete SQL file as one command before recording the version', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const client = { query } as unknown as Client;
    const migrationSql = `
      CREATE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;

    await applyMigration(client, '001-initial-schema.sql', migrationSql);

    expect(query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(query).toHaveBeenNthCalledWith(2, migrationSql);
    expect(query).toHaveBeenNthCalledWith(
      3,
      'INSERT INTO schema_migrations (version) VALUES ($1);',
      ['001-initial-schema.sql'],
    );
    expect(query).toHaveBeenNthCalledWith(4, 'COMMIT');
  });

  it('rolls back and rethrows when the migration SQL fails', async () => {
    const migrationError = new Error('migration failed');
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(migrationError)
      .mockResolvedValueOnce({ rows: [] });
    const client = { query } as unknown as Client;

    await expect(
      applyMigration(client, '001-initial-schema.sql', 'INVALID SQL;'),
    ).rejects.toBe(migrationError);

    expect(query).toHaveBeenNthCalledWith(3, 'ROLLBACK');
  });
});
