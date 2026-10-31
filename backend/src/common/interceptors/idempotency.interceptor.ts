import { createHash } from 'crypto';
import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, concatMap, map } from 'rxjs/operators';
import {
  IDEMPOTENCY_REPOSITORY_TOKEN,
  IIdempotencyRepository,
} from '../repositories/idempotency.repository.interface';

const IDEMPOTENCY_HEADER = 'idempotency-key';
const MINIMUM_IDEMPOTENCY_KEY_LENGTH = 16;
const MAXIMUM_IDEMPOTENCY_KEY_LENGTH = 255;
const IDEMPOTENCY_TTL_HOURS = 24;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const IDEMPOTENCY_TTL_MILLISECONDS =
  IDEMPOTENCY_TTL_HOURS *
  MINUTES_PER_HOUR *
  SECONDS_PER_MINUTE *
  MILLISECONDS_PER_SECOND;

interface AuthenticatedPaymentRequest extends Request<
  Record<string, string>,
  unknown,
  unknown
> {
  user?: { id?: number | string };
}

/**
 * Claims payment requests atomically and replays successful responses for retries.
 *
 * @throws BadRequestException when the idempotency key is missing or invalid.
 * @throws UnauthorizedException when the authenticated user is unavailable.
 * @throws ConflictException when a request is processing or the key was reused.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(IDEMPOTENCY_REPOSITORY_TOKEN)
    private readonly idempotencyRepo: IIdempotencyRepository,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedPaymentRequest>();
    const rawKey =
      request.header(IDEMPOTENCY_HEADER) ??
      (request.headers[IDEMPOTENCY_HEADER] as string | undefined) ??
      (request.headers['idempotency-key'] as string | undefined);
    const idempotencyKey =
      typeof rawKey === 'string' ? rawKey.trim() : undefined;

    if (!idempotencyKey || !this.isValidIdempotencyKey(idempotencyKey)) {
      throw new BadRequestException(
        'A valid Idempotency-Key header is required',
      );
    }

    // WHY: Guards run first, so this scope uses the verified identity instead of a shared anonymous bucket.
    const userId = request.user?.id;
    if (userId === undefined) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    const scopedKey = this.createScopedKey(
      String(userId),
      request.method,
      request.path,
      idempotencyKey,
    );
    const requestHash = this.createRequestHash(request.body);
    const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MILLISECONDS);
    const claim = await this.idempotencyRepo.claimKey(
      scopedKey,
      requestHash,
      expiresAt,
    );

    if (claim.kind === 'replay') {
      return of(claim.response.body);
    }

    if (claim.kind === 'conflict') {
      throw new ConflictException(
        'Idempotency-Key is already processing or belongs to a different request',
      );
    }

    return next.handle().pipe(
      concatMap((body: unknown) =>
        from(
          this.idempotencyRepo.completeKey(scopedKey, requestHash, {
            body,
          }),
        ).pipe(map(() => body)),
      ),
      catchError((error: unknown) =>
        from(this.idempotencyRepo.failKey(scopedKey, requestHash)).pipe(
          catchError(() => of(undefined)),
          concatMap(() => throwError(() => error)),
        ),
      ),
    );
  }

  private isValidIdempotencyKey(key: string): boolean {
    return (
      key.length >= MINIMUM_IDEMPOTENCY_KEY_LENGTH &&
      key.length <= MAXIMUM_IDEMPOTENCY_KEY_LENGTH
    );
  }

  private createScopedKey(
    userId: string,
    method: string,
    path: string,
    clientKey: string,
  ): string {
    const scope = JSON.stringify([userId, method, path, clientKey]);
    return createHash('sha256').update(scope).digest('hex');
  }

  private createRequestHash(body: unknown): string {
    const serializedBody = JSON.stringify(body ?? null) ?? 'null';
    return createHash('sha256').update(serializedBody).digest('hex');
  }
}
