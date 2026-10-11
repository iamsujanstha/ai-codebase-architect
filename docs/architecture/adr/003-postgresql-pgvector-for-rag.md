# ADR-003: PostgreSQL + pgvector for PDF RAG

**Status:** Accepted  
**Date:** 2024-04  
**Decision Makers:** Architecture Team  
**Related:** ADR-002 (MongoDB), ADR-004 (Qdrant)

---

## Context

We need a database for **PDF RAG (Retrieval-Augmented Generation)**:
- Store uploaded PDF documents (metadata: filename, user, upload date)
- Store text chunks extracted from PDFs
- Store vector embeddings for semantic search
- Query similar chunks by vector similarity (cosine/euclidean)
- Filter by user ownership (security isolation)
- Support structured queries (which document does this chunk belong to?)

### Requirements

1. **Vector similarity search** (embedding-based retrieval)
2. **Structured metadata** (documents have pages, chunks have positions)
3. **User isolation** (users can only query their documents)
4. **Relational integrity** (chunk → document → user)
5. **ACID transactions** (delete document = delete all chunks)
6. **Hybrid queries** (vector search + metadata filters)

### Constraints

- Backend is Node.js/NestJS (needs good PostgreSQL client)
- Team has PostgreSQL experience
- Need to ship RAG feature quickly
- Modest scale initially (< 10k documents)

---

## Decision

**We chose PostgreSQL with pgvector extension for PDF RAG.**

Schema:
```sql
-- Documents table
CREATE TABLE pdf_documents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER,
  page_count INTEGER,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Chunks table
CREATE TABLE pdf_chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES pdf_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  page_number INTEGER,
  chunk_index INTEGER,
  embedding vector(768),  -- pgvector type
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for vector similarity search
CREATE INDEX ON pdf_chunks USING hnsw (embedding vector_cosine_ops);

-- Index for user isolation
CREATE INDEX ON pdf_documents(user_id);
```

**Why:** Structured relational data (document → chunks) + vector search in one database. No data synchronization between systems.

---

## Alternatives Considered

### 1. Qdrant Alone (No PostgreSQL)

**Pros:**
- Purpose-built for vector search
- Better performance for pure vector queries
- Built-in filtering

**Cons:**
- No relational structure (chunk → document → user harder to model)
- No ACID transactions (deleting document doesn't cascade to chunks)
- Weaker metadata querying (not SQL)
- Adds another database to infrastructure

**Why Not:** PDF RAG needs structured relationships (documents have metadata, chunks belong to documents). Qdrant would require duplicating this structure or synchronizing with another DB.

**See ADR-004** for when we DO use Qdrant (conversational semantic memory).

### 2. MongoDB with Vector Search

**Pros:**
- Already in stack
- Vector search added in MongoDB 6.0+
- Flexible schema

**Cons:**
- Vector search is newer (less mature than pgvector)
- No native vector indexing (uses Atlas Search, not available in self-hosted)
- Harder to enforce relational structure (document → chunks)
- No CASCADE deletes

**Why Not:** pgvector is more mature for vector search, and relational model fits this use case better than documents.

### 3. Pinecone (Managed Vector DB)

**Pros:**
- Fully managed
- Excellent performance
- Simple API

**Cons:**
- Vendor lock-in
- Cost ($70+/month for production)
- No structured metadata (would need separate DB for documents)
- Overkill for our scale

**Why Not:** We're building a portfolio/learning project. Self-hosted pgvector demonstrates more engineering depth than a managed service. Cost is also a factor for personal projects.

### 4. Weaviate

**Pros:**
- Open-source vector DB
- Good schema support
- Multi-modal capabilities

**Cons:**
- Another service to run
- GraphQL query language (team is SQL-first)
- More complex than pgvector for this use case

**Why Not:** pgvector is simpler and we already run PostgreSQL for other needs (could consolidate in future).

### 5. Keep Everything in Qdrant

**Pros:**
- Single vector DB
- Good performance

**Cons:**
- Document metadata requires JSON payload in Qdrant
- No relational joins (chunk belongs to which document?)
- No ACID (delete document doesn't cascade)
- Harder to debug (SQL vs Qdrant queries)

**Why Not:** Relational structure matters for this use case.

---

## Rationale

### Why PostgreSQL + pgvector Fits

1. **Relational Structure Is Natural**
   ```
   User
     ↓ (has many)
   PDF Documents
     ↓ (has many)
   Chunks (with embeddings)
   ```
   This is a classic relational model. PostgreSQL handles it naturally.

2. **Hybrid Queries**
   ```sql
   -- Find similar chunks from MY documents only
   SELECT c.content, c.page_number
   FROM pdf_chunks c
   JOIN pdf_documents d ON c.document_id = d.id
   WHERE d.user_id = $1
   ORDER BY c.embedding <=> $2  -- cosine similarity
   LIMIT 5;
   ```
   One query combines:
   - Vector similarity search
   - User ownership filtering
   - JOIN across tables

3. **ACID Transactions**
   ```sql
   -- Delete document and all chunks atomically
   DELETE FROM pdf_documents WHERE id = $1;
   -- Chunks are CASCADE deleted automatically
   ```
   No synchronization issues between metadata and vectors.

4. **Mature Ecosystem**
   - `pg` driver for Node.js (battle-tested)
   - TypeORM / Prisma support (optional)
   - Excellent monitoring/debugging tools

5. **No Data Duplication**
   Document metadata lives in one place. Chunks reference it. No sync issues.

---

## pgvector Performance

### Indexing Strategies

**pgvector supports multiple index types:**

| Index | Build Time | Query Speed | Recall | Use Case |
|-------|-----------|-------------|--------|----------|
| **No Index** | Instant | Slow (full scan) | 100% | < 1k vectors |
| **IVFFlat** | Fast | Medium | ~95% | 1k - 100k vectors |
| **HNSW** | Slow | Fast | ~98% | > 10k vectors |

**We use HNSW:**
```sql
CREATE INDEX ON pdf_chunks USING hnsw (embedding vector_cosine_ops);
```

**Why HNSW:**
- Better recall than IVFFlat
- Faster queries for our scale (10k-100k chunks)
- Build time is acceptable (minutes, not hours)

### Distance Metrics

```sql
-- Cosine similarity (recommended for normalized embeddings)
embedding <=> query_embedding

-- L2 distance (Euclidean)
embedding <-> query_embedding

-- Inner product
embedding <#> query_embedding
```

**We use cosine similarity** because:
- Standard for text embeddings
- Works with normalized vectors
- Most embedding models output L2-normalized vectors

---

## Embedding Model Choice

**We use `nomic-embed-text` (768 dimensions):**

**Why:**
- Open-source, runs on Ollama locally
- 768 dimensions balance quality vs performance
- Matches what Qdrant uses (consistency across vector stores)

**Alternatives considered:**
- **OpenAI ada-002 (1536 dims):** Costs $0.0001/1k tokens, requires API key
- **Sentence-Transformers (384 dims):** Smaller but lower quality
- **Cohere embed-v3 (1024 dims):** Costs money

**768 dimensions tradeoff:**
- Storage: 768 floats × 4 bytes = 3 KB per embedding
- Index size: ~3 KB × 10k chunks = 30 MB (manageable)
- Query time: ~10ms for 10k vectors with HNSW

---

## Tradeoffs

### What We Gain

- ✅ **Relational Integrity:** Foreign keys, CASCADE deletes
- ✅ **ACID Transactions:** Document + chunks stay consistent
- ✅ **Hybrid Queries:** Vector search + metadata filters in one query
- ✅ **User Isolation:** SQL JOIN enforces ownership
- ✅ **Familiar Tooling:** SQL, pg_admin, standard monitoring
- ✅ **No Data Sync:** Metadata and vectors in same DB

### What We Lose

- ❌ **Peak Performance:** Dedicated vector DBs (Qdrant, Pinecone) are faster
- ❌ **Advanced Features:** No reranking, no hybrid dense+sparse out-of-box
- ❌ **Specialization:** PostgreSQL is general-purpose, not vector-optimized

### What It Costs

- **Query Latency:** ~10-50ms for vector search vs ~5ms in Qdrant (acceptable for our use case)
- **Storage Overhead:** PostgreSQL has more overhead than specialized vector stores
- **Index Build Time:** HNSW index takes minutes for 100k vectors (one-time cost)

---

## Scaling Considerations

### Current Scale

- **10k documents** × **100 chunks/doc** = **1M chunks**
- **1M embeddings** × **3 KB** = **3 GB vector data**
- **HNSW index:** ~5 GB total
- **Query time:** < 50ms with proper index

**Bottleneck:** PostgreSQL can handle this comfortably on modest hardware (4 CPU, 8GB RAM).

### When pgvector Becomes Insufficient

**Triggers:**
1. **> 10M vectors** → Query latency degrades
2. **> 100k QPS** → PostgreSQL CPU-bound
3. **Multi-modal embeddings** (text + image) → Need specialized DB

**Migration Path:**
1. Keep PostgreSQL for metadata (documents table)
2. Move embeddings to Qdrant/Pinecone
3. Application coordinates: Query Qdrant for chunk IDs → Fetch metadata from PostgreSQL

**This is a bridge we'll cross at 10M+ vectors.** We're at 0 now.

---

## Consequences

### Positive

1. **Simplicity:** One database for PDF RAG (vs pgvector + Qdrant duplication)
2. **Consistency:** ACID transactions prevent orphaned chunks
3. **Security:** SQL JOIN enforces user isolation
4. **Debugging:** Standard SQL tools, EXPLAIN ANALYZE

### Negative

1. **Not Optimal for Pure Vector Workloads:** Qdrant would be faster
2. **Index Build Time:** HNSW can take minutes (acceptable for background job)
3. **Storage Cost:** PostgreSQL overhead vs specialized vector stores

### Neutral

1. **Performance:** Good enough for < 10M vectors, not best-in-class

---

## Why Not Qdrant for PDF RAG?

**Qdrant is used in this project (see ADR-004), but for a DIFFERENT use case:**

| Use Case | Database | Why |
|----------|----------|-----|
| **PDF RAG** (structured, per-user documents) | **PostgreSQL + pgvector** | Relational structure, user isolation, ACID transactions |
| **Semantic Memory** (conversational context, shared knowledge) | **Qdrant** | Pure vector search, no relational structure, better performance |

**They solve different problems.**

---

## When Would We Change This Decision?

### Triggers to Reconsider

1. **Scale Beyond 10M Vectors**
   - Mitigation: Shard PostgreSQL by user_id
   - Alternative: Migrate vectors to Qdrant, keep metadata in PostgreSQL

2. **Query Latency Becomes Critical** (> 100ms unacceptable)
   - Mitigation: Tune HNSW parameters, add caching
   - Alternative: Move to Qdrant/Pinecone

3. **Need Advanced Vector Features** (reranking, hybrid search, multi-modal)
   - Mitigation: Implement in application layer
   - Alternative: Use specialized vector DB

4. **Team Prefers NoSQL**
   - Mitigation: This is the wrong reason to change
   - Alternative: N/A (PostgreSQL is the right choice here)

---

## Integration with Qdrant

**Yes, we run BOTH pgvector and Qdrant.**

**pgvector (PostgreSQL):**
- PDF document metadata (filename, user, upload date)
- PDF chunks with embeddings
- Structured queries (user isolation, document ownership)

**Qdrant:**
- Conversational semantic memory (chat context)
- Shared knowledge base (not user-specific)
- Pure vector search workloads

**Why Both:**
- PDF RAG needs relational structure → PostgreSQL
- Semantic memory doesn't need relations → Qdrant
- Using the right tool for each job

**See ADR-004** for Qdrant rationale.

---

## Implementation Details

### Chunking Strategy

```typescript
// Fixed-size chunks with overlap
const CHUNK_SIZE = 1000;  // characters
const CHUNK_OVERLAP = 200; // characters

// Result: 1000-char chunks, last 200 chars repeated in next chunk
```

**Why Overlap:**
- Prevents splitting sentences/paragraphs awkwardly
- Improves context quality for retrieval
- 20% overlap is common practice

**Future Improvement:**
- Semantic chunking (split on paragraphs/sections)
- Preserves natural boundaries

### Query Flow

```typescript
1. User uploads PDF
2. Backend extracts text, chunks
3. AI service generates embeddings (nomic-embed-text)
4. Backend stores document + chunks in PostgreSQL
5. User asks question
6. AI service embeds question
7. PostgreSQL finds similar chunks (vector search + user filter)
8. AI service generates answer with retrieved context
```

---

## References

- [pgvector GitHub](https://github.com/pgvector/pgvector)
- [HNSW Algorithm Explained](https://www.pinecone.io/learn/series/faiss/hnsw/)
- [Vector Database Comparison](https://benchmark.vectorview.ai/)
- [PostgreSQL Connection Pooling Best Practices](https://www.postgresql.org/docs/current/runtime-config-connection.html)

---

**Last Updated:** 2024-04  
**Next Review:** If we exceed 10M vectors or need sub-10ms query latency
