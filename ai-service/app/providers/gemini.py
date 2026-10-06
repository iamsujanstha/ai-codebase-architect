"""Gemini Developer API text streaming (not Vertex AI authentication)."""

from urllib.parse import quote

from app.providers.base import Completion, ProviderError
from app.providers.hosted import HostedProvider, split_system


class GeminiProvider(HostedProvider):
    name = "gemini"
    key_environment = "GEMINI_API_KEY"

    def request(self, messages, model):
        system, history = split_system(messages)
        model_id = quote(model.removeprefix("models/"), safe="")
        return f"models/{model_id}:streamGenerateContent?alt=sse", {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [
                {
                    "role": "model" if m["role"] == "assistant" else "user",
                    "parts": [{"text": m["content"]}],
                }
                for m in history
            ],
            "generationConfig": {
                "maxOutputTokens": self.max_tokens,
                "candidateCount": 1,
            },
        }

    def decode(self, event, state):
        if event.get("promptFeedback", {}).get("blockReason"):
            raise ProviderError("The model declined to answer this request.")
        usage = event.get("usageMetadata") or {}
        state.update({key: value for key, value in usage.items() if value is not None})
        candidates = event.get("candidates", [])
        if not candidates:
            return []
        candidate = candidates[0]
        result = [
            part["text"]
            for part in candidate.get("content", {}).get("parts", [])
            if isinstance(part.get("text"), str) and not part.get("thought")
        ]
        reason = candidate.get("finishReason")
        if reason:
            if reason != "STOP":
                raise ProviderError(
                    "The model could not finish a text answer. Check the output limit or revise your request."
                )
            result.append(
                Completion(
                    state.get("promptTokenCount"),
                    state.get("candidatesTokenCount"),
                    reason,
                )
            )
        return result
