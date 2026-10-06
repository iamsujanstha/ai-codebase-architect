"""Anthropic Messages API. System text is separate from user/assistant history."""

from app.providers.base import Completion, ProviderError
from app.providers.hosted import HostedProvider, split_system


class ClaudeProvider(HostedProvider):
    name = "claude"
    key_environment = "ANTHROPIC_API_KEY"

    def request(self, messages, model):
        system, history = split_system(messages)
        return "messages", {
            "model": model,
            "system": system,
            "messages": history,
            "max_tokens": self.max_tokens,
            "stream": True,
        }

    def decode(self, event, state):
        kind = event.get("type")
        if kind == "message_start":
            usage = event.get("message", {}).get("usage", {})
            state["input"] = usage.get("input_tokens")
        elif kind == "content_block_delta":
            delta = event.get("delta", {})
            if delta.get("type") == "text_delta":
                return [delta["text"]]
        elif kind == "message_delta":
            state["output"] = event.get("usage", {}).get("output_tokens")
            reason = event.get("delta", {}).get("stop_reason")
            if reason:
                state["reason"] = reason
        elif kind == "message_stop":
            reason = state.get("reason")
            if reason not in {"end_turn", "stop_sequence"}:
                raise ProviderError(
                    "The model did not complete a text answer. Check the output limit or revise your request."
                )
            return [Completion(state.get("input"), state.get("output"), reason)]
        return []
