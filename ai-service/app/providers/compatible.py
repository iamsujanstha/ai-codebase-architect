"""Services implementing OpenAI Chat Completions, configured by a trusted operator."""

from app.providers.base import Completion, ProviderError
from app.providers.hosted import HostedProvider


class OpenAICompatibleProvider(HostedProvider):
    name = "openai_compatible"
    key_environment = "AI_API_KEY"

    def request(self, messages, model):
        return "chat/completions", {
            "model": model,
            "messages": messages,
            "stream": True,
            "max_tokens": self.max_tokens,
        }

    def decode(self, event, state):
        usage = event.get("usage") or {}
        if usage:
            state["usage"] = usage
        if event.get("type") == "transport.done":
            if state.get("reason") != "stop":
                raise ProviderError("The provider did not finish a text answer.")
            usage = state.get("usage", {})
            return [
                Completion(usage.get("prompt_tokens"), usage.get("completion_tokens"))
            ]
        result = []
        for choice in event.get("choices", []):
            if choice.get("index", 0) != 0:
                continue
            delta = choice.get("delta") or {}
            if delta.get("refusal") or delta.get("tool_calls"):
                raise ProviderError(
                    "The provider returned a refusal or unsupported tool call."
                )
            if delta.get("content"):
                result.append(delta["content"])
            if choice.get("finish_reason"):
                state["reason"] = choice["finish_reason"]
        return result
