import {
  getPostgresSslConfig,
  getRequiredPostgresUrl,
} from './database-connection';

describe('getRequiredPostgresUrl', () => {
  it('returns the configured connection string', () => {
    const connectionString = 'postgresql://user:password@localhost/database';

    expect(getRequiredPostgresUrl(connectionString)).toBe(connectionString);
  });

  it('fails closed when no connection string is configured', () => {
    expect(() => getRequiredPostgresUrl(undefined)).toThrow(
      'POSTGRES_URL environment variable is required',
    );
  });

  it('fails closed when the connection string is empty', () => {
    expect(() => getRequiredPostgresUrl('')).toThrow(
      'POSTGRES_URL environment variable is required',
    );
  });
});

describe('getPostgresSslConfig', () => {
  it('requires certificate-verified TLS by default', () => {
    expect(getPostgresSslConfig(undefined)).toEqual({
      rejectUnauthorized: true,
    });
  });

  it('allows TLS to be disabled for disposable local databases', () => {
    expect(getPostgresSslConfig('false')).toBe(false);
  });

  it('rejects ambiguous SSL settings', () => {
    expect(() => getPostgresSslConfig('sometimes')).toThrow(
      'POSTGRES_SSL must be either true or false',
    );
  });
});
