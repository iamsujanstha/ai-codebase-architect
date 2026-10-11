from __future__ import annotations

import httpx
import logging
import os
import json
import re
from typing import Optional, List, Dict, Any
from qdrant_client import AsyncQdrantClient, models

logger = logging.getLogger(__name__)

COLLECTION_NAME = "catalog_products"
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL") or "nomic-embed-text:latest"


class ProductService:
    """
    Enterprise Hybrid Retrieval and Catalog Service (Atlassian / Enterprise RAG Pattern).
    
    1. PostgreSQL is the authoritative single source of truth for all product entities,
       exact pricing, inventory, and specifications.
    2. Qdrant provides dense semantic vector retrieval for natural language discovery.
    3. The LLM invokes validated search tools with structured filters (category, price bounds, query).
       Raw SQL is NEVER exposed to the LLM.
    4. Search results are returned as structured authoritative entity citations.
    """

    def __init__(self):
        self.backend_url = os.getenv("BACKEND_URL", "http://backend:3000")
        self.ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
        qdrant_host = os.getenv("QDRANT_HOST", "vector-db")
        qdrant_port = os.getenv("QDRANT_PORT", "6333")
        self.qdrant_url = os.getenv("QDRANT_URL", f"http://{qdrant_host}:{qdrant_port}")
        self._qdrant_client: Optional[AsyncQdrantClient] = None
        self._indexed = False

    def get_qdrant_client(self) -> AsyncQdrantClient:
        if self._qdrant_client is None:
            self._qdrant_client = AsyncQdrantClient(url=self.qdrant_url, check_compatibility=False)
        return self._qdrant_client

    async def get_embedding(self, text: str) -> list[float]:
        """
        Generate a 768-dim dense semantic vector embedding using nomic-embed-text via /api/embed.
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{self.ollama_base_url}/api/embed",
                    json={"model": EMBEDDING_MODEL, "input": text},
                )
                if res.status_code == 200:
                    embs = res.json().get("embeddings", [])
                    if embs and len(embs) > 0:
                        return embs[0]

                # Fallback to /api/embeddings
                res_legacy = await client.post(
                    f"{self.ollama_base_url}/api/embeddings",
                    json={"model": EMBEDDING_MODEL, "prompt": text},
                )
                if res_legacy.status_code == 200:
                    return res_legacy.json().get("embedding", [])
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            return []
        return []

    async def get_all_products(self) -> list[dict]:
        """
        Fetch all products from PostgreSQL authoritative catalog.
        """
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.backend_url}/catalog/products?limit=100")
                response.raise_for_status()
                data = response.json()
                return data.get("items", [])
        except Exception as e:
            logger.error(f"Failed to fetch products from backend: {e}")
            return []

    async def ensure_catalog_indexed(self, force: bool = False) -> None:
        """
        Ensure Qdrant has a synchronized vector index of the PostgreSQL catalog.
        """
        if self._indexed and not force:
            return

        try:
            client = self.get_qdrant_client()
            collection_exists = await client.collection_exists(COLLECTION_NAME)
            
            # Dimension check vector
            sample_vec = await self.get_embedding("sample catalog item")
            if not sample_vec:
                logger.warning("Embedding service not ready; skipping vector indexing for now.")
                return

            if not collection_exists:
                await client.create_collection(
                    COLLECTION_NAME,
                    vectors_config=models.VectorParams(size=len(sample_vec), distance=models.Distance.COSINE),
                )

            products = await self.get_all_products()
            if not products:
                return

            points = []
            for p in products:
                try:
                    p_id = int(p["id"])
                except (ValueError, TypeError):
                    continue

                text = f"{p['name']} | Category: {p.get('categoryName', '')} {p.get('subtitle', '')}. {p.get('shortDescription', '')}. {p.get('description', '')}. Tags: {' '.join(p.get('tags') or [])}"
                vec = await self.get_embedding(text)
                if not vec:
                    continue

                points.append(
                    models.PointStruct(
                        id=p_id,
                        vector=vec,
                        payload={
                            "product_id": str(p["id"]),
                            "name": p["name"],
                            "category": p.get("categorySlug", ""),
                            "price": float(p.get("price", 0)),
                        },
                    )
                )

            if points:
                await client.upsert(COLLECTION_NAME, points=points)
                logger.info(f"Synchronized {len(points)} products to Qdrant semantic index.")
                self._indexed = True
        except Exception as e:
            logger.error(f"Error indexing catalog to Qdrant: {e}")

    async def search_catalog(
        self,
        query: Optional[str] = None,
        category: Optional[str] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        limit: int = 4,
    ) -> list[dict]:
        """
        Validated Hybrid Search Tool:
        - Combines PostgreSQL authoritative attributes with Qdrant dense vector similarity.
        - Structured filters (category, price) are strictly evaluated against PostgreSQL.
        - Semantic query provides ranking when natural language discovery is used.
        - Returns authoritative PostgreSQL product records.
        """
        all_products = await self.get_all_products()
        if not all_products:
            return []

        # 1. Apply exact structured filters against authoritative PostgreSQL catalog
        filtered_products = all_products
        if category:
            cat_clean = category.strip().lower()
            filtered_products = [
                p for p in filtered_products
                if (p.get("categorySlug") or "").lower() == cat_clean
                or (p.get("categoryName") or "").lower() == cat_clean
            ]

        if min_price is not None:
            filtered_products = [p for p in filtered_products if float(p.get("price", 0)) >= min_price]

        if max_price is not None:
            filtered_products = [p for p in filtered_products if float(p.get("price", 0)) <= max_price]

        # 2. If natural language query is provided, apply semantic vector ranking via Qdrant
        if query and query.strip():
            await self.ensure_catalog_indexed()
            q_vec = await self.get_embedding(query.strip())
            if q_vec:
                try:
                    client = self.get_qdrant_client()
                    search_res = await client.query_points(
                        collection_name=COLLECTION_NAME,
                        query=q_vec,
                        limit=limit * 2,
                        score_threshold=0.55,
                    )
                    score_map = {
                        str(pt.payload.get("product_id")): pt.score
                        for pt in search_res.points
                        if pt.payload
                    }
                    
                    # Sort filtered authoritative items by semantic similarity score
                    scored_items = []
                    for p in filtered_products:
                        pid = str(p.get("id"))
                        if pid in score_map:
                            scored_items.append((score_map[pid], p))
                    
                    scored_items.sort(key=lambda x: x[0], reverse=True)
                    ranked_products = [p for _, p in scored_items]
                    
                    # If semantic items passed threshold, return them
                    if ranked_products:
                        return ranked_products[:limit]
                    # If query was given but no items reached similarity threshold, return empty
                    return []
                except Exception as e:
                    logger.warning(f"Semantic search query error: {e}")
                    return []

        return filtered_products[:limit]

    async def extract_semantic_intent(self, user_prompt: str) -> dict:
        """
        Translates customer natural language query into concrete semantic search intent via LLM.
        Pipeline:
        Semantic Query ("Something comfortable for long walks")
            ↓
           LLM
            ↓
        Semantic Intent ("walking shoes sneakers athletic footwear")
            ↓
          Qdrant
        """
        # Baseline regex extraction for prices and structured hints
        filters = self.extract_search_filters(user_prompt)

        try:
            prompt = (
                "You are an eCommerce search query understanding module for Atlas Commerce.\n"
                "Translate the user's natural language shopping request into concise English search keywords "
                "representing the concrete physical items they want to buy.\n\n"
                "Examples:\n"
                "Query: \"Something comfortable for long walks\"\n"
                "Intent: \"walking shoes sneakers athletic footwear\"\n\n"
                "Query: \"Something comfortable to sit on for long coding sessions\"\n"
                "Intent: \"ergonomic office chair desk chair\"\n\n"
                "Query: \"A crisp display for my laptop\"\n"
                "Intent: \"4K computer monitor screen\"\n\n"
                "Query: \"A quiet mouse for work\"\n"
                "Intent: \"silent ergonomic wireless mouse\"\n\n"
                f"Query: \"{user_prompt}\"\n"
                "Intent:"
            )
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(
                    f"{self.ollama_base_url}/api/generate",
                    json={
                        "model": os.getenv("DEFAULT_MODEL", "qwen"),
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.0,
                            "stop": ["\n", "Query:"],
                        },
                    },
                )
                if res.status_code == 200:
                    intent_text = res.json().get("response", "").strip().strip('"').strip()
                    if intent_text and len(intent_text) > 2:
                        filters["query"] = intent_text
                        logger.info(f"LLM semantic intent extracted: '{user_prompt}' -> '{intent_text}'")
        except Exception as e:
            logger.warning(f"LLM semantic intent extraction failed, using fallback filters: {e}")

        return filters

    def extract_search_filters(self, user_prompt: str) -> dict:
        """
        Extract validated search tool arguments (query, category, price bounds)
        from customer prompt without manual synonym tables.
        """
        text = user_prompt.lower()
        filters: dict[str, Any] = {"query": user_prompt}

        # Price bounds extraction (e.g. "under $1000", "< 500", "over $50", "between 50 and 200")
        under_match = re.search(r'(?:under|below|less than|max(?:imum)?)\s*[$]?\s*(\d+(?:\.\d+)?)', text)
        if under_match:
            filters["max_price"] = float(under_match.group(1))

        over_match = re.search(r'(?:over|above|more than|min(?:imum)?)\s*[$]?\s*(\d+(?:\.\d+)?)', text)
        if over_match:
            filters["min_price"] = float(over_match.group(1))

        between_match = re.search(r'between\s*[$]?\s*(\d+(?:\.\d+)?)\s*(?:and|to)\s*[$]?\s*(\d+(?:\.\d+)?)', text)
        if between_match:
            filters["min_price"] = float(between_match.group(1))
            filters["max_price"] = float(between_match.group(2))

        # Category recognition
        categories = ["electronics", "furniture", "books", "accessories", "software"]
        for cat in categories:
            if re.search(r'\b' + cat + r'\b', text):
                filters["category"] = cat
                break

        # Clean query for dense semantic search
        q_clean = text
        q_clean = re.sub(r'(?:under|below|less than|max(?:imum)?|over|above|min(?:imum)?)\s*[$]?\s*\d+(?:\.\d+)?', '', q_clean)
        q_clean = re.sub(r'between\s*[$]?\s*\d+(?:\.\d+)?\s*(?:and|to)\s*[$]?\s*\d+(?:\.\d+)?', '', q_clean)
        q_clean = re.sub(r'\b(show|me|list|out|tell|about|what|are|the|some|any|all|available|can|you|find)\b', '', q_clean)
        q_clean = re.sub(r'\s+', ' ', q_clean).strip()
        if q_clean:
            filters["query"] = q_clean

        return filters

    async def create_product(self, product_data: dict) -> dict | None:
        """
        Create a new product in PostgreSQL catalog and update the Qdrant index.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.backend_url}/catalog/products",
                    json=product_data,
                    timeout=15.0,
                )
                response.raise_for_status()
                created = response.json()
                
                # Re-index to keep Qdrant in sync with PostgreSQL
                if created and "id" in created:
                    p = created
                    text = f"{p.get('name', '')} {p.get('categoryName', '')} {p.get('subtitle', '')}. {p.get('shortDescription', '')}. {p.get('description', '')}"
                    vec = await self.get_embedding(text)
                    if vec:
                        client_q = self.get_qdrant_client()
                        await client_q.upsert(
                            COLLECTION_NAME,
                            points=[
                                models.PointStruct(
                                    id=int(p["id"]),
                                    vector=vec,
                                    payload={
                                        "product_id": str(p["id"]),
                                        "name": p.get("name", ""),
                                        "category": p.get("categorySlug", ""),
                                        "price": float(p.get("price", 0)),
                                    },
                                )
                            ],
                        )
                return created
        except Exception as e:
            logger.error(f"Failed to create product via backend: {e}")
            return None

    def extract_create_product_commands(self, text: str) -> list[dict]:
        """
        Parse [CREATE_PRODUCT:{...}] commands out of a streamed AI response.
        """
        results = []
        pattern = r'\[CREATE_PRODUCT:(\{.*?\})\]'
        matches = re.findall(pattern, text, re.DOTALL)
        for raw_json in matches:
            try:
                data = json.loads(raw_json)
                results.append(data)
            except json.JSONDecodeError:
                logger.warning(f"Malformed CREATE_PRODUCT JSON: {raw_json}")
        return results


product_service = ProductService()
