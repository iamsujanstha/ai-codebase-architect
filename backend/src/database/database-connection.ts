/**
 * Returns the configured PostgreSQL connection string.
 *
 * @param value The value supplied through `POSTGRES_URL`.
 * @throws Error when the variable is missing or empty.
 */
export function getRequiredPostgresUrl(value: string | undefined): string {
  if (!value) {
    throw new Error('POSTGRES_URL environment variable is required');
  }

  return value;
}

/**
 * Selects verified TLS by default; disabling TLS is intended for disposable local databases.
 * @param value The optional `POSTGRES_SSL` setting.
 * @throws Error when the setting is neither `true` nor `false`.
 */
export function getPostgresSslConfig(
  value: string | undefined,
): false | { rejectUnauthorized: true } {
  const normalizedValue = value?.trim().toLowerCase();
  if (!normalizedValue || normalizedValue === 'true') {
    return { rejectUnauthorized: true };
  }
  if (normalizedValue === 'false') {
    return false;
  }

  throw new Error('POSTGRES_SSL must be either true or false');
}
