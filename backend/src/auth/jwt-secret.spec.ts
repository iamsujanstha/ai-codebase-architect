import { getRequiredJwtSecret } from './jwt-secret';

describe('getRequiredJwtSecret', () => {
  it('returns a configured secret that meets the minimum length', () => {
    const secret = 'a'.repeat(32);

    expect(getRequiredJwtSecret(secret)).toBe(secret);
  });

  it('rejects a missing secret', () => {
    expect(() => getRequiredJwtSecret(undefined)).toThrow(
      'JWT_SECRET must contain at least 32 characters',
    );
  });

  it('rejects a secret shorter than the minimum length', () => {
    expect(() => getRequiredJwtSecret('short')).toThrow(
      'JWT_SECRET must contain at least 32 characters',
    );
  });
});
