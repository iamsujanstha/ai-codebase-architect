import httpx
import logging
import os

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
                # The backend returns { items: [...], total: ... }
                return data.get("items", [])

        except Exception as e:
            logger.error(f"Failed to fetch products from backend: {e}")
            return []

    def format_products_for_context(self, products):
        """
        Convert product list into a compact string for the AI system prompt.
        """
        if not products:
            return "No products available in the catalog right now."

        lines = ["Available products in our store:"]
        for p in products:
            lines.append(f"- {p['name']} (ID: {p['id']}, Price: \${p['price']}, Slug: {p['slug']}): {p['description'][:100]}...")

        
        lines.append("\nInstructions for you:")
        lines.append("1. If a user asks for a product, mention it and use the format [PRODUCT:id] to show a product card.")
        lines.append("2. If a user wants to buy or add to cart, use the format [ADD_TO_CART:id] to trigger the action.")
        lines.append("3. Only recommend products from the list above.")
        
        return "\n".join(lines)

product_service = ProductService()
