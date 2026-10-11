from __future__ import annotations

import httpx
import logging
import os
import json
import re

logger = logging.getLogger(__name__)

class ProductService:
    def __init__(self):
        self.backend_url = os.getenv("BACKEND_URL", "http://backend:3000")

    async def get_all_products(self):
        """
        Fetch all products from the backend catalog to provide context to the AI.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.backend_url}/catalog/products?limit=48")
                response.raise_for_status()
                data = response.json()
                return data.get("items", [])
        except Exception as e:
            logger.error(f"Failed to fetch products from backend: {e}")
            return []

    async def create_product(self, product_data: dict) -> dict | None:
        """
        Create a new product in the catalog by calling the backend API.
        Used by the AI chat to fulfil create-product requests.
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.backend_url}/catalog/products",
                    json=product_data,
                    timeout=15.0,
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Failed to create product via backend: {e}")
            return None

    def extract_create_product_commands(self, text: str) -> list[dict]:
        """
        Parse [CREATE_PRODUCT:{...}] commands out of a streamed AI response.
        Returns a list of product dicts ready to POST to the catalog API.
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

    def format_products_for_context(self, products, query: str = ""):
        """
        Convert product list into a compact, relevant string for the AI system prompt.
        If a query is provided, score and select the top relevant products so local models
        maintain tight context attention.
        """
        if not products:
            return "No products available in the catalog right now."

        filtered = products
        if query:
            q = query.lower()
            stop = {"what", "is", "the", "of", "for", "and", "are", "out", "list", "show", "price", "tell", "me", "have", "with", "about", "can", "you", "does", "cost", "much"}
            words = [w for w in re.split(r'\W+', q) if len(w) > 2 and w not in stop]
            if words:
                scored = []
                for p in products:
                    name_lower = p.get("name", "").lower()
                    haystack = (name_lower + " " + p.get("categorySlug", "") + " " + (p.get("shortDescription") or p.get("description") or "")).lower()
                    score = sum(3 if w in name_lower else 1 for w in words if w in haystack)
                    if score > 0:
                        scored.append((score, p))
                scored.sort(key=lambda x: x[0], reverse=True)
                if scored:
                    filtered = [p for _, p in scored[:6]]

        lines = ["Available products in our store:"]
        for p in filtered:
            desc = p.get('shortDescription') or p.get('description') or ''
            lines.append(
                f"- {p['name']} (Price: ${p['price']}): {desc[:90]}"
            )
        return "\n".join(lines)


product_service = ProductService()
