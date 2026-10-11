# ADR-007: Queue Architecture (RQ)

**Status:** Accepted  
**Date:** 2024-04  
**Decision Makers:** Architecture Team  
**Related:** ADR-005 (Python AI Service), ADR-006 (Redis)

---

## Context

We need to process long-running tasks asynchronously:
- **PDF ingestion** (parsing, chunking, embedding, storing) - takes 5-30 seconds
- **Bulk operations** (re-embed documents, rebuild indexes)
- **Scheduled tasks** (cleanup old data, send reminders)
- **Future:** Email notifications, webhooks, report generation

### Requirements

1. **Asynchronous execution** (don't block HTTP requests)
2. **Retry logic** (handle transient failures)
3. **Job persistence** (survive worker crashes)
4. **Job status tracking** (users can check progress)
5. **Simple deployment** (no complex infrastructure)
6. **Python integration** (AI service is Python)

### Constraints

- Must integrate with existing Python AI service
- Must use existing Redis (no new dependencies)
- Development: single worker process
- Production: multiple workers for scaling

---

## Decision

**We use Python RQ (Redis Queue) for background job processing.**

RQ is already integrated in the AI service for PDF ingestion jobs.

---

## Why RQ?

### 1. Simple

**Job Creation:**
```python
from redis import Redis
from rq import Queue

redis_conn = Redis(host='redis', port=6379)
queue = Queue('pdf_ingestion', connection=redis_conn)

# Enqueue job
job = queue.enqueue(
    process_pdf,
    pdf_id,
    user_id,
    job_timeout='5m',
    retry=Retry(max=3, interval=[10, 30, 60])
)
```

**Worker Execution:**
```bash
# Start worker
rq worker pdf_ingestion --with-scheduler
```

That's it. No complex configuration, no schemas, no protocols.

### 2. Built on Redis

**Benefits:**
- No new infrastructure (already have Redis)
- Job persistence (Redis AOF)
- Atomic operations (queue operations are atomic)
- Low latency (enqueue/dequeue ~1ms)

**Job Storage:**
```
Redis keys:
- rq:queue:pdf_ingestion → List of job IDs
- rq:job:{job_id} → Job data (function, args, status)
- rq:failed → Failed jobs
- rq:finished → Completed jobs
```

### 3. Job Status Tracking

**Check Job Status:**
```python
from rq.job import Job

job = Job.fetch(job_id, connection=redis_conn)

# Job status
status = job.get_status()  # 'queued', 'started', 'finished', 'failed'

# Job result
if job.is_finished:
    result = job.result

# Job error
if job.is_failed:
    error = job.exc_info
```

**Frontend Polling:**
```typescript
// backend/src/pdf/pdf.controller.ts
@Get('jobs/:jobId')
async getJobStatus(@Param('jobId') jobId: string) {
  const response = await axios.get(
    `${aiServiceUrl}/jobs/${jobId}/status`
  );
  
  return {
    status: response.data.status,
    progress: response.data.progress,
    result: response.data.result,
    error: response.data.error,
  };
}

// React polls every 2 seconds
useEffect(() => {
  const interval = setInterval(async () => {
    const status = await checkJobStatus(jobId);
    if (status === 'finished' || status === 'failed') {
      clearInterval(interval);
    }
  }, 2000);
}, [jobId]);
```

### 4. Retry Logic

**Built-in Retry:**
```python
from rq import Retry

queue.enqueue(
    process_pdf,
    pdf_id,
    retry=Retry(max=3, interval=[10, 30, 60])
)

# Retry schedule:
# - First retry: 10 seconds
# - Second retry: 30 seconds
# - Third retry: 60 seconds
```

**Failed Job Handling:**
```python
# Failed jobs go to failed queue
failed_queue = Queue('failed', connection=redis_conn)

# Inspect failed jobs
for job in failed_queue.jobs:
    print(f"Job {job.id} failed: {job.exc_info}")
    
# Retry failed job manually
job.retry()

# Or delete failed job
failed_queue.remove(job.id)
```

### 5. Job Timeout

```python
# Kill job if exceeds timeout
queue.enqueue(
    long_running_task,
    job_timeout='10m'  # 10 minutes
)

# Worker kills job after timeout
# Job status → 'failed'
# Error: JobTimeoutException
```

### 6. Scheduled Jobs

```python
from rq import Scheduler

scheduler = Scheduler(connection=redis_conn)

# Run every day at midnight
scheduler.cron(
    '0 0 * * *',  # Cron expression
    func=cleanup_old_data,
    queue_name='maintenance'
)

# Run once in future
scheduler.enqueue_at(
    datetime(2024, 12, 25, 0, 0),
    send_holiday_email,
    user_id
)
```

---

## Current Implementation

### PDF Ingestion Flow

```
User uploads PDF
  ↓
POST /pdf-rag/upload (FastAPI)
  ↓
Save PDF to disk
  ↓
Enqueue ingestion job
  ↓
Return 202 Accepted + job_id
  ↓
Frontend polls GET /pdf-rag/jobs/{job_id}
  ↓
Worker processes job:
  1. Parse PDF (pypdf)
  2. Chunk text (semantic chunking)
  3. Generate embeddings (nomic-embed-text)
  4. Store in Qdrant
  5. Store metadata in PostgreSQL
  ↓
Job status → 'finished'
  ↓
Frontend shows "PDF ready for RAG"
```

**Code:**
```python
# ai-service/app/api/routes/pdf_rag.py
from rq import Queue

@router.post("/pdf-rag/upload")
async def upload_pdf(
    file: UploadFile,
    user_id: str = Depends(get_current_user)
):
    # Save PDF
    pdf_path = save_uploaded_file(file)
    
    # Enqueue job
    job = pdf_queue.enqueue(
        ingest_pdf,
        pdf_path,
        user_id,
        job_timeout='5m',
        retry=Retry(max=3)
    )
    
    return {
        "job_id": job.id,
        "status": "queued",
        "message": "PDF ingestion started"
    }

@router.get("/pdf-rag/jobs/{job_id}")
async def get_job_status(job_id: str):
    job = Job.fetch(job_id, connection=redis_conn)
    
    return {
        "job_id": job.id,
        "status": job.get_status(),
        "progress": job.meta.get('progress', 0),
        "result": job.result if job.is_finished else None,
        "error": job.exc_info if job.is_failed else None,
    }
```

**Worker:**
```python
# ai-service/app/jobs/ingestion.py
def ingest_pdf(pdf_path: str, user_id: str):
    job = get_current_job()
    
    # Update progress
    job.meta['progress'] = 10
    job.save_meta()
    
    # Parse PDF
    text = parse_pdf(pdf_path)
    job.meta['progress'] = 30
    job.save_meta()
    
    # Chunk text
    chunks = chunk_text(text)
    job.meta['progress'] = 50
    job.save_meta()
    
    # Generate embeddings
    embeddings = embed_chunks(chunks)
    job.meta['progress'] = 70
    job.save_meta()
    
    # Store in Qdrant
    store_embeddings(embeddings, user_id)
    job.meta['progress'] = 90
    job.save_meta()
    
    # Store metadata in PostgreSQL
    store_metadata(pdf_path, user_id)
    job.meta['progress'] = 100
    job.save_meta()
    
    return {
        "chunks": len(chunks),
        "embeddings": len(embeddings),
    }
```

---

## Alternatives Considered

### 1. Celery

**Pros:**
- More features (workflows, chains, chords)
- Battle-tested at scale (Instagram, Reddit)
- Rich monitoring (Flower dashboard)
- Multiple broker support (Redis, RabbitMQ, SQS)

**Cons:**
- **More complex** (requires separate broker + result backend)
- **Heavier** (more dependencies, more configuration)
- **Overkill** (we don't need advanced features)
- **Learning curve** (steeper than RQ)

**Why Not:** Celery is like a Swiss Army knife—lots of features we don't need. RQ is a simple knife—does one thing well. For our scale (<1000 jobs/day), RQ's simplicity wins.

**When Celery Would Be Better:**
- Need workflows (job A → job B → job C with dependencies)
- Need distributed transactions (commit if all jobs succeed)
- Need multiple brokers (RabbitMQ for critical jobs, Redis for non-critical)
- Scale > 10k jobs/sec

### 2. BullMQ (Node.js)

**Pros:**
- TypeScript-native (matches backend)
- Modern API (async/await)
- Priority queues, rate limiting
- UI dashboard (Bull Board)

**Cons:**
- **Wrong language** (AI service is Python, not Node.js)
- **Requires translation** (enqueue in TypeScript, process in Python = complex IPC)
- **Two queue systems** (BullMQ for backend, RQ for AI = unnecessary complexity)

**Why Not:** Our background jobs are all AI-related (PDF ingestion, embeddings). These are Python workloads. Using BullMQ would mean enqueuing in TypeScript and processing in Python, requiring complex inter-process communication. RQ keeps everything in Python.

**When BullMQ Would Be Better:**
- Background jobs are Node.js workloads (image resizing, email sending)
- Team is TypeScript-only (no Python expertise)
- Need Node.js ecosystem integrations

### 3. AWS SQS + Lambda

**Pros:**
- Fully managed (no queue server to maintain)
- Auto-scaling (lambdas scale automatically)
- Pay per use (no idle servers)
- High throughput (unlimited scale)

**Cons:**
- **Vendor lock-in** (AWS-specific, cannot self-host)
- **Cost:** $0.40 per million requests = $400 at 1B jobs/month
- **Cold starts:** Lambda takes 2-5 seconds to warm up (bad UX)
- **Limited execution time:** 15 minute max (PDF ingestion might exceed)
- **Complexity:** SQS + Lambda + IAM + CloudWatch

**Why Not:** SQS+Lambda is for cloud-native, high-scale workloads. We're at <1000 jobs/day, self-hosting is simpler and cheaper. Lambda cold starts (2-5 seconds) make job start unpredictable—RQ starts jobs in <100ms.

**When SQS+Lambda Would Be Better:**
- Already heavily invested in AWS
- Scale > 1M jobs/day
- Bursty workload (0 jobs/hr → 10k jobs/hr)
- Team has no ops expertise (fully managed)

### 4. Kafka + Consumers

**Pros:**
- High throughput (millions of messages/sec)
- Event streaming (not just queues)
- Multi-consumer (multiple services consume same events)
- Event replay (reprocess historical events)

**Cons:**
- **Massive overkill** (designed for event streaming, not job queues)
- **Complex deployment** (Zookeeper, brokers, partitions, replication)
- **Heavy** (requires dedicated servers, GB of RAM)
- **Wrong abstraction** (events ≠ jobs)

**Why Not:** Kafka is for event streaming (user actions, logs, sensor data). Job queues are request-response (enqueue → process → result). Using Kafka for job queues is like using a cargo ship to deliver a package—technically works, but absurdly complex.

**When Kafka Would Be Better:**
- Building event-driven architecture (event sourcing, CQRS)
- Multiple services need same events (order created → inventory, shipping, analytics)
- Need event replay (reprocess last 7 days)
- Scale > 1M events/sec

### 5. Database-Based Queue (PostgreSQL)

**Approach:**
```sql
CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  status VARCHAR(20),
  payload JSONB,
  created_at TIMESTAMP
);

-- Enqueue
INSERT INTO jobs (status, payload) VALUES ('pending', '{"fn": "process_pdf"}');

-- Dequeue
UPDATE jobs SET status = 'processing' WHERE id = (
  SELECT id FROM jobs WHERE status = 'pending' LIMIT 1
) RETURNING *;
```

**Pros:**
- No new infrastructure (already have PostgreSQL)
- ACID transactions (strong consistency)
- SQL queries (complex filtering, analytics)

**Cons:**
- **Slow** (10-50ms per dequeue vs 1ms for Redis)
- **Lock contention** (multiple workers fight for same rows)
- **No built-in retry** (must implement manually)
- **Polling overhead** (workers poll database constantly)

**Why Not:** Databases are optimized for durable storage, not high-speed queues. Redis is 10-50x faster. Database polling creates constant load (100 workers × 10 polls/sec = 1000 queries/sec for idle system).

**When Database Queue Would Be Better:**
- Need ACID transactions (job + database update must be atomic)
- Already using database for everything else
- Job rate is very low (<10 jobs/min)

---

## Rationale

### RQ Fits Our Needs Perfectly

| Requirement | RQ Solution |
|-------------|-------------|
| **Async execution** | Enqueue returns immediately, worker processes in background |
| **Retry logic** | Built-in retry with exponential backoff |
| **Job persistence** | Redis AOF persists jobs |
| **Status tracking** | Job.fetch(id) returns status, progress, result |
| **Simple deployment** | One Redis, one worker process |
| **Python integration** | Native Python library |

### Scale Characteristics

**Current Load:**
- PDF ingestion: ~10 jobs/day
- Future email notifications: ~100 jobs/day
- Future scheduled tasks: ~50 jobs/day
- **Total: <200 jobs/day**

**RQ Capacity:**
- Single worker: ~100 jobs/hour
- Multiple workers: ~1000 jobs/hour
- Redis: ~10k enqueue/dequeue per second

**Result:** RQ can handle 10x-100x our current load.

**Scale Trigger:** If we exceed 10k jobs/day, consider:
- Add more workers (horizontal scaling)
- Optimize job processing (faster workers)
- Shard queues by priority (critical, normal, low)

---

## Tradeoffs

### What We Gain

- ✅ **Simplicity** (2 Redis commands: enqueue, dequeue)
- ✅ **No new infrastructure** (reuses Redis)
- ✅ **Fast** (<1ms enqueue/dequeue)
- ✅ **Job tracking** (status, progress, result)
- ✅ **Retry built-in** (exponential backoff)
- ✅ **Python-native** (fits AI service)

### What We Lose

- ❌ **No advanced workflows** (no job chains, no dependencies)
- ❌ **Single broker** (Redis only, cannot use RabbitMQ)
- ❌ **Basic monitoring** (no Flower-like dashboard)
- ❌ **Python-only** (TypeScript cannot process jobs easily)

### What It Costs

- **Memory:** ~10MB for 1000 queued jobs
- **Redis load:** ~100 ops/sec for 10 workers
- **Worker process:** ~50MB RAM per worker

---

## Consequences

### Positive

1. **PDF ingestion is non-blocking** (users don't wait 30 seconds)
2. **Automatic retry on failure** (transient errors handled)
3. **Job status tracking** (users see progress bar)
4. **Simple codebase** (no complex queue logic)

### Negative

1. **Python-only workers** (cannot easily add TypeScript jobs)
2. **No workflow orchestration** (if job A depends on job B, must implement manually)
3. **Basic monitoring** (must build custom dashboard)

### Neutral

1. **Redis dependency** (already have Redis, not additional complexity)

---

## Job Idempotency

**Problem:** Job enqueued twice (network retry, user double-click)

**Solution:** Idempotency key in job metadata
```python
# Generate idempotency key
idempotency_key = f"pdf_ingest:{pdf_id}:{user_id}"

# Check if already enqueued
existing_job_id = redis_conn.get(f"idem:{idempotency_key}")
if existing_job_id:
    job = Job.fetch(existing_job_id, connection=redis_conn)
    return {"job_id": job.id, "status": job.get_status()}

# Enqueue new job
job = queue.enqueue(ingest_pdf, pdf_id, user_id)

# Store idempotency key (24h TTL)
redis_conn.setex(f"idem:{idempotency_key}", 86400, job.id)

return {"job_id": job.id, "status": "queued"}
```

---

## Monitoring & Observability

### Job Metrics

```python
from rq import Queue
from rq.registry import FailedJobRegistry

# Queue size
queue = Queue('pdf_ingestion', connection=redis_conn)
queue_size = len(queue)

# Failed jobs
failed = FailedJobRegistry(queue=queue)
failed_count = len(failed)

# Metrics endpoint
@app.get("/metrics/jobs")
def job_metrics():
    return {
        "queued": len(queue),
        "failed": len(failed),
        "workers": len(Worker.all(connection=redis_conn)),
    }
```

### Worker Health

```python
from rq.worker import Worker

# Check workers
workers = Worker.all(connection=redis_conn)

for worker in workers:
    print(f"Worker {worker.name}: {worker.state}")
    print(f"  Current job: {worker.get_current_job()}")
    print(f"  Success: {worker.successful_job_count}")
    print(f"  Failed: {worker.failed_job_count}")
```

### Alerting

```python
# Alert if queue size > 100
if len(queue) > 100:
    alert("Job queue backlog: workers may be down")

# Alert if failed jobs > 10
if len(failed) > 10:
    alert("High job failure rate: investigate")

# Alert if no workers
if len(Worker.all(connection=redis_conn)) == 0:
    alert("No workers running!")
```

---

## When Would We Change This Decision?

### Triggers to Migrate from RQ

1. **Need Advanced Workflows**
   - Example: Job A → Job B → Job C with conditional branching
   - Mitigation: Implement simple orchestration in code
   - Alternative: Migrate to Celery

2. **TypeScript Jobs Needed**
   - Example: Image resizing in Node.js
   - Mitigation: Keep RQ for Python, add BullMQ for TypeScript
   - Alternative: Move all jobs to Celery with multi-language support

3. **Scale > 10k Jobs/Sec**
   - Example: Real-time event processing
   - Mitigation: Shard queues, add workers
   - Alternative: Migrate to Kafka

4. **Need Multiple Brokers**
   - Example: Critical jobs on RabbitMQ, non-critical on Redis
   - Mitigation: Run multiple RQ instances
   - Alternative: Migrate to Celery

---

## Future Improvements

### 1. Job Priority Queues

```python
# High priority queue (process first)
high_queue = Queue('high', connection=redis_conn)
high_queue.enqueue(critical_job)

# Low priority queue (process when idle)
low_queue = Queue('low', connection=redis_conn)
low_queue.enqueue(cleanup_job)

# Worker processes high before low
rq worker high low
```

### 2. Scheduled Job Dashboard

```python
# Web UI to view scheduled jobs
# - Job name, schedule, last run, next run
# - Cancel/reschedule jobs
# - View execution history
```

### 3. Job Result Caching

```python
# Cache expensive job results
@cached(ttl=3600)  # 1 hour cache
def expensive_computation():
    # ... heavy work
    return result
```

---

## Interview Answer

**Q: "How do you handle long-running background tasks?"**

**A:** "We use Python RQ (Redis Queue) for background job processing. RQ is perfect for our needs because it's simple, fast, and built on Redis which we already have. When a user uploads a PDF, we immediately return 202 Accepted with a job ID, then enqueue the ingestion job (parsing, chunking, embedding). The frontend polls for job status every 2 seconds. The worker processes the job in the background—if it fails, RQ automatically retries with exponential backoff (10s, 30s, 60s).

The beauty of RQ is its simplicity—enqueue is literally one Redis command. It has built-in retry, job status tracking, and failed job handling. For our scale (< 200 jobs/day), RQ's single-worker setup is plenty. It can handle 100 jobs/hour, giving us 50x headroom.

We chose RQ over Celery because we don't need advanced features (workflows, chains). We chose it over SQS+Lambda because we self-host and Lambda cold starts (2-5 seconds) are bad UX. We chose it over database queues because Redis is 10-50x faster. We combine RQ with idempotency keys to prevent duplicate job processing (network retry, user double-click). The result is reliable, fast, async job processing with minimal complexity."

---

## References

- [RQ Documentation](https://python-rq.org/)
- [RQ vs Celery Comparison](https://testdriven.io/blog/python-queues/)
- [Background Jobs Best Practices](https://brandur.org/job-drain)

---

**Last Updated:** 2024-04  
**Next Review:** If job volume exceeds 10k/day or need workflow orchestration
