"""Opt-in single-corpus reference retrieval. Add authorized tenant scope for SaaS."""

from uuid import NAMESPACE_URL, uuid5

import httpx
from qdrant_client import AsyncQdrantClient, models


class QdrantRetriever:
    def __init__(
        self,
        client: AsyncQdrantClient,
        embeddings: httpx.AsyncClient,
        embedding_model: str,
        collection: str,
        corpus: str,
    ):
        self.client, self.embeddings = client, embeddings
        self.embedding_model, self.collection, self.corpus = (
            embedding_model,
            collection,
            corpus,
        )

    async def embed(self, content: str) -> list[float]:
        response = await self.embeddings.post(
            "/api/embeddings", json={"model": self.embedding_model, "prompt": content}
        )
        response.raise_for_status()
        vector = response.json().get("embedding", [])
        if not vector:
            raise ValueError("Embedding provider returned an empty vector")
        return vector

    async def initialize(self):
        vector = await self.embed("dimension check")
        if not await self.client.collection_exists(self.collection):
            await self.client.create_collection(
                self.collection,
                vectors_config=models.VectorParams(
                    size=len(vector), distance=models.Distance.COSINE
                ),
            )
        info = await self.client.get_collection(self.collection)
        if info.config.params.vectors.size != len(vector):
            raise ValueError(
                "Embedding dimensions differ; use a new collection and reindex"
            )

    async def search(self, query: str) -> list[str]:
        results = await self.client.query_points(
            collection_name=self.collection,
            query=await self.embed(query),
            limit=3,
            query_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="corpus", match=models.MatchValue(value=self.corpus)
                    ),
                    models.FieldCondition(
                        key="embedding_model",
                        match=models.MatchValue(value=self.embedding_model),
                    ),
                ]
            ),
            score_threshold=0.6,
        )
        return [
            item.payload["content"]
            for item in results.points
            if item.payload and isinstance(item.payload.get("content"), str)
        ]

    async def index(self, documents: list[str]) -> int:
        count = 0
        for content in documents:
            if not content.strip():
                continue
            identity = f"{self.corpus}:{self.embedding_model}:{content}"
            await self.client.upsert(
                collection_name=self.collection,
                points=[
                    models.PointStruct(
                        id=str(uuid5(NAMESPACE_URL, identity)),
                        vector=await self.embed(content),
                        payload={
                            "content": content,
                            "corpus": self.corpus,
                            "embedding_model": self.embedding_model,
                        },
                    )
                ],
                wait=True,
            )
            count += 1
        return count
