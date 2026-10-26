export interface ProductCatalogItem {
  id: number;
  name: string;
  price: number | any;
  stock?: number;
  slug?: string | null;
  deleted_at?: Date | null;
}

export interface CustomerUserData {
  id: number;
  email: string;
  name: string | null;
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
    payload: any;
    nextAttemptAt: Date;
  };
}

export interface OutboxEventRecord {
  id: number;
  aggregate_id: string;
  aggregate_type: string;
  event_type: string;
  payload: any;
  attempts: number;
  max_attempts: number;
}

export interface IPaymentsRepository {
  findProductsByIds(ids: number[]): Promise<ProductCatalogItem[]>;
  findUserByEmail(email: string): Promise<CustomerUserData | null>;
  findUserById(id: number): Promise<CustomerUserData | null>;
  getFirstUserId(): Promise<number>;
  findOrCreateCustomer(email: string, fullName?: string): Promise<CustomerUserData>;
  createOrderSnapshot(dto: CreateOrderSnapshotDto): Promise<void>;
  updateOrderStatus(orderNumber: string, status: string, paymentIntentId?: string | null): Promise<void>;
  findOrderByOrderNumber(orderNumber: string): Promise<any | null>;
  findOrdersByUserIdOrEmail(userId?: string, userEmail?: string): Promise<any[]>;
  markOrderAsPaidAtomic(params: AtomicOrderPaidParams): Promise<void>;
  decrementProductStock(items: Array<{ productId: number; quantity: number }>): Promise<void>;
  checkIdempotencyKey(key: string): Promise<boolean>;
  createIdempotencyKey(key: string, expiresAt: Date): Promise<void>;
  markIdempotencyKeyProcessed(key: string): Promise<void>;
  deleteIdempotencyKey(key: string): Promise<void>;
  claimPendingOutboxEvents(batchSize: number, now: Date): Promise<OutboxEventRecord[]>;
  markOutboxEventProcessing(id: number): Promise<void>;
  markOutboxEventProcessed(id: number, attempts: number): Promise<void>;
  scheduleOutboxEventRetry(id: number, attempts: number, nextAttemptAt: Date, error: string): Promise<void>;
  deadLetterOutboxEvent(id: number, attempts: number, error: string): Promise<void>;
}

export const PAYMENTS_REPOSITORY_TOKEN = Symbol('IPaymentsRepository');
