import type {
  ApiErrorResponse,
  GenerateAiResponse,
  ModelsResponse,
  StreamEvent,
} from '@/core/types/api';

// Separating data access into a service module gives us a clean seam between UI and networking.
// This is useful because networking code tends to evolve differently from visual components.
//
// Future production upgrades that would naturally live here:
// - authentication headers
// - retry logic
// - telemetry
// - request tracing
// - automatic token refresh

const REQUEST_TIMEOUT_MS = 120_000;
const MODELS_REQUEST_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

interface StreamAiResponseOptions {
  prompt: string;
  messages?: Array<{ role: string; content: string }>;
  model?: string;
  signal?: AbortSignal;
  onEvent: (event: StreamEvent) => void;
}

function extractErrorMessage(errorPayload: Partial<ApiErrorResponse> | null): string {
  if (!errorPayload) {
    return 'The backend returned an error.';
  }

  if (Array.isArray(errorPayload.message)) {
    return errorPayload.message.join(', ');
  }

  if (typeof errorPayload.message === 'string' && errorPayload.message.trim()) {
    return errorPayload.message;
  }

  if (typeof errorPayload.detail === 'string' && errorPayload.detail.trim()) {
    return errorPayload.detail;
  }

  return 'The backend returned an error.';
}

export async function requestAiResponse(
  prompt: string,
  messages?: Array<{ role: string; content: string }>,
): Promise<GenerateAiResponse> {
  const controller = new AbortController();

  // AbortController gives the user a faster failure mode when downstream services hang.
  // In production you almost never want browser requests waiting forever.
  const timeoutHandle = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch('/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, messages }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorPayload = (await response.json()) as ApiErrorResponse;
      throw new ApiError(extractErrorMessage(errorPayload), response.status);
    }

    return (await response.json()) as GenerateAiResponse;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(
        'The request timed out while waiting for the AI platform.',
        408,
      );
    }

    throw new ApiError(
      'The frontend could not reach the backend service.',
      503,
    );
  } finally {
    window.clearTimeout(timeoutHandle);
  }
}

export async function fetchAvailableModels(): Promise<ModelsResponse> {
  const controller = new AbortController();
  const timeoutHandle = window.setTimeout(
    () => controller.abort(),
    MODELS_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch('/ai/models', {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorPayload = (await response.json()) as ApiErrorResponse;
      throw new ApiError(extractErrorMessage(errorPayload), response.status);
    }

    return (await response.json()) as ModelsResponse;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(
        'Loading local models timed out while waiting for the backend.',
        408,
      );
    }

    throw new ApiError('The frontend could not load local Ollama models.', 503);
  } finally {
    window.clearTimeout(timeoutHandle);
  }
}

export async function streamAiResponse({
  prompt,
  messages,
  model,
  signal,
  onEvent,
}: StreamAiResponseOptions): Promise<void> {
  const response = await fetch('/ai/generate/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      messages,
      model,
    }),
    signal,
  });

  if (!response.ok) {
    const errorPayload = (await response.json()) as ApiErrorResponse;
    throw new ApiError(extractErrorMessage(errorPayload), response.status);
  }

  if (!response.body) {
    throw new ApiError('The backend did not provide a readable response stream.', 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (!trimmedLine) {
          continue;
        }

        const event = JSON.parse(trimmedLine) as StreamEvent;
        onEvent(event);

        if (event.type === 'error') {
          throw new ApiError(event.message, 503);
        }
      }
    }

    const finalLine = buffer.trim();

    if (finalLine) {
      const finalEvent = JSON.parse(finalLine) as StreamEvent;
      onEvent(finalEvent);

      if (finalEvent.type === 'error') {
        throw new ApiError(finalEvent.message, 503);
      }
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }

    throw new ApiError(
      'The streamed response was interrupted before it completed.',
      502,
    );
  } finally {
    reader.releaseLock();
  }
}
