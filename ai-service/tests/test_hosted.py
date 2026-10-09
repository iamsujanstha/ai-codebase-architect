"""Recorded protocol shapes with mocked HTTP; no credentials or paid calls."""

import json
import os
import unittest
from unittest.mock import patch

import httpx

from app.config import Settings
from app.providers.base import Completion, ProviderError
from app.providers.hosted import read_sse
from app.providers.registry import create_provider, provider_connection

MESSAGES = [
    {"role": "system", "content": "Be helpful"},
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi"},
    {"role": "user", "content": "Continue"},
]


def sse(events):
    return "".join(
        "data: " + (event if isinstance(event, str) else json.dumps(event)) + "\n\n"
        for event in events
    )


FIXTURES = {
    "openai": [
        {"type": "response.output_text.delta", "delta": "Hello"},
        {
            "type": "response.completed",
            "response": {"usage": {"input_tokens": 5, "output_tokens": 2}},
        },
    ],
    "claude": [
        {"type": "message_start", "message": {"usage": {"input_tokens": 5}}},
        {"type": "ping"},
        {
            "type": "content_block_delta",
            "delta": {"type": "thinking_delta", "thinking": "private"},
        },
        {
            "type": "content_block_delta",
            "delta": {"type": "text_delta", "text": "Hello"},
        },
        {
            "type": "message_delta",
            "delta": {"stop_reason": "end_turn"},
            "usage": {"output_tokens": 2},
        },
        {"type": "message_stop"},
    ],
    "gemini": [
        {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "private", "thought": True},
                            {"text": "Hello"},
                        ]
                    }
                }
            ]
        },
        {
            "candidates": [{"finishReason": "STOP"}],
            "usageMetadata": {"promptTokenCount": 5, "candidatesTokenCount": 2},
        },
    ],
    "openai_compatible": [
        {"choices": [{"index": 0, "delta": {"content": "Hello"}}]},
        {"choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]},
        {"choices": [], "usage": {"prompt_tokens": 5, "completion_tokens": 2}},
        "[DONE]",
    ],
}


class HostedContracts(unittest.IsolatedAsyncioTestCase):
    async def run_provider(self, name, events=None, status=200):
        config = Settings(
            provider=name,
            model="test-model",
            api_key="test-secret",
            base_url="https://compatible.test/prefix/v1",
        )
        base_url, headers = provider_connection(config)

        def handler(request):
            self.assertNotIn("test-secret", str(request.url))
            self.assertEqual(
                request.headers.get("authorization")
                or request.headers.get("x-api-key")
                or request.headers.get("x-goog-api-key"),
                "Bearer test-secret"
                if name in ("openai", "openai_compatible")
                else "test-secret",
            )
            body = json.loads(request.content)
            if name == "openai":
                self.assertEqual(request.url.path, "/v1/responses")
                self.assertFalse(body["store"])
                self.assertEqual(body["instructions"], "Be helpful")
            elif name == "claude":
                self.assertEqual(request.url.path, "/v1/messages")
                self.assertEqual(body["system"], "Be helpful")
                self.assertTrue(all(m["role"] != "system" for m in body["messages"]))
            elif name == "gemini":
                self.assertEqual(
                    request.url.path, "/v1beta/models/test-model:streamGenerateContent"
                )
                self.assertEqual(body["contents"][1]["role"], "model")
                self.assertEqual(request.url.params["alt"], "sse")
            else:
                self.assertEqual(request.url.path, "/prefix/v1/chat/completions")
            return httpx.Response(
                status, text=sse(FIXTURES[name] if events is None else events)
            )

        async with httpx.AsyncClient(
            base_url=base_url, headers=headers, transport=httpx.MockTransport(handler)
        ) as client:
            provider = create_provider(config, client)
            self.assertEqual((await provider.list_models())[0].name, "test-model")
            return [item async for item in provider.stream(MESSAGES, "test-model")]

    async def test_all_vendors_translate_requests_text_and_usage(self):
        for name in FIXTURES:
            with self.subTest(provider=name):
                items = await self.run_provider(name)
                self.assertEqual(items[0], "Hello")
                self.assertIsInstance(items[-1], Completion)
                self.assertEqual(items[-1].input_tokens, 5)
                self.assertEqual(items[-1].output_tokens, 2)
                self.assertEqual(len(items), 2)

    async def test_each_provider_rejects_truncated_stream(self):
        for name in FIXTURES:
            with (
                self.subTest(provider=name),
                self.assertRaisesRegex(ProviderError, "before completion"),
            ):
                await self.run_provider(name, events=[])

    async def test_http_errors_do_not_expose_keys_or_vendor_body(self):
        for status in [401, 403, 404, 429, 500]:
            with self.subTest(status=status), self.assertRaises(ProviderError) as error:
                await self.run_provider(
                    "openai", events=[{"error": "test-secret"}], status=status
                )
            self.assertNotIn("test-secret", str(error.exception))

    async def test_refusals_and_output_limits_are_not_success(self):
        failures = {
            "openai": [{"type": "response.incomplete"}],
            "claude": [
                {"type": "message_delta", "delta": {"stop_reason": "max_tokens"}},
                {"type": "message_stop"},
            ],
            "gemini": [{"candidates": [{"finishReason": "SAFETY"}]}],
            "openai_compatible": [{"choices": [{"finish_reason": "length"}]}, "[DONE]"],
        }
        for name, events in failures.items():
            with self.subTest(provider=name), self.assertRaises(ProviderError):
                await self.run_provider(name, events)

    async def test_sse_multiline_comments_and_unterminated_last_record(self):
        response = httpx.Response(
            200,
            text=': ping\n\nevent: delta\ndata: {"text":\ndata: "hello"}\n\ndata: [DONE]',
        )
        self.assertEqual(
            [item async for item in read_sse(response)],
            [{"text": "hello"}, {"type": "transport.done"}],
        )

    async def test_empty_completed_response_is_not_a_success(self):
        with self.assertRaisesRegex(ProviderError, "no text answer"):
            await self.run_provider(
                "openai", [{"type": "response.completed", "response": {}}]
            )

    async def test_malformed_sse_is_sanitized(self):
        with self.assertRaisesRegex(ProviderError, "invalid") as error:
            await self.run_provider("openai", ["not-json-test-secret"])
        self.assertNotIn("test-secret", str(error.exception))

    async def test_closing_hosted_iterator_closes_http_response(self):
        class WireStream(httpx.AsyncByteStream):
            closed = False

            async def __aiter__(self):
                yield b'data: {"type":"response.output_text.delta","delta":"hello"}\n\n'
                yield b'data: {"type":"response.completed","response":{}}\n\n'

            async def aclose(self):
                self.closed = True

        wire = WireStream()
        async with httpx.AsyncClient(
            base_url="https://api.openai.com/v1/",
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, stream=wire)
            ),
        ) as client:
            provider = create_provider(
                Settings(provider="openai", model="test", api_key="test"), client
            )
            iterator = provider.stream(MESSAGES, "test")
            next_item = await (anext(iterator) if "anext" in dir(__builtins__) else iterator.__anext__())
            self.assertEqual(next_item, "hello")
            await iterator.aclose()
            self.assertTrue(wire.closed)

    async def test_unknown_models_rejected_without_http_call(self):
        async with httpx.AsyncClient() as client:
            provider = create_provider(
                Settings(provider="openai", model="allowed", api_key="test"), client
            )
            with self.assertRaisesRegex(ProviderError, "configured model"):
                _ = [item async for item in provider.stream(MESSAGES, "not-allowed")]


class ConfigurationContracts(unittest.TestCase):
    def test_env_selects_only_the_matching_key_and_hides_it_in_repr(self):
        for name, key in [
            ("openai", "OPENAI_API_KEY"),
            ("claude", "ANTHROPIC_API_KEY"),
            ("gemini", "GEMINI_API_KEY"),
        ]:
            with (
                self.subTest(provider=name),
                patch.dict(
                    os.environ,
                    {
                        "AI_PROVIDER": name,
                        "AI_MODEL": "test-model",
                        key: "test-secret",
                        "AI_MODELS": "second, test-model",
                    },
                    clear=True,
                ),
            ):
                config = Settings.from_env()
                self.assertEqual(config.api_key, "test-secret")
                self.assertEqual(config.allowed_models, ("test-model", "second"))
                self.assertNotIn("test-secret", repr(config))

    def test_custom_base_url_cannot_include_credentials_or_query(self):
        for url in [
            "https://user:secret@provider.test/v1",
            "https://provider.test?key=secret",
            "file:///tmp/model",
        ]:
            with (
                self.subTest(url=url),
                patch.dict(
                    os.environ,
                    {"AI_PROVIDER": "openai_compatible", "AI_BASE_URL": url},
                    clear=True,
                ),
            ):
                with self.assertRaises(ValueError):
                    Settings.from_env()
