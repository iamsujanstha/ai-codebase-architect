from __future__ import annotations

# pyrefly: ignore [missing-import]
import httpx
import logging
import os
import json
import re
from typing import Optional, List, Dict, Any
from app.embeddings import get_embedding_provider, EmbeddingAdapter
from app.vector_store import get_vector_store, VectorStoreAdapter, VectorPoint

logger = logging.getLogger(__name__)

COLLECTION_NAME = "catalog_products"


class ProductService:
    """
    Enterprise Hybrid Retrieval and Catalog Service (Atlassian / Enterprise RAG Pattern).
    
    1. PostgreSQL is the authoritative single source of truth for all product entities,
       exact pricing, inventory, and specifications.
    2. Vector Store Adapter (pgvector by default, Qdrant swappable) provides dense semantic vector retrieval.
    3. The LLM invokes validated search tools with structured filters (category, price bounds, query).
       Raw SQL is NEVER exposed to the LLM.
    4. Search results are returned as structured authoritative entity citations.
    """

    def __init__(
        self,
        vector_store: VectorStoreAdapter | None = None,
        embedding_provider: EmbeddingAdapter | None = None,
        backend_url: str | None = None,
    ):
        self.backend_url = backend_url or os.getenv("BACKEND_URL", "http://backend:3000")
        self.vector_store = vector_store or get_vector_store()
        self.embedding_provider = embedding_provider or get_embedding_provider()
        self._indexed = False

    async def get_embedding(self, text: str) -> list[float]:
        """
        Generate dense semantic vector embedding using the injected EmbeddingAdapter.
        Decoupled from specific backends (Ollama, OpenAI, Mock, etc.).
        """
        try:
            return await self.embedding_provider.get_embedding(text)
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            return []

    async def get_embeddings(self, texts: list[str]) -> list[list[float]]:
        """
        Generate batch semantic embeddings using the injected EmbeddingAdapter.
        """
        try:
            return await self.embedding_provider.get_embeddings(texts)
        except Exception as e:
            logger.error(f"Failed to generate batch embeddings: {e}")
            return [[] for _ in texts]

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
        Ensure vector index is synchronized with the PostgreSQL catalog.
        Delegated to the configured VectorStoreAdapter (pgvector by default, Qdrant swappable).
        """
        if self._indexed and not force:
            return

        try:
            # Dimension check vector
            sample_vec = await self.get_embedding("sample catalog item")
            if not sample_vec:
                logger.warning("Embedding service not ready; skipping vector indexing for now.")
                return

            await self.vector_store.initialize(COLLECTION_NAME, len(sample_vec))

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
                    VectorPoint(
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
                await self.vector_store.upsert(COLLECTION_NAME, points=points)
                logger.info(f"Synchronized {len(points)} products to vector store index.")
                self._indexed = True
        except Exception as e:
            logger.error(f"Error indexing catalog to vector store: {e}")

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

        # 2. If natural language query is provided, apply hybrid semantic vector + lexical ranking
        if query and query.strip():
            q_clean = query.strip().lower()
            query_tokens = [t for t in re.split(r'\W+', q_clean) if len(t) > 2]

            await self.ensure_catalog_indexed()
            q_vec = await self.get_embedding(query.strip())
            score_map: dict[str, float] = {}
            if q_vec:
                try:
                    search_res = await self.vector_store.search(
                        collection_name=COLLECTION_NAME,
                        query_vector=q_vec,
                        limit=limit * 2,
                        score_threshold=0.48,
                    )
                    score_map = {
                        str(pt.get("id")): float(pt.get("score", 0.0))
                        for pt in search_res
                    }
                except Exception as e:
                    logger.warning(f"Semantic search query error: {e}")

            # Hybrid scoring: combine dense vector score with authoritative lexical token matches
            scored_items = []
            for p in filtered_products:
                pid = str(p.get("id"))
                score = score_map.get(pid, 0.0)
                name_lower = (p.get("name") or "").lower()
                desc_lower = (p.get("shortDescription") or p.get("description") or "").lower()

                # Exact keyword matching boost
                is_name_match = False
                is_desc_match = False
                for token in query_tokens:
                    if re.search(r'\b' + re.escape(token) + r'\b', name_lower):
                        score += 0.35
                        is_name_match = True
                    elif re.search(r'\b' + re.escape(token) + r'\b', desc_lower):
                        score += 0.15
                        is_desc_match = True

                if score >= 0.48 or is_name_match or is_desc_match:
                    scored_items.append((is_name_match, score, p))

            # If user explicitly requested products that match catalog product names directly, return only those!
            name_lexical_items = [p for is_name, _, p in scored_items if is_name]
            if name_lexical_items:
                return name_lexical_items[:limit]

            scored_items.sort(key=lambda x: x[1], reverse=True)
            ranked_products = [p for _, _, p in scored_items]

            if ranked_products:
                return ranked_products[:limit]
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
            ollama_url = os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434").rstrip("/")
            model_name = os.getenv("AI_MODEL") or os.getenv("DEFAULT_MODEL") or "atlas-concierge:latest"
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(
                    f"{ollama_url}/api/generate",
                    json={
                        "model": model_name,
                        "prompt": prompt,
                        "stream": False,
                        "options": {
                            "temperature": 0.0,
                            "stop": ["\n", "Query:"],
                        },
                    },
                )
                if res.status_code == 200:
                    intent_text = res.json().get("response", "").strip().strip('"\'“”`').strip()
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
        q_clean = re.sub(r'\b(show|me|list|out|tell|about|what|are|the|some|any|all|available|can|you|find|only|just|to|display|get|give|look|for)\b', '', q_clean)
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
                
                # Re-index to keep vector store in sync with PostgreSQL
                if created and "id" in created:
                    p = created
                    text = f"{p.get('name', '')} {p.get('categoryName', '')} {p.get('subtitle', '')}. {p.get('shortDescription', '')}. {p.get('description', '')}"
                    vec = await self.get_embedding(text)
                    if vec:
                        await self.vector_store.upsert(
                            COLLECTION_NAME,
                            points=[
                                VectorPoint(
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
