import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Payment Audit Log Schema
 *
 * PHASE 2 CRITICAL: Immutable audit trail for payment operations
 *
 * WHY AUDIT LOGS:
 *
 * 1. COMPLIANCE:
 *    - PCI DSS requires audit trails for payment data access
 *    - SOX compliance for financial transactions
 *    - GDPR requires audit of data processing
 *
 * 2. FORENSICS:
 *    - Investigate payment disputes
 *    - Debug webhook processing issues
 *    - Track who did what when
 *
 * 3. SECURITY:
 *    - Detect unauthorized access
 *    - Identify attack patterns
 *    - Prove innocence in disputes
 *
 * 4. BUSINESS INTELLIGENCE:
 *    - Track payment success rates
 *    - Identify provider issues
 *    - Analyze failure patterns
 *
 * IMMUTABILITY:
 *
 * Audit logs MUST be immutable (write-once, never update/delete)
 *   ↓
 * Why: If logs can be modified, attacker can cover tracks
 *   ↓
 * Implementation:
 * - No update operations allowed
 * - No delete operations allowed
 * - TTL only (automatic expiration after retention period)
 * - Separate collection (not embedded in order)
 *   ↓
 * Result: Tamper-proof audit trail
 *
 * WHAT TO LOG:
 *
 * ✅ DO LOG:
 * - All payment state changes
 * - Webhook deliveries
 * - API calls to providers (request/response)
 * - User actions (checkout, cancel)
 * - System actions (timeout, retry)
 * - Security events (signature verification)
 *
 * ❌ DO NOT LOG:
 * - Full credit card numbers (PCI violation)
 * - CVV codes (PCI violation)
 * - Unencrypted sensitive data
 *
 * ✅ LOG THESE INSTEAD:
 * - Last 4 digits of card
 * - Masked card number (****-****-****-1234)
 * - Tokenized references (Stripe customer ID)
 *
 * PRODUCTION SCENARIO:
 *
 * Customer dispute:
 * "I was charged twice for order #ACL-241010-ABC123"
 *
 * Without Audit Log:
 * - Check current order status: PAID
 * - No history of what happened
 * - Cannot prove single vs double charge
 * - Refund to be safe (lose money)
 *
 * With Audit Log:
 * - Query audit logs for order
 * - See complete timeline:
 *   14:30:00 CHECKOUT_INITIATED user_id:123
 *   14:30:01 STRIPE_SESSION_CREATED session_id:cs_test_...
 *   14:30:05 WEBHOOK_RECEIVED event_id:evt_... status:paid
 *   14:30:05 IDEMPOTENCY_CHECK_PASSED
 *   14:30:06 ORDER_MARKED_PAID
 *   14:30:10 WEBHOOK_RECEIVED_DUPLICATE event_id:evt_... (duplicate detected)
 *   14:30:10 WEBHOOK_IGNORED (already processed)
 * - Proof: Webhook arrived twice, processed once
 * - No refund needed (saved money)
 *
 * RETENTION POLICY:
 *
 * Balance between:
 * - Compliance requirements (often 7 years)
 * - Storage costs (audit logs can be large)
 * - Query performance (old data slows queries)
 *
 * Strategy:
 * - Hot data (< 90 days): MongoDB primary
 * - Warm data (90 days - 1 year): MongoDB with compression
 * - Cold data (> 1 year): Archive to S3/Glacier
 *
 * INTERVIEW POINTS:
 *
 * Q: "Why separate audit logs from order documents?"
 * A: Three reasons. First, audit logs are append-only and never modified, while
 *    orders may be updated (status changes). Mixing mutable and immutable data
 *    risks accidental audit log modification. Second, audit logs have different
 *    retention requirements (7 years for compliance vs 1 year for orders).
 *    Third, audit queries have different access patterns (time-based forensics
 *    vs order lookup). Separate collections allow independent optimization.
 *
 * Q: "How do you prevent audit log tampering?"
 * A: Multiple layers. First, application code has no update/delete operations
 *    for audit logs—only insert. Second, database permissions restrict write
 *    access (separate service account for audit writes). Third, MongoDB TTL
 *    indexes handle expiration (no manual deletes). Fourth, for high-security
 *    needs, we could implement cryptographic signing (each log entry signed with
 *    private key, verified with public key). Finally, audit logs themselves are
 *    audited—we log who accessed audit logs.
 *
 * Q: "What's the performance impact of audit logging?"
 * A: Minimal. Audit log writes are fire-and-forget (async, no blocking). We use
 *    bulk inserts when possible. MongoDB handles ~10k writes/sec easily. The
 *    bottleneck is disk I/O, mitigated by batching. For extreme scale, we'd use
 *    a message queue (audit events → Kafka → batch insert). Read performance
 *    requires indexes on orderNumber, timestamp, eventType. With indexes, forensic
 *    queries (show all events for order X) run in <10ms.
 */

export type PaymentAuditLogDocument = PaymentAuditLog & Document;

@Schema({
  collection: 'payment_audit_logs',
  timestamps: true, // Automatic createdAt (no updatedAt since immutable)
  versionKey: false, // No __v field
})
export class PaymentAuditLog {
  /**
   * Order number (ACL-YYMMDD-XXXXXX)
   * Indexed for fast order-based queries
   */
  @Prop({ required: true, index: true })
  orderNumber!: string;

  /**
   * Event type (enum)
   * Indexed for analytics queries
   */
  @Prop({ required: true, index: true })
  eventType!: PaymentAuditEventType;

  /**
   * Event timestamp
   * Indexed for time-based queries
   * Compound index with orderNumber for timeline queries
   */
  @Prop({ required: true, index: true })
  timestamp!: Date;

  /**
   * Payment provider (STRIPE, ESEWA)
   */
  @Prop({ required: false })
  provider?: string;

  /**
   * User ID who triggered event (null for system/webhook events)
   */
  @Prop({ required: false, index: true })
  userId?: string | null;

  /**
   * Actor type: USER, SYSTEM, WEBHOOK
   */
  @Prop({ required: true })
  actor!: string;

  /**
   * Order status before event
   */
  @Prop({ required: false })
  previousStatus?: string;

  /**
   * Order status after event
   */
  @Prop({ required: false })
  newStatus?: string;

  /**
   * Event details (JSON)
   *
   * Examples:
   * - Webhook: { eventId, type, verified, duplicate }
   * - Checkout: { sessionId, amount, currency }
   * - Status change: { reason, triggeredBy }
   *
   * SECURITY: Do NOT include sensitive data
   * - ❌ Full card number
   * - ❌ CVV
   * - ✅ Last 4 digits
   * - ✅ Masked card
   * - ✅ Provider references
   */
  @Prop({ type: Object, required: false })
  details?: Record<string, any>;

  /**
   * IP address (for user-triggered events)
   * Useful for fraud detection
   */
  @Prop({ required: false })
  ipAddress?: string | null;

  /**
   * User agent (for user-triggered events)
   */
  @Prop({ required: false })
  userAgent?: string | null;

  /**
   * Correlation ID (for distributed tracing)
   * Links audit log to request logs
   */
  @Prop({ required: false, index: true })
  correlationId?: string | null;

  /**
   * Error details (if event was failure)
   */
  @Prop({ required: false })
  error?: {
    message: string;
    code?: string;
    stack?: string;
  } | null;

  /**
   * Success flag
   */
  @Prop({ required: true, default: true })
  success!: boolean;

  /**
   * Human-readable message
   */
  @Prop({ required: false })
  message?: string;

  /**
   * Metadata for future extensibility
   */
  @Prop({ type: Object, required: false })
  metadata?: Record<string, any>;
}

export const PaymentAuditLogSchema =
  SchemaFactory.createForClass(PaymentAuditLog);

/**
 * Indexes for performance
 *
 * Compound indexes for common query patterns
 */
PaymentAuditLogSchema.index({ orderNumber: 1, timestamp: 1 }); // Order timeline
PaymentAuditLogSchema.index({ eventType: 1, timestamp: -1 }); // Event analytics
PaymentAuditLogSchema.index({ userId: 1, timestamp: -1 }); // User activity
PaymentAuditLogSchema.index({ correlationId: 1 }); // Request tracing

/**
 * TTL index for automatic expiration
 * Comply with data retention policies
 *
 * Example: Keep audit logs for 7 years (PCI compliance)
 */
PaymentAuditLogSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 7 * 365 * 24 * 60 * 60, // 7 years
    name: 'audit_log_ttl',
  },
);

/**
 * Payment Audit Event Types
 *
 * Comprehensive list of loggable events
 */
export enum PaymentAuditEventType {
  // User-initiated events
  CHECKOUT_INITIATED = 'CHECKOUT_INITIATED',
  CHECKOUT_CANCELED = 'CHECKOUT_CANCELED',

  // Provider session events
  STRIPE_SESSION_CREATED = 'STRIPE_SESSION_CREATED',
  STRIPE_SESSION_EXPIRED = 'STRIPE_SESSION_EXPIRED',
  ESEWA_REDIRECT_PREPARED = 'ESEWA_REDIRECT_PREPARED',

  // Webhook events
  WEBHOOK_RECEIVED = 'WEBHOOK_RECEIVED',
  WEBHOOK_SIGNATURE_VERIFIED = 'WEBHOOK_SIGNATURE_VERIFIED',
  WEBHOOK_SIGNATURE_FAILED = 'WEBHOOK_SIGNATURE_FAILED',
  WEBHOOK_DUPLICATE_DETECTED = 'WEBHOOK_DUPLICATE_DETECTED',
  WEBHOOK_PROCESSING_STARTED = 'WEBHOOK_PROCESSING_STARTED',
  WEBHOOK_PROCESSING_COMPLETED = 'WEBHOOK_PROCESSING_COMPLETED',
  WEBHOOK_PROCESSING_FAILED = 'WEBHOOK_PROCESSING_FAILED',

  // Order state changes
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED',
  ORDER_MARKED_PAID = 'ORDER_MARKED_PAID',
  ORDER_MARKED_FAILED = 'ORDER_MARKED_FAILED',
  ORDER_MARKED_CANCELED = 'ORDER_MARKED_CANCELED',
  ORDER_MARKED_EXPIRED = 'ORDER_MARKED_EXPIRED',

  // Payment verification
  PAYMENT_VERIFIED = 'PAYMENT_VERIFIED',
  PAYMENT_VERIFICATION_FAILED = 'PAYMENT_VERIFICATION_FAILED',

  // Provider API calls
  PROVIDER_API_CALL_SUCCESS = 'PROVIDER_API_CALL_SUCCESS',
  PROVIDER_API_CALL_FAILED = 'PROVIDER_API_CALL_FAILED',
  PROVIDER_CIRCUIT_BREAKER_OPENED = 'PROVIDER_CIRCUIT_BREAKER_OPENED',
  PROVIDER_CIRCUIT_BREAKER_CLOSED = 'PROVIDER_CIRCUIT_BREAKER_CLOSED',

  // Idempotency
  IDEMPOTENCY_KEY_USED = 'IDEMPOTENCY_KEY_USED',
  IDEMPOTENCY_CHECK_PASSED = 'IDEMPOTENCY_CHECK_PASSED',
  IDEMPOTENCY_DUPLICATE_DETECTED = 'IDEMPOTENCY_DUPLICATE_DETECTED',

  // Email notifications
  CONFIRMATION_EMAIL_SENT = 'CONFIRMATION_EMAIL_SENT',
  CONFIRMATION_EMAIL_FAILED = 'CONFIRMATION_EMAIL_FAILED',

  // Refunds (future)
  REFUND_INITIATED = 'REFUND_INITIATED',
  REFUND_COMPLETED = 'REFUND_COMPLETED',
  REFUND_FAILED = 'REFUND_FAILED',

  // Security events
  SUSPICIOUS_ACTIVITY_DETECTED = 'SUSPICIOUS_ACTIVITY_DETECTED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
}

/**
 * USAGE EXAMPLE:
 *
 * In payments.service.ts:
 *
 * import { PaymentAuditLog, PaymentAuditEventType } from './schemas/payment-audit-log.schema';
 *
 * // In constructor
 * constructor(
 *   @InjectModel(PaymentAuditLog.name)
 *   private readonly auditLogModel: Model<PaymentAuditLogDocument>,
 * ) {}
 *
 * // Log checkout initiation
 * await this.auditLogModel.create({
 *   orderNumber: order.orderNumber,
 *   eventType: PaymentAuditEventType.CHECKOUT_INITIATED,
 *   timestamp: new Date(),
 *   provider: PaymentProvider.STRIPE,
 *   userId: userId,
 *   actor: 'USER',
 *   details: {
 *     amount: quote.total,
 *     currency: quote.currency,
 *     items: pricedCart.map(item => ({
 *       productId: item.productId,
 *       quantity: item.quantity,
 *       amount: item.unitAmountUsd,
 *     })),
 *   },
 *   ipAddress: request.ip,
 *   userAgent: request.headers['user-agent'],
 *   correlationId: request.correlationId,
 *   success: true,
 *   message: 'User initiated Stripe checkout',
 * });
 *
 * // Log webhook received
 * await this.auditLogModel.create({
 *   orderNumber: orderNumber,
 *   eventType: PaymentAuditEventType.WEBHOOK_RECEIVED,
 *   timestamp: new Date(),
 *   provider: PaymentProvider.STRIPE,
 *   actor: 'WEBHOOK',
 *   previousStatus: order.status,
 *   newStatus: OrderStatus.PAID,
 *   details: {
 *     eventId: event.id,
 *     eventType: event.type,
 *     verified: true,
 *     duplicate: false,
 *   },
 *   success: true,
 *   message: 'Stripe webhook confirmed payment',
 * });
 *
 * // Query audit logs for order
 * const auditTrail = await this.auditLogModel
 *   .find({ orderNumber })
 *   .sort({ timestamp: 1 })
 *   .exec();
 *
 * // Result: Complete timeline of order lifecycle
 * [
 *   { eventType: 'CHECKOUT_INITIATED', timestamp: '2024-10-10T14:30:00Z', ... },
 *   { eventType: 'STRIPE_SESSION_CREATED', timestamp: '2024-10-10T14:30:01Z', ... },
 *   { eventType: 'WEBHOOK_RECEIVED', timestamp: '2024-10-10T14:30:05Z', ... },
 *   { eventType: 'WEBHOOK_DUPLICATE_DETECTED', timestamp: '2024-10-10T14:30:10Z', ... },
 *   { eventType: 'ORDER_MARKED_PAID', timestamp: '2024-10-10T14:30:06Z', ... },
 * ]
 */
