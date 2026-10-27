# ADR-004: Qdrant for Semantic Memory

**Status:** Accepted  
**Date:** 2024-04  
**Decision Makers:** Architecture Team  
**Related:** ADR-003 (PostgreSQL + pgvector for PDF RAG)

---

## Context

We need vector storage for **semantic memory** in the AI system:
- Conversational context (what was discussed before)
- Shared knowledge base (not user-specific documents)
- AI agent memory (past interactions, learned preferences)
- Cross-session context retrieval

This is **different from PDF RAG** which has:
- Structured relational data (document → chunks → user)
- User ownership requirements (security isolation)
- ACID transaction needs (delete document = delete all chunks)

### Requirements

1. **Pure vector search** (no complex relational queries)
2. **High performance** (sub-10ms retrieval for chat context)
3. **Metadata filtering** (filter by conversation, time range, topic)
4. **Horizontal scaling** (millions of conversation embeddings)
5. **No ACID requirements** (eventual consistency acceptable)
6. **Simple deployment** (Docker container, no complex setup)

### Constraints

- AI service is Python (needs good Python client)
- Need to ship quickly (no multi-month integration)
- Semantic memory is append-heavy (few updates/deletes)
- Scale target: 1M-100M embeddings

---

## Decision

**We chose Qdrant for semantic memory and conversational AI context.**

Qdrant will store:
- Conversation history embeddings (semantic search over chat)
- Shared knowledge base embeddings (company docs, policies)
- AI agent memory (user preferences, interaction patterns)

**Why:** Purpose-built for vector search, excellent performance, easy deployment, no relational complexity needed.

---

## Why We Have Both Qdrant AND pgvector

| Use Case | Database | Why |
|----------|----------|-----|
| **PDF RAG** (user documents) | **PostgreSQL + pgvector** | Relational structure (doc → chunks), user ownership, ACID transactions, hybrid queries |
| **Semantic Memory** (conversational AI) | **Qdrant** | Pure vector search, no relations needed, better performance, easier scaling |

**They solve different problems.**

---

## Alternatives Considered

### 1. Use PostgreSQL + pgvector for Everything

**Pros:**
- One database (simpler infrastructure)
- ACID transactions
- Familiar SQL

**Cons:**
- PostgreSQL not optimized for pure vector workloads
- Slower vector search than specialized DBs (10-50ms vs 5ms)
- Complex queries not needed for semantic memory
- Harder to scale horizontally

**Why Not:** Semantic memory doesn't need relational features. Using PostgreSQL would be over-engineering—like using a relational DB to store logs. Qdrant is 2-5x faster for pure vector search.

**When PostgreSQL Would Be Better:**
- If we needed JOINs (semantic memory + user data)
- If we needed ACID transactions
- If vector search was <10% of workload

### 2. Pinecone (Managed Vector DB)

**Pros:**
- Fully managed (zero ops)
- Excellent performance
- Auto-scaling
- Simple API

**Cons:**
- **Vendor lock-in** (proprietary, cannot self-host)
- **Cost:** $70+/month for production (vs free for Qdrant)
- No control over infrastructure
- Data stored on Pinecone's servers (privacy concern for some use cases)

**Why Not:** 
- This is a learning/portfolio project (self-hosted demonstrates more depth)
- Pinecone is a "black box" (cannot inspect internals)
- Cost matters for personal projects
- Interview: "I used Pinecone" < "I deployed Qdrant, tuned HNSW params, scaled to 10M vectors"

**When Pinecone Would Be Better:**
- Production startup with no ML/vector expertise
- Need to ship ASAP (can't spend time on infrastructure)
- Budget for managed services
- Compliance requires managed SOC2 service

### 3. Weaviate

**Pros:**
- Open-source vector DB
- Good schema support
- Multi-modal (text + images)
- Built-in ML models

**Cons:**
- More complex than Qdrant (GraphQL, schemas)
- Heavier resource usage
- Overkill for our use case (we just need vector similarity)

**Why Not:** Weaviate is powerful but complex. Qdrant is simpler for pure vector search. We don't need GraphQL or built-in ML models (we already have Ollama/OpenAI).

### 4. Milvus

**Pros:**
- Open-source, battle-tested
- Horizontal scaling
- Used by large companies

**Cons:**
- Complex deployment (requires etcd, MinIO)
- Heavier than Qdrant (Kubernetes recommended)
- Over-engineering for < 100M vectors

**Why Not:** Milvus is for massive scale (billions of vectors). We're at thousands/millions. Qdrant is simpler and sufficient.

**When Milvus Would Be Better:**
- > 1 billion vectors
- Multi-datacenter deployment
- Need Kubernetes-native scaling

### 5. Elasticsearch with Vector Search

**Pros:**
- Already familiar (if using ELK stack)
- Good for hybrid search (keyword + vector)
- Mature ecosystem

**Cons:**
- Vector search is newer feature (less mature than Qdrant)
- Heavier (designed for text search + logs, not pure vector)
- Slower than dedicated vector DBs
- Complex to tune for vector workloads

**Why Not:** Elasticsearch is a text search engine with vector capabilities bolted on. Qdrant is purpose-built for vectors.

### 6. Chroma

**Pros:**
- Simple Python API
- Embedded mode (no server needed)
- Good for prototyping

**Cons:**
- Less mature than Qdrant
- Weaker performance at scale
- Limited production deployment patterns

**Why Not:** Chroma is great for prototyping but Qdrant is more production-ready. We're building a production-style system.

---

## Rationale

### Why Qdrant Fits Semantic Memory

1. **Purpose-Built for Vector Search**
   ```python
   # Semantic search over conversation history
   results = qdrant_client.search(
       collection_name="conversations",
       query_vector=question_embedding,
       query_filter={
           "must": [
               {"key": "userId", "match": {"value": user_id}},
               {"key": "timestamp", "range": {"gte": last_week}}
           ]
       },
       limit=5
   )
   ```
   
   No SQL, no schemas, just vector similarity + metadata filters.

2. **Excellent Performance**
   - HNSW index: ~5ms for 1M vectors
   - Quantization: 4x storage reduction with <1% accuracy loss
   - Disk-based: Can handle datasets larger than RAM

3. **Simple Deployment**
   ```yaml
   qdrant:
     image: qdrant/qdrant:latest
     ports: ["6333:6333"]
     volumes: ["qdrant_data:/qdrant/storage"]
   ```
   One Docker container. No etcd, no MinIO, no Kubernetes required.

4. **Python-First**
   ```python
   from qdrant_client import QdrantClient
   
   client = QdrantClient(host="qdrant", port=6333)
   ```
   Official Python client, async support, type hints.

5. **Horizontal Scaling**
   When we outgrow single node:
   - Shard by user_id (each shard handles subset of users)
   - Deploy multiple Qdrant instances
   - Application routes to correct shard
   
   No need for complex distributed system (like Milvus) until billions of vectors.

---

## Use Cases in Atlas

### 1. Conversational Memory

**Problem:** AI forgets previous messages in long conversations

**Solution:**
```python
# Store each message as embedding
qdrant_client.upsert(
    collection_name="conversations",
    points=[{
        "id": message_id,
        "vector": message_embedding,
        "payload": {
            "userId": user_id,
            "threadId": thread_id,
            "content": message_text,
            "timestamp": datetime.now(),
            "role": "user"  # or "assistant"
        }
    }]
)

# Retrieve relevant past messages
relevant_history = qdrant_client.search(
    collection_name="conversations",
    query_vector=current_question_embedding,
    query_filter={"must": [{"key": "threadId", "match": thread_id}]},
    limit=5
)

# Include in context for AI
context = [msg.payload["content"] for msg in relevant_history]
```

**Benefit:** AI maintains context across long conversations without including all messages (saves tokens, faster).

### 2. Shared Knowledge Base

**Problem:** Multiple users ask similar questions

**Solution:**
```python
# Embed company policies, docs, FAQs
qdrant_client.upsert(
    collection_name="knowledge",
    points=[{
        "id": doc_id,
        "vector": doc_embedding,
        "payload": {
            "title": "Return Policy",
            "content": "...",
            "category": "policy",
            "last_updated": "2024-10-01"
        }
    }]
)

# Retrieve for any user's question
relevant_docs = qdrant_client.search(
    collection_name="knowledge",
    query_vector=question_embedding,
    limit=3
)
```

**Benefit:** Consistent answers across all users, no per-user storage duplication.

### 3. User Preference Memory

**Problem:** AI doesn't remember user preferences across sessions

**Solution:**
```python
# Store interaction patterns
qdrant_client.upsert(
    collection_name="preferences",
    points=[{
        "id": f"{user_id}_{preference_id}",
        "vector": preference_embedding,
        "payload": {
            "userId": user_id,
            "preference": "prefers_concise_answers",
            "confidence": 0.85,
            "learned_from": ["interaction_1", "interaction_2"]
        }
    }]
)
```

**Benefit:** Personalized AI responses based on learned behavior.

---

## Qdrant vs pgvector Decision Matrix

| Criteria | Qdrant | pgvector | Winner |
|----------|--------|----------|--------|
| **Vector search speed** | ~5ms (HNSW) | ~10-50ms | Qdrant |
| **Relational queries** | No | Yes (SQL) | pgvector |
| **ACID transactions** | No | Yes | pgvector |
| **Horizontal scaling** | Easy (sharding) | Complex | Qdrant |
| **Metadata filtering** | Excellent | Good (JSON) | Qdrant |
| **Deployment simplicity** | 1 container | PostgreSQL + extension | Qdrant |
| **Storage efficiency** | Quantization | Full precision | Qdrant |
| **Production maturity** | Good | Excellent | pgvector |

**Conclusion:** 
- Use **Qdrant** for pure vector workloads (semantic memory, embeddings search)
- Use **pgvector** for hybrid workloads (relational data + vectors)

---

## Tradeoffs

### What We Gain

- ✅ **Performance:** 2-5x faster vector search than pgvector
- ✅ **Simplicity:** No SQL, no schemas, just vectors + metadata
- ✅ **Scalability:** Horizontal sharding when needed
- ✅ **Storage:** Quantization reduces storage 4x
- ✅ **Deployment:** One Docker container

### What We Lose

- ❌ **ACID Transactions:** Cannot guarantee consistency across operations
- ❌ **SQL:** Cannot JOIN with other data
- ❌ **Relational Integrity:** No foreign keys
- ❌ **Maturity:** Newer than PostgreSQL (fewer production years)

### What It Costs

- **Learning Curve:** Team must learn Qdrant API (not SQL)
- **Two Databases:** Must manage both Qdrant and PostgreSQL
- **Data Sync:** If semantic memory and relational data must stay in sync, requires application logic

---

## Consequences

### Positive

1. **Performance:** AI responses include relevant context quickly (<5ms retrieval)
2. **Simplicity:** Semantic memory queries are straightforward (no complex SQL)
3. **Scalability:** Can handle 100M+ embeddings with sharding
4. **Cost:** Open-source, free to self-host

### Negative

1. **Two Databases:** Must manage PostgreSQL AND Qdrant
2. **Eventual Consistency:** Cannot guarantee cross-database consistency
3. **No SQL:** Analysts cannot query Qdrant data easily

### Neutral

1. **Different Use Cases:** Qdrant and pgvector don't overlap (complementary, not competitive)

---

## When Would We Change This Decision?

### Triggers to Reconsider

1. **Need ACID Transactions for Semantic Memory**
   - Example: Must guarantee conversation + embeddings stay in sync
   - Mitigation: Use outbox pattern (transactional outbox in PostgreSQL → async sync to Qdrant)
   - Alternative: Move everything to PostgreSQL + pgvector

2. **Scale Beyond 1 Billion Vectors**
   - Example: 100M users × 1000 messages/user = 100B embeddings
   - Mitigation: Use Qdrant sharding (good to 10B+)
   - Alternative: Migrate to Milvus (designed for billions)

3. **Need Multi-Modal Search (Text + Images + Audio)**
   - Example: Search across chat text, uploaded images, voice notes
   - Mitigation: Store different vector types in separate collections
   - Alternative: Migrate to Weaviate (better multi-modal support)

4. **Team Prefers Managed Service**
   - Example: No one wants to manage Qdrant infrastructure
   - Mitigation: Use Qdrant Cloud (managed Qdrant)
   - Alternative: Migrate to Pinecone

---

## Implementation Details

### Collection Schema

```python
# Conversations collection
{
    "vectors": {
        "size": 768,  # nomic-embed-text dimensions
        "distance": "Cosine"
    },
    "payload_schema": {
        "userId": "keyword",
        "threadId": "keyword",
        "content": "text",
        "timestamp": "datetime",
        "role": "keyword"
    }
}

# Knowledge collection
{
    "vectors": {
        "size": 768,
        "distance": "Cosine"
    },
    "payload_schema": {
        "title": "text",
        "content": "text",
        "category": "keyword",
        "last_updated": "datetime"
    }
}
```

### HNSW Index Configuration

```python
qdrant_client.create_collection(
    collection_name="conversations",
    vectors_config={
        "size": 768,
        "distance": "Cosine"
    },
    hnsw_config={
        "m": 16,  # Number of connections per node
        "ef_construct": 100,  # Higher = better recall, slower build
    },
    optimizers_config={
        "indexing_threshold": 10000  # Build index after 10k vectors
    }
)
```

**HNSW Tuning:**
- `m=16`: Good balance (higher = more connections = faster search but more memory)
- `ef_construct=100`: Build quality (100 is standard, 200 for better recall)
- Query time `ef` can be tuned per query (higher = better recall, slower)

### Quantization for Storage

```python
# Enable scalar quantization (4x storage reduction)
qdrant_client.update_collection(
    collection_name="conversations",
    quantization_config={
        "scalar": {
            "type": "int8",
            "quantile": 0.99
        }
    }
)
```

**Result:** 768 floats × 4 bytes = 3 KB → 768 bytes (int8) = 0.75 KB

---

## Monitoring & Observability

### Key Metrics

```python
# Collection stats
info = qdrant_client.get_collection("conversations")

metrics = {
    "vectors_count": info.vectors_count,
    "indexed_vectors": info.indexed_vectors_count,
    "points_count": info.points_count,
    "disk_usage_bytes": info.disk_data_size
}
```

### Performance Monitoring

```python
import time

start = time.time()
results = qdrant_client.search(
    collection_name="conversations",
    query_vector=embedding,
    limit=5
)
duration = time.time() - start

# Log for observability
logger.info({
    "event": "qdrant_search",
    "collection": "conversations",
    "limit": 5,
    "results_count": len(results),
    "duration_ms": duration * 1000,
    "correlationId": request.correlation_id
})
```

**Alert if:**
- Search latency > 50ms (p95)
- Error rate > 1%
- Disk usage > 80%

---

## Scaling Strategy

### Current Scale (Single Node)
- 1-10M vectors: Single Qdrant instance handles easily
- Storage: ~7.5 GB (10M vectors × 0.75 KB with quantization)
- Query latency: < 10ms

### Future Scale (Sharding)

**When:** > 10M vectors or need geographic distribution

**Strategy:**
```python
# Shard by user_id (consistent hashing)
shard_id = hash(user_id) % num_shards

# Route to correct Qdrant instance
qdrant_client = qdrant_clients[shard_id]
```

**Result:** Linear scaling (2 shards = 2x capacity)

---

## References

- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [HNSW Algorithm Explained](https://www.pinecone.io/learn/series/faiss/hnsw/)
- [Vector DB Comparison Benchmark](https://benchmark.vectorview.ai/)
- [Qdrant vs Alternatives](https://qdrant.tech/benchmarks/)

---

**Last Updated:** 2024-04  
**Next Review:** If we exceed 10M vectors or need sub-5ms latency
