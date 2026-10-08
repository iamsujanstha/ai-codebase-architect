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

    def format_products_for_context(self, products):
        """
        Convert product list into a compact string for the AI system prompt.
        """
        if not products:
            return "No products available in the catalog right now."

        lines = ["Available products in our store:"]
        for p in products:
            lines.append(
                f"- {p['name']} (ID: {p['id']}, Price: ${p['price']}, Slug: {p['slug']}): "
                f"{p.get('shortDescription', p.get('description', ''))[:100]}..."
            )

        lines.append("\nInstructions for you:")
        lines.append("1. If a user asks about a product, mention it and use [PRODUCT:id] to show a card.")
        lines.append("2. If a user wants to add to cart, use [ADD_TO_CART:id].")
        lines.append("3. If a user asks you to CREATE a product, respond with the action tag:")
        lines.append(
            "   [CREATE_PRODUCT:{\"name\":\"...\",\"subtitle\":\"...\",\"shortDescription\":\"...\","
            "\"description\":\"...\",\"price\":99,\"categorySlug\":\"productivity\","
            "\"categoryName\":\"Productivity\",\"heroBadge\":\"New\","
            "\"visual\":{\"gradientFrom\":\"#3b82f6\",\"gradientTo\":\"#8b5cf6\","
            "\"accent\":\"#3b82f6\",\"glyph\":\"package\"}}]"
        )
        lines.append("4. Always surround action tags with helpful descriptive text.")

        return "\n".join(lines)


product_service = ProductService()
