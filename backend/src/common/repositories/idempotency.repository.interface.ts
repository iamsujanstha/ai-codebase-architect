/** HTTP response data persisted so a retry can receive the original result. */
export interface CachedIdempotencyResponse {
  body: unknown;
}

/** Result of claiming a scoped request key before its side effects begin. */
export type IdempotencyClaim =
  | { kind: 'claimed' }
  | { kind: 'replay'; response: CachedIdempotencyResponse }
  | { kind: 'conflict' };

export interface IIdempotencyRepository {
  /**
   * Atomically claims an absent or expired key, or returns its completed response.
   *
   * @throws A repository error when the database cannot persist or read the claim.
   */
  claimKey(
    key: string,
    requestHash: string,
    expiresAt: Date,
  ): Promise<IdempotencyClaim>;
  /** Persists the successful HTTP response for a claimed request. */
  completeKey(
    key: string,
    requestHash: string,
    response: CachedIdempotencyResponse,
  ): Promise<void>;
  /** Marks a failed or uncertain request so the same key cannot repeat side effects. */
  failKey(key: string, requestHash: string): Promise<void>;
}

export const IDEMPOTENCY_REPOSITORY_TOKEN = Symbol('IIdempotencyRepository');
