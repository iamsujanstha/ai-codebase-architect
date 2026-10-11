import { Logger } from '@nestjs/common';

/**
 * Circuit Breaker Pattern
 * 
 * PHASE 2 CRITICAL: Prevent cascading failures in distributed systems
 * 
 * PROBLEM:
 * External service goes down (Stripe API, AI service, MongoDB)
 *   ↓
 * Backend keeps trying to call it
 *   ↓
 * Every request waits for timeout (30 seconds)
 *   ↓
 * Request queue builds up
 *   ↓
 * All threads/connections exhausted
 *   ↓
 * Entire system crashes
 * 
 * SOLUTION:
 * Circuit breaker "opens" after N failures
 *   ↓
 * Subsequent requests fail fast (no timeout wait)
 *   ↓
 * System remains responsive
 *   ↓
 * After cooldown, circuit "half-opens" (try one request)
 *   ↓
 * If success: Circuit closes (back to normal)
 *   ↓
 * If failure: Circuit opens again
 * 
 * STATES:
 * 
 * CLOSED (Normal):
 * - All requests go through
 * - Track failures
 * - If failures > threshold: Open circuit
 * 
 * OPEN (Failing):
 * - All requests fail immediately (no timeout)
 * - After cooldown period: Half-open
 * 
 * HALF_OPEN (Testing):
 * - Allow one request through
 * - If success: Close circuit
 * - If failure: Open circuit again
 * 
 * PRODUCTION SCENARIO:
 * 
 * Without Circuit Breaker:
 * - Stripe API goes down at 14:00
 * - Every payment request waits 30 seconds for timeout
 * - 100 users try to pay in 1 minute
 * - 100 × 30s = 3000 seconds of waiting
 * - All connection slots exhausted
 * - System crashes
 * 
 * With Circuit Breaker:
 * - Stripe API goes down at 14:00
 * - First 5 requests fail (threshold = 5)
 * - Circuit opens
 * - Next 95 requests fail immediately with "Service unavailable"
 * - Users see "Payment system temporarily unavailable, try again in 1 minute"
 * - System stays healthy
 * - After 60 seconds, circuit half-opens
 * - If Stripe is back: Circuit closes, payments resume
 * 
 * INTERVIEW POINTS:
 * 
 * Q: "How do you handle external service failures?"
 * A: Circuit breakers. After N consecutive failures, we stop trying and fail fast.
 *    This prevents cascading failures. For example, if Stripe goes down, we don't
 *    want every payment request to wait 30 seconds for timeout—that would exhaust
 *    our connection pool and crash the system. Instead, after 5 failures, we open
 *    the circuit and return errors immediately. After a cooldown (60s), we try again.
 *    This keeps the system responsive during partial outages.
 * 
 * Q: "What's the difference between circuit breaker and retry?"
 * A: Retry: Try the same request again (good for transient failures)
 *    Circuit breaker: Stop trying after N failures (good for sustained outages)
 *    Use both: Retry 3 times with backoff, then open circuit if still failing.
 * 
 * Q: "How do you decide the failure threshold?"
 * A: Balance false positives vs response time. Too low (threshold=1) and transient
 *    errors trigger circuit. Too high (threshold=100) and system suffers before
 *    circuit opens. We use 5-10 for most services (empirical testing in staging).
 * 
 * TRADEOFFS:
 * - ✅ Prevents cascading failures
 * - ✅ Fast failure (no timeout wait)
 * - ✅ Automatic recovery (half-open retry)
 * - ❌ False positives (circuit opens during transient errors)
 * - ❌ Complexity (must tune thresholds)
 * - ❌ User impact (requests fail even if service recovered)
 */

enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject all requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

interface CircuitBreakerOptions {
  /**
   * Number of failures before opening circuit
   * Default: 5
   * 
   * Too low: Transient errors trigger circuit
   * Too high: System suffers before circuit opens
   * 
   * Recommendation:
   * - Critical services (payment): 3
   * - Important services (AI): 5
   * - Non-critical services (email): 10
   */
  failureThreshold: number;

  /**
   * Milliseconds to wait before trying again after circuit opens
   * Default: 60000 (60 seconds)
   * 
   * Too short: Circuit reopens immediately (thrashing)
   * Too long: Service stays down even after recovery
   * 
   * Recommendation:
   * - Fast recovery services (Redis): 10s
   * - Normal services (APIs): 60s
   * - Slow recovery services (database): 120s
   */
  resetTimeout: number;

  /**
   * Service name for logging
   */
  name: string;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private nextAttemptTime: number = 0;
  private logger: Logger;

  constructor(private options: CircuitBreakerOptions) {
    this.logger = new Logger(`CircuitBreaker:${options.name}`);
  }

  /**
   * Execute function with circuit breaker protection
   * 
   * @param fn Function to execute
   * @returns Result of function
   * @throws CircuitBreakerOpenError if circuit is open
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      // Check if cooldown period has passed
      if (Date.now() < this.nextAttemptTime) {
        // Still in cooldown, fail fast
        this.logger.warn({
          event: 'circuit_breaker_open',
          service: this.options.name,
          state: this.state,
          failureCount: this.failureCount,
          nextAttempt: new Date(this.nextAttemptTime).toISOString(),
        });

        throw new CircuitBreakerOpenError(
          `Circuit breaker is OPEN for ${this.options.name}. ` +
            `Service appears to be down. ` +
            `Will retry at ${new Date(this.nextAttemptTime).toISOString()}`,
        );
      }

      // Cooldown passed, transition to HALF_OPEN
      this.logger.log({
        event: 'circuit_breaker_half_open',
        service: this.options.name,
        message: 'Cooldown complete, testing if service recovered',
      });
      this.state = CircuitState.HALF_OPEN;
    }

    try {
      // Execute the function
      const startTime = Date.now();
      const result = await fn();
      const duration = Date.now() - startTime;

      // Success!
      this.onSuccess(duration);
      return result;
    } catch (error) {
      // Failure
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(duration: number): void {
    this.failureCount = 0;
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      // Service recovered, close circuit
      this.logger.log({
        event: 'circuit_breaker_closed',
        service: this.options.name,
        message: 'Service recovered, circuit closed',
        duration,
      });
      this.state = CircuitState.CLOSED;
    }

    // Log periodic success metrics (every 100 successes)
    if (this.successCount % 100 === 0) {
      this.logger.log({
        event: 'circuit_breaker_healthy',
        service: this.options.name,
        state: this.state,
        successCount: this.successCount,
      });
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(error: any): void {
    this.failureCount++;
    this.successCount = 0;

    this.logger.error({
      event: 'circuit_breaker_failure',
      service: this.options.name,
      state: this.state,
      failureCount: this.failureCount,
      threshold: this.options.failureThreshold,
      error: error instanceof Error ? error.message : String(error),
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Service still down, open circuit again
      this.open();
    } else if (this.failureCount >= this.options.failureThreshold) {
      // Reached failure threshold, open circuit
      this.open();
    }
  }

  /**
   * Open the circuit (stop trying, fail fast)
   */
  private open(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.options.resetTimeout;

    this.logger.error({
      event: 'circuit_breaker_opened',
      service: this.options.name,
      failureCount: this.failureCount,
      threshold: this.options.failureThreshold,
      nextAttempt: new Date(this.nextAttemptTime).toISOString(),
      message: `Circuit opened after ${this.failureCount} failures. Will retry in ${this.options.resetTimeout}ms`,
    });
  }

  /**
   * Get current circuit state (for monitoring)
   */
  getState(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    nextAttemptTime: number;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Manually reset circuit (admin operation)
   */
  reset(): void {
    this.logger.log({
      event: 'circuit_breaker_manual_reset',
      service: this.options.name,
    });
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
  }
}

/**
 * Custom error for circuit breaker open state
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * USAGE EXAMPLES:
 * 
 * 1. STRIPE API CALLS
 * 
 * const stripeCircuit = new CircuitBreaker({
 *   name: 'stripe-api',
 *   failureThreshold: 3,
 *   resetTimeout: 60000, // 60 seconds
 * });
 * 
 * async createCheckoutSession() {
 *   try {
 *     return await stripeCircuit.execute(async () => {
 *       return await this.stripeClient.checkout.sessions.create({...});
 *     });
 *   } catch (error) {
 *     if (error instanceof CircuitBreakerOpenError) {
 *       // Circuit is open, return user-friendly error
 *       throw new ServiceUnavailableException(
 *         'Payment system temporarily unavailable. Please try again in 1 minute.'
 *       );
 *     }
 *     throw error;
 *   }
 * }
 * 
 * 2. AI SERVICE CALLS
 * 
 * const aiCircuit = new CircuitBreaker({
 *   name: 'ai-service',
 *   failureThreshold: 5,
 *   resetTimeout: 30000, // 30 seconds
 * });
 * 
 * async generateResponse(prompt: string) {
 *   try {
 *     return await aiCircuit.execute(async () => {
 *       const response = await fetch('http://ai-service:8000/generate', {
 *         method: 'POST',
 *         body: JSON.stringify({ prompt }),
 *         signal: AbortSignal.timeout(30000),
 *       });
 *       if (!response.ok) throw new Error(`AI service error: ${response.status}`);
 *       return response.json();
 *     });
 *   } catch (error) {
 *     if (error instanceof CircuitBreakerOpenError) {
 *       throw new ServiceUnavailableException(
 *         'AI service temporarily unavailable. Please try again shortly.'
 *       );
 *     }
 *     throw error;
 *   }
 * }
 * 
 * 3. DATABASE CALLS (WITH RETRY)
 * 
 * const dbCircuit = new CircuitBreaker({
 *   name: 'mongodb',
 *   failureThreshold: 10,
 *   resetTimeout: 120000, // 2 minutes
 * });
 * 
 * async function findUser(id: string) {
 *   // Combine circuit breaker with retry
 *   return await dbCircuit.execute(async () => {
 *     return await retryWithBackoff(
 *       async () => await User.findById(id),
 *       { maxRetries: 3, initialDelay: 100 }
 *     );
 *   });
 * }
 * 
 * MONITORING:
 * 
 * // Expose circuit breaker state via health endpoint
 * @Get('health/circuits')
 * getCircuitStatus() {
 *   return {
 *     stripe: stripeCircuit.getState(),
 *     ai: aiCircuit.getState(),
 *     database: dbCircuit.getState(),
 *   };
 * }
 * 
 * // Result:
 * {
 *   "stripe": {
 *     "state": "CLOSED",
 *     "failureCount": 0,
 *     "successCount": 1523,
 *     "nextAttemptTime": 0
 *   },
 *   "ai": {
 *     "state": "OPEN",
 *     "failureCount": 5,
 *     "successCount": 0,
 *     "nextAttemptTime": 1696950000
 *   }
 * }
 * 
 * ALERTING:
 * 
 * if (circuit.getState().state === CircuitState.OPEN) {
 *   alert('Circuit breaker open for ${name}! Service is down.');
 * }
 * 
 * TESTING:
 * 
 * describe('Circuit Breaker', () => {
 *   it('opens after threshold failures', async () => {
 *     const circuit = new CircuitBreaker({
 *       name: 'test',
 *       failureThreshold: 3,
 *       resetTimeout: 1000,
 *     });
 *     
 *     const failingFn = async () => { throw new Error('Fail'); };
 *     
 *     // First 3 failures
 *     await expect(circuit.execute(failingFn)).rejects.toThrow();
 *     await expect(circuit.execute(failingFn)).rejects.toThrow();
 *     await expect(circuit.execute(failingFn)).rejects.toThrow();
 *     
 *     // Circuit should now be open
 *     expect(circuit.getState().state).toBe(CircuitState.OPEN);
 *     
 *     // Next request fails fast
 *     await expect(circuit.execute(failingFn))
 *       .rejects.toThrow(CircuitBreakerOpenError);
 *   });
 * });
 * 
 * PRODUCTION BEST PRACTICES:
 * 
 * 1. Different Thresholds Per Service:
 *    - Payment: 3 (fail fast, critical)
 *    - AI: 5 (some transient errors expected)
 *    - Email: 10 (non-critical, can tolerate failures)
 * 
 * 2. Combine with Retries:
 *    - Retry 3 times with exponential backoff
 *    - If all retries fail, count as 1 circuit breaker failure
 *    - This distinguishes transient errors (fixed by retry) from outages
 * 
 * 3. Monitor Circuit State:
 *    - Alert if circuit open for > 5 minutes
 *    - Dashboard showing open circuits
 *    - Track failure rate per service
 * 
 * 4. User-Friendly Errors:
 *    - Don't expose technical details ("circuit breaker open")
 *    - Show: "Service temporarily unavailable, try again in X minutes"
 *    - Provide alternative actions if possible
 * 
 * 5. Admin Controls:
 *    - Endpoint to manually reset circuit
 *    - Endpoint to temporarily disable circuit (during maintenance)
 *    - Endpoint to adjust thresholds without restart
 */
