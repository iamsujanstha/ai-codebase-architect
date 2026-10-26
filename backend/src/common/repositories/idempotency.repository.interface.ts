export interface IdempotencyRecord {
  key: string;
  status: string;
  response: any;
  expires_at: Date;
  created_at?: Date;
}

export interface IIdempotencyRepository {
  findKey(key: string): Promise<IdempotencyRecord | null>;
  saveKey(
    key: string,
    statusCode: number,
    body: any,
    expiryHours?: number,
  ): Promise<void>;
}

export const IDEMPOTENCY_REPOSITORY_TOKEN = Symbol('IIdempotencyRepository');
