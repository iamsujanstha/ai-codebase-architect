# ADR-009: Webhook-Driven Payments

**Status:** Accepted  
**Date:** 2024-04  
**Decision Makers:** Architecture Team  
**Related:** ADR-001 (NestJS Backend)

---

## Context

We integrate with payment providers (Stripe, eSewa) for e-commerce checkout. Payment processing is asynchronous—users are redirected to provider pages, complete payment, then redirected back. We need a reliable way to confirm payment completion and update order status.

### Requirements

1. **Reliable payment confirmation** (know when payment succeeds/fails)
2. **Asynchronous** (payment happens outside our system)
3. **Secure** (verify payment legitimacy, prevent tampering)
4. **Idempotent** (handle duplicate notifications)
5. **Eventually consistent** (accept temporary delays)

### Constraints

- Cannot poll payment providers (rate limits, latency)
- User redirect is unreliable (browser closed, network issues)
- Must work with multiple providers (Stripe, eSewa, future PayPal)
- Production must handle high volume (1000+ payments/day)

---

## Decision

**We use provider webhooks as the source of truth for payment status.**

User redirect confirms payment to frontend (good UX).  
Webhook confirms payment to backend (source of truth).

---

## Why Webhooks?

### 1. Provider-Initiated (Push, Not Poll)

**Webhook (What We Use):**
```
Payment completes on Stripe
  ↓
Stripe sends webhook:
  POST https://our-backend.com/payments/stripe/webhook
  {
    "type": "checkout.session.completed",
    "data": { ... }
  }
  ↓
We mark order as PAID
  ↓
Happens within seconds
```

**Polling (Alternative):**
```
Payment completes on Stripe
  ↓
We poll Stripe every 30 seconds:
  GET https://api.stripe.com/checkout/sessions/{id}
  ↓
Response: { "payment_status": "paid" }
  ↓
Mark order as PAID
  ↓
Delay: 0-30 seconds (average 15 seconds)
```

**Comparison:**
- Webhook: 1-5 second delay (Stripe → us)
- Polling: 0-30 second delay (depends on poll interval)
- Webhook: No API quota waste (Stripe calls us)
- Polling: Wastes API quota (we call Stripe repeatedly)

### 2. Reliable (Retries Built-In)

**Stripe Webhook Retries:**
```
Webhook sent: POST /webhook → 500 Internal Server Error
  ↓
Wait 5 minutes
  ↓
Retry 1: POST /webhook → Timeout
  ↓
Wait 15 minutes
  ↓
Retry 2: POST /webhook → 200 OK
  ↓
Success!
```

**Stripe retries for 3 days** with exponential backoff. We don't need to implement retry logic.

### 3. Handles User Redirect Failures

**Problem Scenario:**
```
User completes payment on Stripe
  ↓
Stripe redirects to our success URL
  ↓
User's browser crashes / network fails
  ↓
User never reaches our success page
  ↓
WITHOUT WEBHOOKS: Order stuck in PENDING_PAYMENT forever
  ↓
WITH WEBHOOKS: Webhook arrives, order marked PAID
```

**Result:** Webhooks provide reliability independent of user's browser.

### 4. Security (Signature Verification)

**Webhook Verification:**
```typescript
// Verify Stripe webhook signature
const signature = request.headers['stripe-signature'];
const rawBody = request.rawBody; // Important: use raw body

const event = stripe.webhooks.constructEvent(
  rawBody,
  signature,
  WEBHOOK_SECRET
);

// If signature invalid: throws error
// If signature valid: proceed
```

**Why Signature Verification:**
- Attacker cannot send fake webhook (no secret)
- Attacker cannot replay old webhook (timestamp included)
- Attacker cannot modify webhook data (breaks signature)

**Without Verification:**
```
Attacker sends fake webhook:
  POST /webhook
  {
    "type": "checkout.session.completed",
    "data": {
      "id": "cs_stolen_session",
      "payment_status": "paid"
    }
  }
  ↓
We mark order as PAID (no payment received!)
  ↓
Fraud
```

---

## Current Implementation

### Flow Diagram

```
User clicks "Checkout"
  ↓
POST /payments/stripe/checkout-session
  ↓
Create order (status: PENDING_PAYMENT)
  ↓
Create Stripe Checkout Session
  ↓
Return checkout URL
  ↓
Frontend redirects to Stripe
  ↓
User enters card, completes payment
  ↓
──────────────────────────────────────
TWO PATHS (both important):
──────────────────────────────────────

PATH A: User Redirect (UX)
  ↓
Stripe redirects to /checkout/result?session_id=...
  ↓
Frontend shows "Payment processing..."
  ↓
Frontend polls GET /payments/stripe/session/{id}
  ↓
Backend checks order status
  ↓
Frontend shows "Payment successful!"

PATH B: Webhook (Source of Truth)
  ↓
Stripe sends webhook:
  POST /payments/stripe/webhook
  ↓
Verify signature (security)
  ↓
Check idempotency (prevent duplicates)
  ↓
Extract order number from metadata
  ↓
Mark order as PAID
  ↓
Send confirmation email
```

### Webhook Handler (NestJS)

```typescript
// backend/src/payments/payments.controller.ts
@Post('stripe/webhook')
async handleStripeWebhook(
  @Req() request: Request,
  @Headers('stripe-signature') signature: string,
) {
  // Get raw body (required for signature verification)
  const rawBody = request.rawBody;

  // Delegate to service
  return this.paymentsService.handleStripeWebhook(rawBody, signature);
}

// backend/src/payments/payments.service.ts
async handleStripeWebhook(
  rawBody: Buffer,
  stripeSignature: string,
): Promise<{ received: true }> {
  // 1. Verify signature
  let event: Stripe.Event;
  try {
    event = this.stripeClient.webhooks.constructEvent(
      rawBody,
      stripeSignature,
      this.stripeWebhookSecret,
    );
  } catch (error) {
    throw new BadRequestException('Invalid webhook signature');
  }

  // 2. Check idempotency (prevent duplicate processing)
  const idempotencyKey = `stripe_webhook:${event.id}`;
  const isDuplicate = await this.checkWebhookIdempotency(idempotencyKey);
  if (isDuplicate) {
    return { received: true }; // Already processed
  }

  // 3. Mark as processing (atomic, prevents race condition)
  await this.markWebhookAsProcessing(idempotencyKey);

  try {
    // 4. Handle event
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        await this.syncOrderWithStripeSession(session);
        break;

      case 'checkout.session.async_payment_failed':
        const failedSession = event.data.object as Stripe.Checkout.Session;
        await this.markOrderAsFailed(
          this.extractOrderNumber(failedSession),
          'Stripe async payment failed'
        );
        break;

      case 'checkout.session.expired':
        const expiredSession = event.data.object as Stripe.Checkout.Session;
        await this.updateOrderStatus(
          this.extractOrderNumber(expiredSession),
          OrderStatus.EXPIRED,
          'Stripe session expired'
        );
        break;
    }

    // 5. Mark as successfully processed
    await this.markWebhookAsProcessed(idempotencyKey);
  } catch (error) {
    // Remove idempotency key so Stripe can retry
    await this.removeWebhookIdempotency(idempotencyKey);
    throw error;
  }

  return { received: true };
}
```

### Order Number in Metadata

**Problem:** Webhook contains Stripe session ID, not our order number.

**Solution:** Store order number in metadata when creating session.

```typescript
// When creating checkout session
const session = await stripe.checkout.sessions.create({
  // ... other fields
  client_reference_id: order.orderNumber,  // Option 1
  metadata: {
    orderNumber: order.orderNumber,        // Option 2
  },
});

// Extract in webhook
const orderNumber = 
  session.client_reference_id || 
  session.metadata?.orderNumber;
```

---

## Webhook Idempotency

**Problem:** Stripe may send same webhook multiple times.

**Why Duplicates:**
- Network retry (our response didn't reach Stripe)
- Failover (Stripe switches data centers)
- Manual replay (we request replay in dashboard)

**Solution:** Idempotency using Stripe event ID.

```typescript
// Use Stripe event ID as idempotency key
const idempotencyKey = `stripe_webhook:${event.id}`;

// Check if already processed
const existing = await redis.get(idempotencyKey);
if (existing) {
  return { received: true }; // Duplicate, already handled
}

// Mark as processing (atomic with unique constraint)
await redis.set(idempotencyKey, 'processing', 'NX', 'EX', 86400);

try {
  // Process webhook
  await handleWebhook(event);
  
  // Mark as completed
  await redis.set(idempotencyKey, 'completed', 'EX', 86400);
} catch (error) {
  // Remove key so Stripe can retry
  await redis.del(idempotencyKey);
  throw error;
}
```

**TTL:** 24 hours (Stripe's retry window is 3 days, but after 24h it's safe to reprocess)

---

## Alternatives Considered

### 1. Polling Payment Status

**Approach:**
```typescript
// Poll Stripe every 30 seconds
setInterval(async () => {
  const pendingOrders = await Order.find({ status: 'PENDING_PAYMENT' });
  
  for (const order of pendingOrders) {
    const session = await stripe.checkout.sessions.retrieve(
      order.stripeSessionId
    );
    
    if (session.payment_status === 'paid') {
      await markOrderAsPaid(order.id);
    }
  }
}, 30000);
```

**Pros:**
- Simple (no webhook endpoint needed)
- We control polling frequency

**Cons:**
- **Wasteful** (polls even when no payments happening)
- **Slow** (0-30 second delay, average 15 seconds)
- **Rate limits** (Stripe limits API calls)
- **Cost** (API calls cost money at scale)
- **Scales poorly** (100 pending orders = 100 API calls every 30s)

**Why Not:** Polling is inferior in every way—slower, more expensive, less reliable. Webhooks push updates instantly.

**When Polling Would Be Acceptable:**
- Payment provider doesn't support webhooks
- Very low volume (< 10 payments/day)
- Can accept 30+ second delay

### 2. Redirect-Only Confirmation

**Approach:**
```typescript
// User redirected to success URL
GET /checkout/result?session_id=cs_test_...

// Verify session status
const session = await stripe.checkout.sessions.retrieve(sessionId);
if (session.payment_status === 'paid') {
  await markOrderAsPaid(orderNumber);
}
```

**Pros:**
- Simple (no webhook setup)
- Immediate feedback to user

**Cons:**
- **Unreliable** (user might not reach success URL)
  - Browser crash
  - Network failure
  - User closes tab
- **Race condition** (user opens success URL twice → duplicate processing)
- **Security** (attacker could forge success URL with arbitrary session_id)

**Why Not:** User redirect is for UX only, not source of truth. Webhook is reliable, redirect is not.

### 3. Server-to-Server Callback (Not Webhook)

**Approach:**
```typescript
// After creating session, immediately check status
const session = await stripe.checkout.sessions.create({...});

// Wait for user to complete payment (blocking)
while (true) {
  const updated = await stripe.checkout.sessions.retrieve(session.id);
  if (updated.payment_status === 'paid') {
    await markOrderAsPaid(orderNumber);
    break;
  }
  await sleep(5000); // Wait 5 seconds
}
```

**Pros:**
- Immediate response (know status right away)

**Cons:**
- **Blocks request** (connection open for 30+ seconds)
- **Connection timeout** (Nginx/proxy will timeout)
- **Doesn't scale** (1000 pending orders = 1000 open connections)
- **User abandons** (no way to know when payment completes)

**Why Not:** Blocking approach doesn't work for async payments. User can take minutes to complete payment. Webhooks handle async correctly.

### 4. Hybrid: Redirect + Webhook (What We Use)

**Approach:**
```
Redirect: Immediate UX feedback
Webhook: Source of truth for status

User redirect arrives → show "Processing..."
Webhook arrives → mark PAID → show "Success!"
```

**Benefits:**
- **Fast UX** (user sees result immediately)
- **Reliable** (webhook ensures payment processed)
- **Handles failures** (if redirect fails, webhook still works)

**This is the industry standard approach.**

---

## Rationale

### Why Webhooks Are Superior

| Criterion | Webhooks | Polling | Redirect Only |
|-----------|----------|---------|---------------|
| **Latency** | 1-5 seconds | 0-30 seconds | Immediate* |
| **Reliability** | High (Stripe retries) | Medium (our code must retry) | Low (user must reach URL) |
| **API usage** | Minimal (Stripe calls us) | High (we call Stripe often) | Minimal |
| **Race conditions** | Handled (idempotency) | Possible | Likely |
| **Security** | High (signature) | High (our API key) | Low (forgeable) |
| **Cost** | Free | $$ (API calls) | Free |

*Immediate but unreliable

**Result:** Webhooks + redirect is optimal combination.

---

## Tradeoffs

### What We Gain

- ✅ **Reliable payment confirmation** (independent of user)
- ✅ **Fast updates** (1-5 second latency)
- ✅ **No API waste** (Stripe pushes, we don't poll)
- ✅ **Secure** (signature verification)
- ✅ **Idempotent** (duplicate webhooks handled safely)
- ✅ **Provider-managed retries** (3-day retry window)

### What We Lose

- ❌ **Webhook endpoint required** (public HTTP endpoint)
- ❌ **Signature verification complexity** (must preserve raw body)
- ❌ **Idempotency tracking** (must store processed webhook IDs)

### What It Costs

- **Endpoint:** 1 route per provider
- **Storage:** ~1KB per webhook ID (24h TTL)
- **Processing:** ~10ms per webhook

---

## Consequences

### Positive

1. **Payments confirmed reliably** (even if user's browser crashes)
2. **Fast confirmation** (1-5 seconds vs 15-30 for polling)
3. **No API waste** (Stripe calls us, not reverse)
4. **Industry standard** (same approach as Shopify, Stripe docs recommend)

### Negative

1. **Webhook endpoint must be public** (requires public URL, Nginx config)
2. **Raw body preservation required** (middleware must not parse body)
3. **Idempotency storage required** (Redis or MongoDB)

### Neutral

1. **Webhook testing complexity** (need Stripe CLI or mock server in development)

---

## Security Best Practices

### 1. Signature Verification (Critical)

```typescript
// Always verify signature
try {
  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret
  );
} catch (error) {
  // Log suspicious webhook
  logger.warn({
    event: 'webhook_signature_failed',
    ip: request.ip,
    headers: request.headers,
  });
  throw new BadRequestException('Invalid signature');
}
```

### 2. Idempotency (Critical)

```typescript
// Check idempotency BEFORE processing
const isDuplicate = await checkIdempotency(event.id);
if (isDuplicate) {
  return { received: true };
}
```

### 3. Validate Event Data

```typescript
// Verify event type
const allowedTypes = [
  'checkout.session.completed',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
];

if (!allowedTypes.includes(event.type)) {
  logger.warn({ event: 'unknown_webhook_type', type: event.type });
  return { received: true }; // Acknowledge but ignore
}

// Verify order exists
const orderNumber = extractOrderNumber(event.data.object);
const order = await Order.findOne({ orderNumber });
if (!order) {
  logger.error({ event: 'webhook_order_not_found', orderNumber });
  throw new NotFoundException('Order not found');
}
```

### 4. Rate Limiting

```typescript
// Rate limit webhook endpoint (prevent DoS)
@RateLimit(100, 60 * 1000) // 100 webhooks per minute
@Post('stripe/webhook')
async handleWebhook() {
  // ...
}
```

### 5. Webhook Secret Rotation

```typescript
// Support both old and new secrets during rotation
const secrets = [
  process.env.STRIPE_WEBHOOK_SECRET,
  process.env.STRIPE_WEBHOOK_SECRET_OLD, // During rotation
].filter(Boolean);

let event: Stripe.Event | null = null;

for (const secret of secrets) {
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    break; // Success
  } catch (error) {
    continue; // Try next secret
  }
}

if (!event) {
  throw new BadRequestException('Invalid signature');
}
```

---

## Development & Testing

### Local Development (Stripe CLI)

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/payments/stripe/webhook

# CLI prints webhook secret (use in .env)
whsec_xxxxxxxxxxxxxxxxxxxxx
```

### Manual Testing

```bash
# Trigger test webhook
stripe trigger checkout.session.completed
```

### Integration Tests

```typescript
describe('Stripe Webhooks', () => {
  it('marks order as paid on checkout.session.completed', async () => {
    // Create test order
    const order = await createTestOrder();
    
    // Construct test webhook
    const event = stripe.webhooks.constructEvent(
      JSON.stringify({
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { orderNumber: order.orderNumber },
            payment_status: 'paid',
          },
        },
      }),
      signature,
      webhookSecret
    );
    
    // Send webhook
    await paymentsService.handleStripeWebhook(event);
    
    // Verify order marked as paid
    const updated = await Order.findOne({ orderNumber: order.orderNumber });
    expect(updated.status).toBe(OrderStatus.PAID);
  });
});
```

---

## When Would We Change This Decision?

### Triggers to Stop Using Webhooks

1. **Provider Doesn't Support Webhooks**
   - Example: Legacy payment provider
   - Mitigation: Implement polling for that provider only
   - Alternative: Switch to provider with webhooks

2. **Cannot Expose Public Webhook Endpoint**
   - Example: Air-gapped network, no public IP
   - Mitigation: Use VPN or SSH tunnel
   - Alternative: Polling-only approach

3. **Webhook Reliability Issues**
   - Example: Provider webhook delivery < 90%
   - Mitigation: Hybrid approach (polling backup)
   - Alternative: Switch provider

---

## Interview Answer

**Q: "How do you confirm payment completion?"**

**A:** "We use a hybrid approach with webhooks as source of truth and redirects for UX. When a user completes payment on Stripe, two things happen: Stripe redirects the user back to our site (for immediate feedback) and Stripe sends a webhook to our server (for reliable confirmation).

The redirect shows 'Payment processing...' immediately. The webhook (sent within 1-5 seconds) is our source of truth—we verify the signature, check idempotency to prevent duplicate processing, extract the order number from metadata, and mark the order as paid.

Webhooks are superior to polling in every way. Polling wastes API quota (we'd call Stripe every 30 seconds for all pending orders), has 15-second average latency, and scales poorly. Webhooks push updates instantly, Stripe handles retries for 3 days, and we only process when events actually happen.

The critical security measures: first, signature verification using Stripe's signing secret (prevents fake webhooks). Second, idempotency using the Stripe event ID (prevents duplicate processing if webhook is retried). Third, raw body preservation (signature verification requires the exact bytes Stripe sent).

We handle edge cases: duplicate webhooks (idempotency key), race conditions (atomic idempotency check), out-of-order webhooks (status machine prevents invalid transitions), and failed processing (remove idempotency key so Stripe can retry). The result is reliable, fast, secure payment confirmation."

---

## References

- [Stripe Webhooks Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [Webhook Security](https://stripe.com/docs/webhooks/signatures)
- [eSewa Integration Guide](https://developer.esewa.com.np/)

---

**Last Updated:** 2024-04  
**Next Review:** If webhook delivery rate drops below 95% or new providers added
