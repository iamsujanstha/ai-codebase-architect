import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/**
 * MongoDB Index Creation Script
 *
 * PHASE 1 CRITICAL: Production Performance
 *
 * WHY INDEXES MATTER:
 * - Without indexes: MongoDB scans ALL documents (slow, CPU-intensive)
 * - With indexes: MongoDB uses B-tree lookup (fast, minimal CPU)
 *
 * EXAMPLE:
 * Query: db.products.find({ category: "audio" })
 *
 * Without index:
 * - Scans 10,000 products (COLLSCAN)
 * - Takes 500ms
 * - Uses 100% CPU
 *
 * With index on category:
 * - Index lookup finds 50 matching products (IXSCAN)
 * - Takes 5ms
 * - Uses 2% CPU
 *
 * PRODUCTION SCENARIO:
 * Homepage loads products: GET /catalog/products?category=audio&featured=true
 * - 1000 concurrent users = 1000 queries/sec
 * - Without indexes: 500ms × 1000 = 500 seconds of work (server melts)
 * - With indexes: 5ms × 1000 = 5 seconds of work (server handles easily)
 *
 * INTERVIEW POINTS:
 * - Q: "How do you optimize database queries?"
 *   A: Indexes. Analyze slow queries with explain(), identify missing indexes,
 *      create compound indexes for common query patterns. Monitor index usage
 *      and remove unused indexes (they slow down writes).
 *
 * - Q: "What's the tradeoff of indexes?"
 *   A: Faster reads, slower writes. Each index adds overhead on INSERT/UPDATE.
 *      Balance: Index frequently-queried fields, don't over-index.
 *
 * USAGE:
 * npm run build
 * node dist/scripts/create-indexes.js
 */

async function createIndexes() {
  console.log('🚀 Starting index creation...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  const connection = app.get<Connection>(getConnectionToken());

  try {
    // ========================================
    // PRODUCTS COLLECTION
    // ========================================
    console.log('📦 Creating indexes for products collection...');
    const productsCollection = connection.collection('products');

    // Unique index on slug (product URLs must be unique)
    await productsCollection.createIndex(
      { slug: 1 },
      {
        unique: true,
        name: 'slug_unique',
      },
    );
    console.log('  ✅ slug_unique (unique)');

    // Compound index for category browsing with sorting
    // Query: GET /products?category=audio&sort=createdAt
    await productsCollection.createIndex(
      { category: 1, createdAt: -1 },
      {
        name: 'category_createdAt',
      },
    );
    console.log('  ✅ category_createdAt (compound)');

    // Compound index for featured products
    // Query: GET /products?featured=true&sort=createdAt
    await productsCollection.createIndex(
      { featured: 1, createdAt: -1 },
      {
        name: 'featured_createdAt',
      },
    );
    console.log('  ✅ featured_createdAt (compound)');

    // Text index for search
    // Query: GET /products?search=wireless+mouse
    await productsCollection.createIndex(
      { name: 'text', description: 'text' },
      {
        name: 'text_search',
        weights: {
          name: 10, // Name is more important than description
          description: 1,
        },
      },
    );
    console.log('  ✅ text_search (text index)\n');

    // ========================================
    // ORDERS COLLECTION
    // ========================================
    console.log('📋 Creating indexes for orders collection...');
    const ordersCollection = connection.collection('orders');

    // Unique index on orderNumber (order IDs must be unique)
    await ordersCollection.createIndex(
      { orderNumber: 1 },
      {
        unique: true,
        name: 'orderNumber_unique',
      },
    );
    console.log('  ✅ orderNumber_unique (unique)');

    // Compound index for user order history
    // Query: GET /orders?userId=123&sort=createdAt
    await ordersCollection.createIndex(
      { userId: 1, createdAt: -1 },
      {
        name: 'userId_createdAt',
      },
    );
    console.log('  ✅ userId_createdAt (compound)');

    // Index for payment status filtering
    // Query: GET /orders?paymentStatus=PENDING
    await ordersCollection.createIndex(
      { paymentStatus: 1 },
      {
        name: 'paymentStatus',
      },
    );
    console.log('  ✅ paymentStatus');

    // Index for customer email lookup
    // Query: Find orders by email (admin dashboard)
    await ordersCollection.createIndex(
      { 'customer.email': 1 },
      {
        name: 'customer_email',
      },
    );
    console.log('  ✅ customer_email\n');

    // ========================================
    // USERS COLLECTION
    // ========================================
    console.log('👤 Creating indexes for users collection...');
    const usersCollection = connection.collection('users');

    // Unique index on email (no duplicate accounts)
    await usersCollection.createIndex(
      { email: 1 },
      {
        unique: true,
        name: 'email_unique',
      },
    );
    console.log('  ✅ email_unique (unique)');

    // Sparse unique index on googleId (not all users have Google auth)
    // Sparse: Only index documents where googleId exists
    await usersCollection.createIndex(
      { googleId: 1 },
      {
        unique: true,
        sparse: true,
        name: 'googleId_unique_sparse',
      },
    );
    console.log('  ✅ googleId_unique_sparse (sparse unique)');

    // Index for password reset token lookup
    await usersCollection.createIndex(
      { resetToken: 1 },
      {
        sparse: true, // Most users don't have active reset tokens
        name: 'resetToken_sparse',
      },
    );
    console.log('  ✅ resetToken_sparse (sparse)\n');

    // ========================================
    // CHATTHREADS COLLECTION
    // ========================================
    console.log('💬 Creating indexes for chatthreads collection...');
    const chatThreadsCollection = connection.collection('chatthreads');

    // Compound index for user chat history
    // Query: GET /ai/threads?userId=123&sort=createdAt
    await chatThreadsCollection.createIndex(
      { userId: 1, createdAt: -1 },
      {
        name: 'userId_createdAt',
      },
    );
    console.log('  ✅ userId_createdAt (compound)\n');

    // ========================================
    // IDEMPOTENCY COLLECTION (Phase 1)
    // ========================================
    console.log('🔒 Creating indexes for idempotency_keys collection...');
    const idempotencyCollection = connection.collection('idempotency_keys');

    // Unique index on key (prevent duplicate idempotency keys)
    await idempotencyCollection.createIndex(
      { key: 1 },
      {
        unique: true,
        name: 'key_unique',
      },
    );
    console.log('  ✅ key_unique (unique)');

    // TTL index for automatic cleanup (24 hours)
    await idempotencyCollection.createIndex(
      { expiresAt: 1 },
      {
        expireAfterSeconds: 0,
        name: 'expiresAt_ttl',
      },
    );
    console.log('  ✅ expiresAt_ttl (TTL index)\n');

    // ========================================
    // WEBHOOK IDEMPOTENCY COLLECTION (Phase 1)
    // ========================================
    console.log('🪝 Creating indexes for webhook_idempotency collection...');
    const webhookIdempotencyCollection = connection.collection(
      'webhook_idempotency',
    );

    // Unique index on key (prevent duplicate webhook processing)
    await webhookIdempotencyCollection.createIndex(
      { key: 1 },
      {
        unique: true,
        name: 'key_unique',
      },
    );
    console.log('  ✅ key_unique (unique)');

    // TTL index for automatic cleanup (72 hours, matches Stripe retry window)
    await webhookIdempotencyCollection.createIndex(
      { expiresAt: 1 },
      {
        expireAfterSeconds: 0,
        name: 'expiresAt_ttl',
      },
    );
    console.log('  ✅ expiresAt_ttl (TTL index)\n');

    // ========================================
    // RATE LIMIT COLLECTION (Phase 1)
    // ========================================
    console.log('⏱️  Creating indexes for rate_limits collection...');
    const rateLimitsCollection = connection.collection('rate_limits');

    // Unique index on key (IP or userId per endpoint)
    await rateLimitsCollection.createIndex(
      { key: 1 },
      {
        unique: true,
        name: 'key_unique',
      },
    );
    console.log('  ✅ key_unique (unique)');

    // TTL index for automatic cleanup
    await rateLimitsCollection.createIndex(
      { resetAt: 1 },
      {
        expireAfterSeconds: 0,
        name: 'resetAt_ttl',
      },
    );
    console.log('  ✅ resetAt_ttl (TTL index)\n');

    console.log('✅ All indexes created successfully!\n');

    // ========================================
    // VERIFY INDEXES
    // ========================================
    console.log('🔍 Verifying indexes...\n');

    const collections = [
      'products',
      'orders',
      'users',
      'chatthreads',
      'idempotency_keys',
      'webhook_idempotency',
      'rate_limits',
    ];

    for (const collectionName of collections) {
      const coll = connection.collection(collectionName);
      const indexes = await coll.indexes();
      console.log(`📂 ${collectionName}:`);
      indexes.forEach((index) => {
        console.log(`   - ${index.name}`);
      });
      console.log('');
    }

    console.log('✅ Index verification complete!\n');

    // ========================================
    // PERFORMANCE NOTES
    // ========================================
    console.log('📊 Performance Impact:');
    console.log('  • Read queries: 10-100x faster');
    console.log('  • Write operations: ~5-10% slower (acceptable tradeoff)');
    console.log('  • Storage: +10-20% (indexes require space)');
    console.log('');
    console.log('💡 Next Steps:');
    console.log('  1. Monitor slow queries in production');
    console.log('  2. Run explain() on slow queries to verify index usage');
    console.log('  3. Remove unused indexes (they hurt write performance)');
    console.log('  4. Consider sharding if data exceeds 100GB');
    console.log('');
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

createIndexes()
  .then(() => {
    console.log('🎉 Index creation completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Index creation failed:', error);
    process.exit(1);
  });

/**
 * EXPLAIN PLAN ANALYSIS
 *
 * To verify indexes are being used:
 *
 * db.products.find({ category: "audio" }).explain("executionStats")
 *
 * Look for:
 * - stage: "IXSCAN" (good, using index)
 * - stage: "COLLSCAN" (bad, scanning all documents)
 * - executionTimeMillis: < 50ms (acceptable)
 * - totalDocsExamined vs nReturned (should be close, not 10x different)
 *
 * Example good plan:
 * {
 *   "executionStats": {
 *     "executionTimeMillis": 5,
 *     "totalDocsExamined": 50,
 *     "nReturned": 50,
 *     "executionStages": {
 *       "stage": "FETCH",
 *       "inputStage": {
 *         "stage": "IXSCAN",
 *         "indexName": "category_createdAt"
 *       }
 *     }
 *   }
 * }
 *
 * Example bad plan (needs index):
 * {
 *   "executionStats": {
 *     "executionTimeMillis": 500,
 *     "totalDocsExamined": 10000,
 *     "nReturned": 50,
 *     "executionStages": {
 *       "stage": "COLLSCAN"  // ❌ No index used!
 *     }
 *   }
 * }
 */
