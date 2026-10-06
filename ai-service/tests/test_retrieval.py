import unittest

import httpx
from qdrant_client import AsyncQdrantClient

from app.retrieval.qdrant import QdrantRetriever


class RetrievalContracts(unittest.IsolatedAsyncioTestCase):
    async def test_index_is_idempotent_and_search_filters_corpus(self):
        async with httpx.AsyncClient(
            base_url="http://embeddings.test",
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, json={"embedding": [1.0, 0.0, 0.0]})
            ),
        ) as embeddings:
            database = AsyncQdrantClient(location=":memory:")
            try:
                first = QdrantRetriever(
                    database, embeddings, "embedding-v1", "knowledge", "first"
                )
                other = QdrantRetriever(
                    database, embeddings, "embedding-v1", "knowledge", "other"
                )
                await first.initialize()
                await first.index(["Visible policy"])
                await first.index(["Visible policy"])
                await other.index(["Other corpus policy"])
                self.assertEqual((await database.count("knowledge")).count, 2)
                self.assertEqual(await first.search("policy"), ["Visible policy"])
            finally:
                await database.close()

    async def test_dimension_mismatch_fails_without_recreating_collection(self):
        database = AsyncQdrantClient(location=":memory:")
        try:
            from qdrant_client.models import Distance, VectorParams

            await database.create_collection(
                "knowledge",
                vectors_config=VectorParams(size=2, distance=Distance.COSINE),
            )
            async with httpx.AsyncClient(
                base_url="http://embeddings.test",
                transport=httpx.MockTransport(
                    lambda request: httpx.Response(
                        200, json={"embedding": [1.0, 0.0, 0.0]}
                    )
                ),
            ) as embeddings:
                retriever = QdrantRetriever(
                    database, embeddings, "v2", "knowledge", "first"
                )
                with self.assertRaisesRegex(ValueError, "dimensions differ"):
                    await retriever.initialize()
                self.assertEqual(
                    (
                        await database.get_collection("knowledge")
                    ).config.params.vectors.size,
                    2,
                )
        finally:
            await database.close()
