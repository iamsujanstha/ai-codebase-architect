const MINIMUM_JWT_SECRET_LENGTH = 32;

/**
 * Returns a JWT secret suitable for signing and verifying tokens.
 *
 * @param value The secret supplied through `JWT_SECRET`.
 * @throws Error when the secret is missing or shorter than 32 characters.
 */
export function getRequiredJwtSecret(value: string | undefined): string {
  if (!value || value.length < MINIMUM_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET must contain at least ${MINIMUM_JWT_SECRET_LENGTH} characters`,
    );
  }

  return value;
}
