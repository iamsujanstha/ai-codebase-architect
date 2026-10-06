import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Compile pure TS modules in memory using the existing compiler dependency.
async function loadModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { streamAiResponse } = await loadModule('../src/core/api/aiApi.ts');
const { buildRequestHistory } = await loadModule('../src/features/chat/history.ts');

function streamResponse(text) {
  const bytes = new TextEncoder().encode(text);
  // One byte per chunk exercises both split JSON lines and split UTF-8 characters.
  return new Response(new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  }));
}

test('stream parser buffers split UTF-8 and the final unterminated JSON line', async (t) => {
  const events = [];
  t.mock.method(globalThis, 'fetch', async () => streamResponse(
    '{"type":"start","requestId":"r","provider":"mock","model":"mock-model","generatedAt":"now"}\n' +
    '{"type":"delta","requestId":"r","delta":"नमस्ते"}\n' +
    '{"type":"done","requestId":"r","provider":"mock","model":"mock-model","generatedAt":"now","timings":{"totalDurationMs":1},"doneReason":"stop"}',
  ));
  await streamAiResponse({ prompt: 'hello', onEvent: (event) => events.push(event) });
  assert.deepEqual(events.map(event => event.type), ['start', 'delta', 'done']);
  assert.equal(events[1].delta, 'नमस्ते');
});

test('stream parser rejects EOF without completion', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => streamResponse('{"type":"delta","requestId":"r","delta":"partial"}\n'));
  await assert.rejects(streamAiResponse({ prompt: 'hello', onEvent() {} }), /before completion/);
});

test('history keeps recent complete messages within API budgets without mutating stored messages', () => {
  const stored = Array.from({ length: 50 }, (_, index) => ({ role: 'user', content: String(index).padEnd(2000, 'x'), status: 'complete' }));
  const history = buildRequestHistory(stored);
  assert.equal(history.length, 16);
  assert.equal(history.at(-1).content, stored.at(-1).content);
  assert.equal(stored.length, 50);
  assert.deepEqual(buildRequestHistory([{ role: 'system', content: 'bad', status: 'complete' }, { role: 'assistant', content: 'partial', status: 'error' }]), []);
});
