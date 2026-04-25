import logging
from redis import Redis
from rq import Queue
from app.config import settings

logger = logging.getLogger(__name__)

# Initialize Redis connection and Task Queue
# RQ is a lightweight alternative to Celery, perfect for local AI platforms.
redis_conn = Redis.from_url(settings.redis_url)
task_queue = Queue("ai_tasks", connection=redis_conn)

def enqueue_task(func, *args, **kwargs):
    """
    Asynchronously dispatch a task to the Redis worker.
    The main API will return immediately, while the 'Job Brain' (worker) 
    handles the heavy lifting in the background.
    """
    job = task_queue.enqueue(func, *args, **kwargs)
    logger.info(f"Background task enqueued! Job ID: {job.id}")
    return job.id

# =========================================================
# BACKGROUND JOBS (The 'Job Brain' Logic)
# =========================================================

def process_bulk_embeddings_task(documents: list[str], thread_id: str = "bulk_upload"):
    """
    Heavy task: Generates embeddings for many documents and stores them in Qdrant.
    This function is designed to be executed by the Redis Worker.
    """
    from app.services.memory_service import memory_service
    import asyncio
    
    logger.info(f"Job Brain: Starting bulk processing for {len(documents)} documents...")
    
    # Note: Since the worker runs in a standard Python process (not FastAPI), 
    # we need to handle the async calls if our services are async.
    # For now, we'll use a helper to run the async store_message.
    
    loop = asyncio.get_event_loop()
    
    count = 0
    for doc in documents:
        if not doc.strip():
            continue
            
        # Call our memory service to embed and store
        loop.run_until_complete(
            memory_service.store_message("knowledge_base", doc, thread_id=thread_id)
        )
        count += 1
        
        if count % 5 == 0:
            logger.info(f"Job Brain Progress: {count}/{len(documents)} docs processed.")

    logger.info(f"Job Brain Success: {count} documents are now indexed in Qdrant memory.")
    return {"status": "completed", "count": count}
