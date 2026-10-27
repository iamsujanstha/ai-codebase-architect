export interface ProductCatalogItem {
  id: number;
  name: string;
  price: number | string;
  stock?: number;
  slug?: string | null;
  deleted_at?: Date | null;
}

export interface CustomerUserData {
  id: number;
  email: string;
  name: string | null;
}

export interface OrderItemRecord {
  product_id: number;
  name: string;
  quantity: number;
  price: number | string;
  subtotal: number | string;
}

export interface OrderWithRelations {
  id: number;
  user_id: number;
  order_number: string;
  total_amount: number | string;
  status: string;
  payment_method: string | null;
  payment_intent_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  users: { name: string | null; email: string } | null;
  order_items: OrderItemRecord[];
}

export interface CreateOrderSnapshotDto {
  userId: number;
  orderNumber: string;
  totalAmount: number;
  status: string;
  paymentMethod: string;
  items: Array<{
    productId: number;
    name: string;
    price: number;
    quantity: number;
  }>;
}

export interface AtomicOrderPaidParams {
  orderNumber: string;
  paymentIntentId: string | null;
  outboxEvent: {
    aggregateId: string;
    aggregateType: string;
    eventType: string;
    payload: unknown;
    nextAttemptAt: Date;
  };
}

export interface OutboxEventRecord {
  id: number;
  aggregate_id: string;
  aggregate_type: string;
  event_type: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  claim_token: string;
}

export interface IPaymentsRepository {
  findProductsByIds(ids: number[]): Promise<ProductCatalogItem[]>;
  findUserByEmail(email: string): Promise<CustomerUserData | null>;
  findUserById(id: number): Promise<CustomerUserData | null>;
  getFirstUserId(): Promise<number>;
  findOrCreateCustomer(
    email: string,
    fullName?: string,
  ): Promise<CustomerUserData>;
  createOrderSnapshot(dto: CreateOrderSnapshotDto): Promise<void>;
  updateOrderStatus(
    orderNumber: string,
    status: string,
    paymentIntentId?: string | null,
  ): Promise<void>;
  findOrderByOrderNumber(
    orderNumber: string,
  ): Promise<OrderWithRelations | null>;
  findOrdersByUserIdOrEmail(
    userId?: string,
    userEmail?: string,
  ): Promise<OrderWithRelations[]>;
  markOrderAsPaidAtomic(params: AtomicOrderPaidParams): Promise<void>;
  decrementProductStock(
    eventId: number,
    items: Array<{ productId: number; quantity: number }>,
  ): Promise<void>;
  checkIdempotencyKey(key: string): Promise<boolean>;
  createIdempotencyKey(key: string, expiresAt: Date): Promise<void>;
  markIdempotencyKeyProcessed(key: string): Promise<void>;
  deleteIdempotencyKey(key: string): Promise<void>;
  claimPendingOutboxEvents(
    batchSize: number,
    now: Date,
    staleClaimBefore: Date,
  ): Promise<OutboxEventRecord[]>;
  markOutboxEventProcessed(id: number, claimToken: string): Promise<void>;
  scheduleOutboxEventRetry(
    id: number,
    claimToken: string,
    nextAttemptAt: Date,
    error: string,
  ): Promise<void>;
  deadLetterOutboxEvent(
    id: number,
    claimToken: string,
    error: string,
  ): Promise<void>;
}

export const PAYMENTS_REPOSITORY_TOKEN = Symbol('IPaymentsRepository');
