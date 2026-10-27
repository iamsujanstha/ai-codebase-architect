import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { lastValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import type { IIdempotencyRepository } from '../repositories/idempotency.repository.interface';

describe('IdempotencyInterceptor', () => {
  let repository: jest.Mocked<IIdempotencyRepository>;
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    repository = {
      claimKey: jest.fn(),
      completeKey: jest.fn(),
      failKey: jest.fn(),
    };
    interceptor = new IdempotencyInterceptor(repository);
  });

  it('claims before invoking the handler and stores the successful response', async () => {
    const body = { checkoutUrl: 'https://pay.test' };
    repository.claimKey.mockResolvedValue({ kind: 'claimed' });
    repository.completeKey.mockResolvedValue(undefined);
    const { context } = createContext(42, body);
    const next: CallHandler = { handle: () => of(body) };

    const result = await lastValueFrom(
      await interceptor.intercept(context, next),
    );

    expect(result).toBe(body);
    expect(repository.claimKey).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Date),
    );
    expect(repository.completeKey).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { body },
    );
  });

  it('replays a cached response without invoking the handler', async () => {
    const cachedResponse = {
      body: { checkoutUrl: 'https://pay.test' },
    };
    repository.claimKey.mockResolvedValue({
      kind: 'replay',
      response: cachedResponse,
    });
    const { context } = createContext(42, {});
    const handle = jest.fn(() => of({}));

    const result = await lastValueFrom(
      await interceptor.intercept(context, { handle }),
    );

    expect(result).toEqual(cachedResponse.body);
    expect(handle).not.toHaveBeenCalled();
  });

  it('rejects concurrent requests before invoking the handler', async () => {
    repository.claimKey.mockResolvedValue({ kind: 'conflict' });
    const { context } = createContext(42, {});
    const handle = jest.fn(() => of({}));

    await expect(
      interceptor.intercept(context, { handle }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(handle).not.toHaveBeenCalled();
  });

  it('requires a valid idempotency key', async () => {
    const { context } = createContext(42, {}, null);

    await expect(
      interceptor.intercept(context, { handle: () => of({}) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes the same client key to each authenticated user', async () => {
    repository.claimKey.mockResolvedValue({ kind: 'claimed' });
    repository.completeKey.mockResolvedValue(undefined);
    const next: CallHandler = { handle: () => of({}) };
    const firstRequest = createContext(42, {}).context;
    const secondRequest = createContext(43, {}).context;

    await interceptor.intercept(firstRequest, next);
    await interceptor.intercept(secondRequest, next);

    const firstScopedKey = repository.claimKey.mock.calls[0][0];
    const secondScopedKey = repository.claimKey.mock.calls[1][0];
    expect(firstScopedKey).not.toBe(secondScopedKey);
  });
});

function createContext(
  userId: number,
  body: unknown,
  key: string | null = 'checkout-request-key-001',
): { context: ExecutionContext } {
  const request = {
    header: jest.fn().mockReturnValue(key),
    user: { id: userId },
    method: 'POST',
    path: '/payments/stripe/checkout-session',
    body,
  } as unknown as Request;
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context };
}
