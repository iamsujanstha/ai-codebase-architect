"""OpenAI Responses API text streaming."""

from app.providers.base import Completion, ProviderError
from app.providers.hosted import HostedProvider, split_system


class OpenAIProvider(HostedProvider):
    name = "openai"
    key_environment = "OPENAI_API_KEY"

    def request(self, messages, model):
        system, history = split_system(messages)
        return "responses", {
            "model": model,
            "instructions": system,
            "input": history,
            "stream": True,
            "store": False,
            "max_output_tokens": self.max_tokens,
        }

    def decode(self, event, state):
        kind = event.get("type")
        if kind == "response.output_text.delta":
            return [event["delta"]]
        if kind == "response.refusal.delta":
            raise ProviderError("The model declined to answer this request.")
        if kind in {"response.failed", "response.incomplete"}:
            raise ProviderError(
                "The provider could not finish the answer. Try a shorter request or increase AI_MAX_OUTPUT_TOKENS."
            )
        if kind == "response.completed":
            usage = event.get("response", {}).get("usage") or {}
            return [Completion(usage.get("input_tokens"), usage.get("output_tokens"))]
        return []
