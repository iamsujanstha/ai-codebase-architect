import { Logger } from '@nestjs/common';

/**
 * Retry Utility with Exponential Backoff
 * 
 * PHASE 2 CRITICAL: Handle transient failures in distributed systems
 * 
 * PROBLEM:
 * External service returns temporary error (503 Service Unavailable)
 *   ↓
 * Without retry: Request fails, user sees error
 *   ↓
 * Service might have recovered 100ms later
 *   ↓
 * Bad user experience
 * 
 * SOLUTION:
 * Retry the request with increasing delays
 *   ↓
 * Wait: 100ms → 200ms → 400ms → 800ms
 *   ↓
 * Service recovers after 2nd retry
 *   ↓
 * User's request succeeds (transparent recovery)
 * 
 * EXPONENTIAL BACKOFF:
 * Why not fixed delay (e.g., retry every 1 second)?
 * 
 * Fixed Delay Problem:
 * - Service is overloaded (500 req/sec, capacity 100 req/sec)
 * - All clients retry every 1 second
 * - All retries hit at same time
 * - Makes overload WORSE
 * - "Thundering herd" problem
 * 
 * Exponential Backoff:
 * - First retry: 100ms
 * - Second retry: 200ms
 * - Third retry: 400ms
 * - Spreads out retries
 * - Gives service time to recover
 * - Reduces load (not all clients retry at once)
 * 
 * JITTER:
 * - Randomize delay slightly (±25%)
 * - Prevents synchronized retries
 * - Example: 200ms becomes 150-250ms
 * 
 * PRODUCTION SCENARIO:
 * 
 * Without Retry:
 * - Stripe API hiccups (1 second downtime)
 * - 100 payment requests fail
 * - Users see error, abandon cart
 * - Lost revenue
 * 
 * With Retry:
 * - Stripe API hiccups
 * - First request fails
 * - Retry after 100ms: Success!
 * - User never notices
 * - Revenue saved
 * 
 * WHEN TO RETRY:
 * 
 * ✅ Retry Safe (Idempotent):
 * - GET requests
 * - POST with idempotency key
 * - Network timeouts
 * - 503 Service Unavailable
 * - 429 Too Many Requests
 * - Connection refused
 * 
 * ❌ Do NOT Retry:
 * - 400 Bad Request (client error, won't fix itself)
 * - 401 Unauthorized (need valid credentials)
 * - 403 Forbidden (no permission)
 * - 404 Not Found (resource doesn't exist)
 * - 422 Validation Error (invalid data)
 * 
 * COMBINING WITH CIRCUIT BREAKER:
 * 
 * Retry: For transient errors (quick recovery)
 * Circuit Breaker: For sustained outages (stop trying)
 * 
 * Flow:
 * Request fails
 *   ↓
 * Retry 3 times with backoff
 *   ↓
 * If still failing: Circuit breaker counts as 1 failure
 *   ↓
 * After 5 failures: Circuit opens
 *   ↓
 * Stop trying (fail fast)
 * 
 * INTERVIEW POINTS:
 * 
 * Q: "How do you handle transient failures?"
 * A: Retry with exponential backoff. For example, if Stripe returns 503, we retry
 *    after 100ms, then 200ms, then 400ms. This handles brief outages without failing
 *    the user's request. We only retry idempotent operations and retryable errors
 *    (503, 429, network timeout). Client errors (400, 404) are never retried.
 * 
 * Q: "Why exponential backoff instead of fixed delay?"
 * A: Fixed delay causes thundering herd—if 1000 clients retry every 1 second,
 *    they all retry at the same time, overwhelming the recovering service.
 *    Exponential backoff spreads retries out: 100ms, 200ms, 400ms, 800ms.
 *    We also add jitter (±25% randomization) to prevent synchronized retries.
 * 
 * Q: "What's the difference between retry and circuit breaker?"
 * A: Retry handles transient errors (service hiccups, recovers in <1 second).
 *    Circuit breaker handles sustained outages (service down for minutes).
 *    We combine them: retry 3 times, if all fail then count as circuit breaker
 *    failure. After 5 circuit breaker failures, stop trying (fail fast).
 * 
 * TRADEOFFS:
 * - ✅ Transparent recovery from transient failures
 * - ✅ Better user experience (fewer visible errors)
 * - ✅ Automatic adaptation to service load
 * - ❌ Increased latency (retries add delay)
 * - ❌ More complex error handling
 * - ❌ Risk of duplicate requests (if not idempotent)
 */

export interface RetryOptions {
  /**
   * Maximum number of retry attempts
   * Default: 3
   * 
   * Too few: Miss recovery opportunities
   * Too many: Waste time on persistent failures
   * 
   * Recommendation:
   * - Fast operations (<100ms): 3 retries
   * - Slow operations (>1s): 2 retries
   * - Critical operations: 5 retries
   */
  maxRetries?: number;

  /**
   * Initial delay before first retry (milliseconds)
   * Default: 100
   * 
   * Sequence with initialDelay=100:
   * - Retry 1: 100ms
   * - Retry 2: 200ms
   * - Retry 3: 400ms
   * - Retry 4: 800ms
   */
  initialDelay?: number;

  /**
   * Maximum delay between retries (milliseconds)
   * Default: 10000 (10 seconds)
   * 
   * Caps exponential growth
   * Without cap: 100 → 200 → 400 → 800 → 1600 → 3200 → 6400 → 12800ms
   * With cap:    100 → 200 → 400 → 800 → 1600 → 3200 → 6400 → 10000ms
   */
  maxDelay?: number;

  /**
   * Multiplier for exponential backoff
   * Default: 2
   * 
   * - 2 = exponential doubling (100 → 200 → 400)
   * - 1.5 = slower growth (100 → 150 → 225)
   * - 3 = aggressive growth (100 → 300 → 900)
   */
  backoffMultiplier?: number;

  /**
   * Add randomization to delay (±25% by default)
   * Default: true
   * 
   * Prevents synchronized retries (thundering herd)
   * Example: 200ms becomes 150-250ms
   */
  jitter?: boolean;

  /**
   * Function to determine if error is retryable
   * Default: Retry network errors and 5xx status codes
   * 
   * @param error The error that occurred
   * @param attemptNumber Current attempt number (1-based)
   * @returns true if should retry, false otherwise
   */
  shouldRetry?: (error: any, attemptNumber: number) => boolean;

  /**
   * Logger name for structured logging
   * Default: 'RetryUtil'
   */
  loggerName?: string;

  /**
   * Context for logging (e.g., 'stripe-api', 'ai-service')
   */
  context?: string;
}

/**
 * Default retry policy: Retry network errors and server errors
 */
function defaultShouldRetry(error: any, attemptNumber: number): boolean {
  // Always respect max retries (checked elsewhere)
  
  // Network errors (connection refused, timeout)
  if (
    error.code === 'ECONNREFUSED' ||
    error.code === 'ECONNRESET' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNABORTED'
  ) {
    return true;
  }

  // HTTP status codes
  if (error.response?.status) {
    const status = error.response.status;
    
    // Retry server errors (5xx)
    if (status >= 500 && status < 600) {
      return true;
    }
    
    // Retry 429 Too Many Requests (rate limit)
    if (status === 429) {
      return true;
    }
    
    // Retry 408 Request Timeout
    if (status === 408) {
      return true;
    }
    
    // Do NOT retry client errors (4xx except 429, 408)
    // These won't fix themselves with retry
    if (status >= 400 && status < 500) {
      return false;
    }
  }

  // Unknown error type: Don't retry (safer default)
  return false;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
function calculateDelay(
  attemptNumber: number,
  options: Required<Pick<RetryOptions, 'initialDelay' | 'maxDelay' | 'backoffMultiplier' | 'jitter'>>,
): number {
  // Exponential backoff: delay = initialDelay * (multiplier ^ attemptNumber)
  const exponentialDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attemptNumber - 1);
  
  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, options.maxDelay);
  
  // Add jitter (±25% randomization)
  if (options.jitter) {
    const jitterAmount = cappedDelay * 0.25; // 25% of delay
    const randomOffset = (Math.random() - 0.5) * 2 * jitterAmount; // -25% to +25%
    return Math.max(0, cappedDelay + randomOffset);
  }
  
  return cappedDelay;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff
 * 
 * @param fn Function to execute
 * @param options Retry configuration
 * @returns Result of successful execution
 * @throws Last error if all retries exhausted
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const config: Required<RetryOptions> = {
    maxRetries: options.maxRetries ?? 3,
    initialDelay: options.initialDelay ?? 100,
    maxDelay: options.maxDelay ?? 10000,
    backoffMultiplier: options.backoffMultiplier ?? 2,
    jitter: options.jitter ?? true,
    shouldRetry: options.shouldRetry ?? defaultShouldRetry,
    loggerName: options.loggerName ?? 'RetryUtil',
    context: options.context ?? 'operation',
  };

  const logger = new Logger(config.loggerName);
  let lastError: any;
  
  // Try initial attempt + retries
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      // Execute function
      const startTime = Date.now();
      const result = await fn();
      const duration = Date.now() - startTime;
      
      // Success!
      if (attempt > 0) {
        // Log successful retry
        logger.log({
          event: 'retry_success',
          context: config.context,
          attempt,
          totalAttempts: attempt + 1,
          duration,
          message: `Operation succeeded after ${attempt} retries`,
        });
      }
      
      return result;
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      const isLastAttempt = attempt === config.maxRetries;
      const shouldRetry = !isLastAttempt && config.shouldRetry(error, attempt + 1);
      
      if (!shouldRetry) {
        // Don't retry, throw error
        if (isLastAttempt) {
          logger.error({
            event: 'retry_exhausted',
            context: config.context,
            totalAttempts: attempt + 1,
            maxRetries: config.maxRetries,
            error: error instanceof Error ? error.message : String(error),
            message: 'All retry attempts exhausted',
          });
        } else {
          logger.warn({
            event: 'retry_skipped',
            context: config.context,
            attempt,
            reason: 'Error not retryable',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        throw error;
      }
      
      // Calculate delay for next retry
      const delay = calculateDelay(attempt + 1, config);
      
      logger.warn({
        event: 'retry_attempt',
        context: config.context,
        attempt: attempt + 1,
        maxRetries: config.maxRetries,
        nextRetryIn: `${Math.round(delay)}ms`,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Wait before retry
      await sleep(delay);
    }
  }
  
  // Should never reach here (loop always returns or throws)
  throw lastError;
}

/**
 * USAGE EXAMPLES:
 * 
 * 1. SIMPLE RETRY (DEFAULT OPTIONS)
 * 
 * const result = await retryWithBackoff(async () => {
 *   const response = await fetch('https://api.example.com/data');
 *   if (!response.ok) throw new Error(`HTTP ${response.status}`);
 *   return response.json();
 * });
 * 
 * // Retries: 100ms → 200ms → 400ms
 * 
 * 2. CUSTOM RETRY POLICY
 * 
 * const result = await retryWithBackoff(
 *   async () => await stripeClient.charges.create({...}),
 *   {
 *     maxRetries: 5,
 *     initialDelay: 200,
 *     maxDelay: 5000,
 *     context: 'stripe-charge',
 *     shouldRetry: (error, attempt) => {
 *       // Retry on network errors and 5xx
 *       if (error.type === 'StripeConnectionError') return true;
 *       if (error.statusCode >= 500) return true;
 *       // Don't retry card errors (user needs to fix)
 *       if (error.type === 'StripeCardError') return false;
 *       return false;
 *     },
 *   }
 * );
 * 
 * 3. WITH CIRCUIT BREAKER
 * 
 * const stripeCircuit = new CircuitBreaker({
 *   name: 'stripe-api',
 *   failureThreshold: 5,
 *   resetTimeout: 60000,
 * });
 * 
 * const charge = await stripeCircuit.execute(async () => {
 *   return await retryWithBackoff(
 *     async () => await stripeClient.charges.create({...}),
 *     { maxRetries: 3, context: 'stripe-charge' }
 *   );
 * });
 * 
 * // Flow:
 * // 1. Circuit breaker checks if circuit is open
 * // 2. If closed, execute function with retry
 * // 3. If all retries fail, circuit breaker counts as 1 failure
 * // 4. After 5 failures, circuit opens
 * 
 * 4. DATABASE QUERY WITH RETRY
 * 
 * const user = await retryWithBackoff(
 *   async () => {
 *     const user = await User.findById(id);
 *     if (!user) throw new NotFoundException('User not found');
 *     return user;
 *   },
 *   {
 *     maxRetries: 3,
 *     initialDelay: 100,
 *     context: 'user-query',
 *     shouldRetry: (error, attempt) => {
 *       // Retry on connection errors
 *       if (error.name === 'MongoNetworkError') return true;
 *       // Don't retry not found (won't fix itself)
 *       if (error instanceof NotFoundException) return false;
 *       return false;
 *     },
 *   }
 * );
 * 
 * 5. AI SERVICE WITH TIMEOUT AND RETRY
 * 
 * const aiResponse = await retryWithBackoff(
 *   async () => {
 *     const response = await axios.post(
 *       'http://ai-service:8000/generate',
 *       { prompt },
 *       {
 *         timeout: 30000, // 30 second timeout
 *         signal: AbortSignal.timeout(30000),
 *       }
 *     );
 *     return response.data;
 *   },
 *   {
 *     maxRetries: 2, // AI is slow, fewer retries
 *     initialDelay: 500, // Longer initial delay
 *     maxDelay: 2000,
 *     context: 'ai-generation',
 *   }
 * );
 * 
 * MONITORING:
 * 
 * // Logs on retry:
 * {
 *   "event": "retry_attempt",
 *   "context": "stripe-charge",
 *   "attempt": 1,
 *   "maxRetries": 3,
 *   "nextRetryIn": "100ms",
 *   "error": "Request timeout"
 * }
 * 
 * // Logs on success after retry:
 * {
 *   "event": "retry_success",
 *   "context": "stripe-charge",
 *   "attempt": 2,
 *   "totalAttempts": 3,
 *   "duration": 245,
 *   "message": "Operation succeeded after 2 retries"
 * }
 * 
 * // Logs on exhausted retries:
 * {
 *   "event": "retry_exhausted",
 *   "context": "stripe-charge",
 *   "totalAttempts": 4,
 *   "maxRetries": 3,
 *   "error": "Connection refused",
 *   "message": "All retry attempts exhausted"
 * }
 * 
 * ALERTING:
 * 
 * // Alert if retry rate > 10%
 * if (retry_success_count / total_requests > 0.1) {
 *   alert('High retry rate detected - service may be unstable');
 * }
 * 
 * // Alert if retries are being exhausted
 * if (retry_exhausted_count > 10 in last 5 minutes) {
 *   alert('Service failures - retries not helping');
 * }
 * 
 * TESTING:
 * 
 * describe('Retry Utility', () => {
 *   it('retries on network error', async () => {
 *     let attempts = 0;
 *     const fn = async () => {
 *       attempts++;
 *       if (attempts < 3) throw { code: 'ECONNREFUSED' };
 *       return 'success';
 *     };
 *     
 *     const result = await retryWithBackoff(fn, { maxRetries: 3 });
 *     expect(result).toBe('success');
 *     expect(attempts).toBe(3);
 *   });
 *   
 *   it('does not retry client errors', async () => {
 *     let attempts = 0;
 *     const fn = async () => {
 *       attempts++;
 *       throw { response: { status: 400 } };
 *     };
 *     
 *     await expect(retryWithBackoff(fn, { maxRetries: 3 })).rejects.toThrow();
 *     expect(attempts).toBe(1); // No retries
 *   });
 * });
 * 
 * PRODUCTION BEST PRACTICES:
 * 
 * 1. Combine with idempotency:
 *    - Only retry idempotent operations
 *    - Use idempotency keys for POST requests
 *    - Safe to retry: GET, PUT with idempotency key
 *    - Unsafe to retry: POST without idempotency key
 * 
 * 2. Tune retry count per operation:
 *    - Fast operations (< 100ms): 3-5 retries
 *    - Slow operations (> 1s): 2-3 retries
 *    - Very expensive (AI): 1-2 retries
 * 
 * 3. Set reasonable timeouts:
 *    - Request timeout < retry timeout
 *    - Example: 30s request timeout, 3 retries = 90s total
 *    - Don't let retries run forever
 * 
 * 4. Monitor retry metrics:
 *    - Track retry rate by service
 *    - Alert on high retry rate (> 10%)
 *    - Alert on exhausted retries
 *    - Dashboard showing retry success rate
 * 
 * 5. Circuit breaker integration:
 *    - Retry handles transient errors
 *    - Circuit breaker handles sustained outages
 *    - Retry → Circuit Breaker → Fail Fast
 */
