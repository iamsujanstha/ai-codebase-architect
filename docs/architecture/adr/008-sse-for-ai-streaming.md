# ADR-008: Server-Sent Events (SSE) for AI Streaming

**Status:** Accepted  
**Date:** 2024-04  
**Decision Makers:** Architecture Team  
**Related:** ADR-005 (Python AI Service)

---

## Context

AI generation is slow (10-30 seconds for typical response). Users staring at a loading spinner for 30 seconds creates a poor experience. We need to stream tokens as they're generated, providing immediate feedback.

### Requirements

1. **Real-time streaming** (tokens appear as generated, not batch)
2. **Unidirectional** (server → client only, client doesn't send mid-stream)
3. **Simple implementation** (minimize protocol complexity)
4. **Browser compatibility** (works without special client libraries)
5. **Proxy-friendly** (works through Nginx, CloudFlare)
6. **Reliable** (handle disconnects, retries)

### Constraints

- Frontend is React (browser-based)
- Backend is NestJS (TypeScript)
- AI service is FastAPI (Python)
- Must work through Nginx reverse proxy
- Development and production use same protocol

---

## Decision

**We use Server-Sent Events (SSE) with NDJSON encoding for AI response streaming.**

SSE provides unidirectional streaming from server to client over HTTP, perfect for AI token streaming.

---

## What is SSE?

**Server-Sent Events** (SSE) is an HTTP-based protocol for server-to-client streaming.

**How It Works:**
```
Client opens connection:
  GET /ai/generate/stream
  Accept: text/event-stream

Server responds:
  HTTP/1.1 200 OK
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive

  data: {"token": "Hello"}\n\n
  data: {"token": " world"}\n\n
  data: {"token": "!"}\n\n
  data: {"done": true}\n\n
```

**Client receives tokens in real-time:**
```typescript
const eventSource = new EventSource('/ai/generate/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.token) {
    setResponse(prev => prev + data.token);
  }
};
```

---

## Why SSE?

### 1. Simple Protocol

**SSE (What We Use):**
```
GET /stream
Accept: text/event-stream

HTTP/1.1 200 OK
Content-Type: text/event-stream

data: {"token": "Hello"}\n\n
data: {"token": " world"}\n\n
```

**No handshake, no protocol negotiation, just HTTP.**

### 2. Browser Native

```typescript
// Built into browsers, no library needed
const eventSource = new EventSource('/ai/generate/stream');

eventSource.onmessage = (event) => {
  console.log(event.data); // Token received
};

eventSource.onerror = (error) => {
  console.error('Connection error');
};

// Close when done
eventSource.close();
```

**vs WebSocket:**
```typescript
// Requires client library for proper handling
const ws = new WebSocket('ws://example.com/stream');

ws.onopen = () => {
  // Must send initial message
  ws.send(JSON.stringify({ type: 'start' }));
};

ws.onmessage = (event) => {
  console.log(event.data);
};

// Handle reconnection manually
ws.onerror = () => {
  // Must implement reconnect logic
};
```

### 3. Auto-Reconnect

```typescript
// SSE automatically reconnects on disconnect
const eventSource = new EventSource('/stream');

// Connection lost (network issue, server restart)
// Browser automatically reconnects
// No code needed!

// Manual reconnect control:
eventSource.onerror = (error) => {
  if (shouldRetry) {
    // Browser will retry automatically
    console.log('Connection lost, retrying...');
  } else {
    eventSource.close(); // Stop retrying
  }
};
```

### 4. Proxy-Friendly

**SSE is HTTP, works through any HTTP proxy:**
```nginx
# Nginx configuration for SSE
location /ai/generate/stream {
    proxy_pass http://backend:3000;
    proxy_http_version 1.1;
    
    # Critical: Disable buffering for streaming
    proxy_buffering off;
    
    # Keep connection alive
    proxy_read_timeout 300s;
    
    # Forward headers
    proxy_set_header Connection '';
    proxy_set_header X-Accel-Buffering no;
}
```

**WebSocket requires special proxy config:**
```nginx
# WebSocket requires upgrade headers
location /ws {
    proxy_pass http://backend:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    # ... more complex
}
```

### 5. HTTP/2 Multiplexing

SSE works over HTTP/2, allowing multiple streams over single connection:

```
Single TCP connection:
  /ai/generate/stream (AI response 1) ───┐
  /ai/generate/stream (AI response 2) ───┼─→ HTTP/2 connection
  /catalog/products (JSON response)   ───┘
```

**Benefit:** No connection limit (browsers limit 6 connections per domain for HTTP/1.1)

---

## Current Implementation

### Flow

```
User sends prompt
  ↓
POST /ai/generate/stream
  ↓
NestJS (Backend)
  ↓
Proxy to FastAPI (AI Service)
  POST http://ai-service:8000/generate/stream
  ↓
FastAPI generates tokens
  ↓
Stream back to NestJS
  ↓
NestJS streams to React
  ↓
React displays tokens in real-time
```

### Backend (NestJS)

```typescript
// backend/src/ai/ai.service.ts
async streamResponse(
  prompt: string,
  messages: ChatMessageDto[],
  model: string,
  response: Response,
): Promise<void> {
  const abortController = new AbortController();
  
  try {
    // Call AI service
    const upstreamResponse = await axios.post(
      `${this.aiServiceUrl}/generate/stream`,
      { prompt, messages, model },
      {
        timeout: this.streamTimeoutMs,
        responseType: 'stream',  // Important: stream response
        signal: abortController.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/x-ndjson',  // NDJSON format
        },
      },
    );

    // Set SSE headers
    response.status(200);
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');  // Disable Nginx buffering
    response.flushHeaders();

    // Pipe AI service stream to client
    upstreamResponse.data.pipe(response);
    
    // Handle disconnect
    response.once('close', () => upstreamResponse.data.destroy());
  } catch (error) {
    abortController.abort();
    throw error;
  }
}
```

### AI Service (FastAPI)

```python
# ai-service/app/api/routes/generate.py
from fastapi.responses import StreamingResponse

@router.post("/generate/stream")
async def generate_stream(request: GenerateRequest):
    async def event_generator():
        # Stream tokens from LLM
        async for token in llm.stream(request.prompt):
            # NDJSON format: one JSON per line
            yield json.dumps({"token": token}) + "\n"
        
        # Signal completion
        yield json.dumps({"done": True}) + "\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )
```

### Frontend (React)

```typescript
// Custom hook for SSE streaming
function useAIStream() {
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamGenerate = async (prompt: string) => {
    setLoading(true);
    setResponse('');
    setError(null);

    try {
      // Use fetch with streaming
      const res = await fetch('/api/ai/generate/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) throw new Error('Stream failed');

      // Read NDJSON stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Decode chunk
        const chunk = decoder.decode(value, { stream: true });
        
        // Parse NDJSON (one JSON per line)
        const lines = chunk.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            
            if (data.token) {
              // Append token to response
              setResponse(prev => prev + data.token);
            }
            
            if (data.done) {
              setLoading(false);
              return;
            }
          } catch (e) {
            console.warn('Failed to parse line:', line);
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return { response, loading, error, streamGenerate };
}

// Usage in component
function ChatInterface() {
  const { response, loading, streamGenerate } = useAIStream();

  const handleSubmit = () => {
    streamGenerate(prompt);
  };

  return (
    <div>
      {loading && <div>Generating...</div>}
      <div className="response">
        {response}
        {loading && <span className="cursor">▌</span>}
      </div>
    </div>
  );
}
```

---

## NDJSON Format

**Why NDJSON (Newline Delimited JSON)?**

**SSE Standard Format:**
```
data: {"token": "Hello"}\n\n
data: {"token": " world"}\n\n
```

**NDJSON Format (What We Use):**
```
{"token": "Hello"}\n
{"token": " world"}\n
```

**Benefits:**
- Simpler parsing (split by `\n`, parse each line)
- No `data:` prefix required
- Standard format (used by OpenAI API, Anthropic API)
- Works with non-browser clients (curl, Python requests)

**Example:**
```bash
# Test with curl
curl -N http://localhost:3000/ai/generate/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello"}' \
| while read line; do echo "$line"; done

# Output:
{"token": "Hello"}
{"token": " there"}
{"token": "!"}
{"done": true}
```

---

## Alternatives Considered

### 1. WebSockets

**Pros:**
- Bidirectional (client can send messages mid-stream)
- Lower latency (no HTTP overhead per message)
- Binary data support

**Cons:**
- **Overkill** (we don't need bidirectional communication)
- **More complex protocol** (handshake, ping/pong, close frames)
- **No auto-reconnect** (must implement manually)
- **Proxy issues** (requires special configuration)
- **State management** (must track connection state)

**Why Not:** WebSockets are for bidirectional, real-time communication (chat, gaming). AI streaming is unidirectional (server → client only). SSE is simpler and sufficient.

**When WebSockets Would Be Better:**
- Need bidirectional communication (user interrupts generation)
- Need binary data (streaming images, audio)
- Building real-time collaboration (multiplayer, live editing)

### 2. Long Polling

**Approach:**
```typescript
// Client requests
GET /ai/generate?prompt=Hello

// Server processes
// ... generating token 1
// ... generating token 2
// ... generating token 3

// Server responds after completion
{ "response": "Hello there!" }

// Client requests again for next interaction
```

**Pros:**
- Simple (just repeated HTTP requests)
- Works everywhere (no special protocol)

**Cons:**
- **Not real-time** (wait for entire response before showing)
- **Poor UX** (30 second wait with no feedback)
- **Inefficient** (new connection per poll)
- **Server load** (hundreds of concurrent long polls)

**Why Not:** Long polling was used before SSE/WebSockets existed. It's inferior in every way—slower, less efficient, worse UX.

### 3. HTTP Chunked Transfer Encoding

**Approach:**
```typescript
// Server sends chunks
HTTP/1.1 200 OK
Transfer-Encoding: chunked

5\r\n
Hello\r\n
6\r\n
 there\r\n
1\r\n
!\r\n
0\r\n
\r\n
```

**Pros:**
- Standard HTTP (no special protocol)
- Streaming built into HTTP/1.1

**Cons:**
- **Low-level** (must handle chunk encoding manually)
- **No message boundaries** (client must parse chunks)
- **No auto-reconnect** (connection lost = restart)
- **Harder to debug** (hex length prefixes obscure data)

**Why Not:** Chunked transfer is low-level plumbing. SSE is high-level API built on top of chunked transfer. Using chunked transfer directly is reinventing SSE.

### 4. GraphQL Subscriptions

**Approach:**
```graphql
subscription {
  aiGenerate(prompt: "Hello") {
    token
    done
  }
}
```

**Pros:**
- GraphQL ecosystem integration
- Type-safe schema
- Built-in documentation

**Cons:**
- **Requires GraphQL** (we use REST)
- **Heavy** (GraphQL server, client library)
- **Overkill** (just need token streaming)
- **WebSocket-based** (same downsides as WebSockets)

**Why Not:** GraphQL subscriptions are great if you already have GraphQL. We use REST. Adding GraphQL just for streaming is massive overhead.

**When GraphQL Subscriptions Would Be Better:**
- Already using GraphQL for everything else
- Need multiple subscriptions (chat + notifications + live data)
- Want type-safe streaming API

### 5. Batch Streaming (Chunks)

**Approach:**
```typescript
// Send 5 tokens at a time
GET /ai/generate/stream

{"tokens": ["Hello", " there", ",", " how", " are"]}
{"tokens": [" you", "?"]}
{"done": true}
```

**Pros:**
- Fewer messages (less overhead)
- Simpler parsing (fewer JSON.parse calls)

**Cons:**
- **Delayed feedback** (wait for 5 tokens before showing any)
- **Inconsistent timing** (sometimes 1 token, sometimes 10)
- **Poor UX** (not true token-by-token streaming)

**Why Not:** Batching defeats the purpose of streaming. Users want to see each token as it's generated. Batching adds artificial delay.

---

## Rationale

### Why SSE Wins for AI Streaming

| Criterion | SSE | WebSocket | Long Poll | Chunked |
|-----------|-----|-----------|-----------|---------|
| **Unidirectional** | ✅ Yes | ❌ No (bidirectional) | ✅ Yes | ✅ Yes |
| **Real-time** | ✅ Yes | ✅ Yes | ❌ No | ✅ Yes |
| **Auto-reconnect** | ✅ Yes | ❌ No | ❌ No | ❌ No |
| **Browser native** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| **Proxy-friendly** | ✅ Yes | ⚠️ Requires config | ✅ Yes | ✅ Yes |
| **Simple protocol** | ✅ Yes | ❌ No | ✅ Yes | ❌ No |

**Result:** SSE checks all boxes for AI streaming.

---

## Tradeoffs

### What We Gain

- ✅ **Real-time feedback** (tokens appear instantly)
- ✅ **Better UX** (no 30-second loading spinner)
- ✅ **Simple protocol** (HTTP with NDJSON)
- ✅ **Browser native** (no client library needed)
- ✅ **Auto-reconnect** (handles network hiccups)
- ✅ **Proxy-friendly** (works through Nginx)

### What We Lose

- ❌ **Unidirectional only** (cannot interrupt generation from client)
- ❌ **Text-only** (cannot stream binary data efficiently)
- ❌ **HTTP overhead** (small per-message overhead vs WebSocket)

### What It Costs

- **Implementation:** ~100 lines (server + client)
- **Bandwidth:** ~10% overhead vs WebSocket (HTTP headers)
- **Server resources:** 1 connection per active stream (manageable)

---

## Consequences

### Positive

1. **Users see AI responses in real-time** (better UX)
2. **Perceived performance improvement** (feels faster even if not)
3. **Standard protocol** (no custom streaming logic)
4. **Works through corporate proxies** (HTTP, not custom protocol)

### Negative

1. **Cannot interrupt generation** (must wait or close connection)
2. **Connection overhead** (1 connection per stream)

### Neutral

1. **Simpler than WebSockets** (less code, less complexity)

---

## Edge Cases & Handling

### 1. Client Disconnect

**Problem:** User closes browser mid-stream

**Solution:**
```typescript
// Backend detects disconnect
response.once('close', () => {
  // Abort upstream request
  abortController.abort();
  
  // Cancel LLM generation
  llm.cancel(requestId);
  
  // Log disconnect
  logger.log({
    event: 'stream_disconnected',
    requestId,
    tokensGenerated: tokenCount,
  });
});
```

### 2. Proxy Timeout

**Problem:** Nginx times out long-running streams

**Solution:**
```nginx
# Nginx config
location /ai/generate/stream {
    proxy_pass http://backend:3000;
    
    # Long timeout for AI streaming
    proxy_read_timeout 300s;  # 5 minutes
    
    # Disable buffering
    proxy_buffering off;
    proxy_cache off;
}
```

### 3. Heartbeat (Keep-Alive)

**Problem:** Proxy or firewall closes idle connections

**Solution:**
```python
async def event_generator():
    last_token_time = time.time()
    
    async for token in llm.stream(prompt):
        yield json.dumps({"token": token}) + "\n"
        last_token_time = time.time()
        
        # Send heartbeat if no token for 10 seconds
        if time.time() - last_token_time > 10:
            yield json.dumps({"heartbeat": true}) + "\n"
            last_token_time = time.time()
```

### 4. Error Mid-Stream

**Problem:** LLM fails halfway through generation

**Solution:**
```python
try:
    async for token in llm.stream(prompt):
        yield json.dumps({"token": token}) + "\n"
except Exception as e:
    # Send error to client
    yield json.dumps({
        "error": {
            "message": "Generation failed",
            "code": "LLM_ERROR",
        }
    }) + "\n"
```

---

## Monitoring & Observability

### Stream Metrics

```typescript
// Track streaming metrics
logger.log({
  event: 'stream_completed',
  requestId,
  duration,
  tokensGenerated,
  bytesTransferred,
  disconnected: false,
});

// Metrics to track:
// - Average stream duration
// - Tokens per second (generation speed)
// - Disconnect rate (% of streams interrupted)
// - Error rate
```

### Alerting

```typescript
// Alert on high disconnect rate
if (disconnect_rate > 20%) {
  alert('High AI stream disconnect rate - investigate network issues');
}

// Alert on slow generation
if (avg_tokens_per_second < 5) {
  alert('Slow AI generation - LLM may be overloaded');
}
```

---

## When Would We Change This Decision?

### Triggers to Move Away from SSE

1. **Need Bidirectional Communication**
   - Example: Allow user to interrupt generation mid-stream
   - Mitigation: Add separate cancel endpoint (POST /ai/cancel)
   - Alternative: Migrate to WebSockets

2. **Need Binary Streaming**
   - Example: Stream images, audio, video
   - Mitigation: Use chunked transfer for binary
   - Alternative: Migrate to WebSockets

3. **Proxy Compatibility Issues**
   - Example: Corporate proxies block SSE
   - Mitigation: Use long polling fallback
   - Alternative: Migrate to chunked transfer

---

## Interview Answer

**Q: "How do you stream AI responses to the frontend?"**

**A:** "We use Server-Sent Events (SSE) with NDJSON encoding. SSE is perfect for AI streaming because it's unidirectional (server → client only), we don't need bidirectional communication. Each token is sent as a separate JSON message delimited by newlines.

The flow is: React sends POST request → NestJS proxies to FastAPI → FastAPI streams tokens from LLM → NestJS pipes stream to React → React displays tokens in real-time. We set `Content-Type: application/x-ndjson` and `X-Accel-Buffering: no` to disable Nginx buffering.

SSE has huge advantages over alternatives. Compared to WebSockets, SSE is simpler (just HTTP, no handshake), has auto-reconnect built-in, and is proxy-friendly. Compared to long polling, SSE is real-time (no wait for entire response) and efficient (single connection, not repeated requests). Compared to chunked transfer, SSE is higher-level (built-in message boundaries).

The tradeoff is SSE is unidirectional—users can't interrupt generation mid-stream. We handle that with a separate cancel endpoint. We also handle edge cases: client disconnect aborts upstream LLM generation, heartbeats prevent proxy timeouts, and errors mid-stream are sent as JSON messages. The result is smooth, real-time AI streaming with minimal complexity."

---

## References

- [SSE Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [NDJSON Specification](http://ndjson.org/)
- [SSE vs WebSocket Comparison](https://ably.com/topic/server-sent-events-vs-websockets)

---

**Last Updated:** 2024-04  
**Next Review:** If need bidirectional communication or binary streaming
