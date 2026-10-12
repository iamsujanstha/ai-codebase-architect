import unittest
import asyncio
from app.embeddings.base import EmbeddingAdapter
from app.embeddings.mock import MockEmbeddingAdapter
from app.embeddings.factory import EmbeddingFactory
from app.vector_store.base import VectorStoreAdapter, VectorPoint
from app.vector_store.memory_adapter import InMemoryVectorStoreAdapter
from app.vector_store.factory import VectorStoreFactory
from app.services.product_service import ProductService


class TestAdaptersAndFactories(unittest.IsolatedAsyncioTestCase):
    async def test_mock_embedding_adapter(self):
        adapter = MockEmbeddingAdapter(dimension=128)
        self.assertEqual(adapter.dimension, 128)

        vec1 = await adapter.get_embedding("apple")
        vec2 = await adapter.get_embedding("apple")
        vec3 = await adapter.get_embedding("banana")

        self.assertEqual(len(vec1), 128)
        self.assertEqual(vec1, vec2)  # Deterministic
        self.assertNotEqual(vec1, vec3)  # Distinct texts produce distinct vectors

    async def test_embedding_factory_and_registration(self):
        # 1. Retrieve mock provider
        mock_provider = EmbeddingFactory.create("mock", dimension=64)
        self.assertIsInstance(mock_provider, MockEmbeddingAdapter)
        self.assertEqual(mock_provider.dimension, 64)

        # 2. Register custom provider
        class CustomEmbeddingAdapter(EmbeddingAdapter):
            @property
            def dimension(self) -> int:
                return 32

            async def get_embedding(self, text: str) -> list[float]:
                return [1.0] * 32

            async def get_embeddings(self, texts: list[str]) -> list[list[float]]:
                return [[1.0] * 32 for _ in texts]

        EmbeddingFactory.register("custom_test", lambda **kw: CustomEmbeddingAdapter())
        custom = EmbeddingFactory.create("custom_test")
        self.assertIsInstance(custom, CustomEmbeddingAdapter)
        vec = await custom.get_embedding("hello")
        self.assertEqual(len(vec), 32)

    async def test_in_memory_vector_store(self):
        store = InMemoryVectorStoreAdapter()
        await store.initialize("test_coll", dimension=3)

        # Insert points
        p1 = VectorPoint(id=1, vector=[1.0, 0.0, 0.0], payload={"name": "X-axis item"})
        p2 = VectorPoint(id=2, vector=[0.0, 1.0, 0.0], payload={"name": "Y-axis item"})
        p3 = VectorPoint(id=3, vector=[0.9, 0.1, 0.0], payload={"name": "Near X item"})
        await store.upsert("test_coll", [p1, p2, p3])

        # Search for vector close to [1.0, 0.0, 0.0]
        results = await store.search("test_coll", query_vector=[1.0, 0.0, 0.0], limit=2, score_threshold=0.5)
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["id"], "1")
        self.assertEqual(results[0]["score"], 1.0)
        self.assertEqual(results[1]["id"], "3")

    async def test_vector_store_factory_registration(self):
        # Retrieve in-memory store via factory
        mem_store = VectorStoreFactory.create("memory")
        self.assertIsInstance(mem_store, InMemoryVectorStoreAdapter)

        # Register custom vector store
        class CustomStore(VectorStoreAdapter):
            async def initialize(self, collection_name: str, dimension: int) -> None: pass
            async def upsert(self, collection_name: str, points: list[VectorPoint]) -> None: pass
            async def search(self, collection_name: str, query_vector: list[float], limit: int = 4, score_threshold: float = 0.55): return []

        VectorStoreFactory.register("custom_vs", lambda **kw: CustomStore())
        custom_vs = VectorStoreFactory.create("custom_vs")
        self.assertIsInstance(custom_vs, CustomStore)

    async def test_product_service_dependency_injection(self):
        mock_emb = MockEmbeddingAdapter(dimension=64)
        mem_store = InMemoryVectorStoreAdapter()
        await mem_store.initialize("catalog_products", dimension=64)

        service = ProductService(
            vector_store=mem_store,
            embedding_provider=mock_emb,
        )
        service._indexed = True
        service.get_all_products = lambda: asyncio.sleep(0, result=[
            {"id": "prod-101", "name": "Ergo Mouse", "price": 49.99}
        ])

        # Verify delegated embedding
        vec = await service.get_embedding("wireless ergonomic mouse")
        self.assertEqual(len(vec), 64)

        # Seed mock product into vector store
        await mem_store.upsert("catalog_products", [
            VectorPoint(id="prod-101", vector=vec, payload={"id": "prod-101", "name": "Ergo Mouse", "price": 49.99})
        ])

        # Search catalog
        results = await service.search_catalog(query="wireless ergonomic mouse", limit=1)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "Ergo Mouse")
        self.assertEqual(results[0]["price"], 49.99)


if __name__ == "__main__":
    unittest.main()
