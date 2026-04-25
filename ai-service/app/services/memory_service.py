import logging
from datetime import datetime
from uuid import uuid4
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels
from app.config import settings
from app.services.ollama_client import get_embeddings

logger = logging.getLogger(__name__)

class MemoryService:
    """
    Advanced AI Memory Layer using Qdrant.
    
    This service provides 'long-term memory' to the AI by storing and 
    retrieving relevant conversation history using vector embeddings.
    """
    
    def __init__(self):
        self.client = QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)
        self.collection_name = settings.memory_collection
        self._ensure_collection()

    def _ensure_collection(self):
        """Ensure the Qdrant collection exists with the correct vector dimensions."""
        try:
            collections = self.client.get_collections().collections
            exists = any(c.name == self.collection_name for c in collections)
            
            if not exists:
                logger.info("Initializing vector database collection...")
                # Dynamically detect vector size from the configured model
                try:
                    test_vector = get_embeddings("warmup")
                    vector_size = len(test_vector)
                except Exception as e:
                    logger.warning(f"Could not detect vector size, falling back to 4096: {e}")
                    vector_size = 4096
                
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=qmodels.VectorParams(
                        size=vector_size, 
                        distance=qmodels.Distance.COSINE
                    ),
                )
                logger.info(f"Created Qdrant collection: {self.collection_name} (size: {vector_size})")
        except Exception as e:
            logger.error(f"Failed to connect to or initialize Qdrant: {e}")

    async def store_message(self, role: str, content: str, thread_id: str = "default"):
        """Embed and store a message in the vector database."""
        try:
            vector = await get_embeddings(content)
            if not vector:
                return

            self.client.upsert(
                collection_name=self.collection_name,
                points=[
                    qmodels.PointStruct(
                        id=str(uuid4()),
                        vector=vector,
                        payload={
                            "role": role,
                            "content": content,
                            "thread_id": thread_id,
                            "timestamp": datetime.now().isoformat()
                        }
                    )
                ]
            )
        except Exception as e:
            logger.error(f"Failed to store message in memory: {e}")

    async def search_relevant_context(self, query: str, limit: int = 3) -> list[str]:
        """Find past messages that are semantically related to the current query."""
        try:
            vector = await get_embeddings(query)
            if not vector:
                return []

            results = self.client.search(
                collection_name=self.collection_name,
                query_vector=vector,
                limit=limit
            )
            
            # Return content from matches with a decent similarity score
            return [res.payload["content"] for res in results if res.score > 0.6]
        except Exception as e:
            logger.error(f"Failed to search memory: {e}")
            return []


# Singleton instance
memory_service = MemoryService()
