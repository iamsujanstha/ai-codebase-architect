// Streaming events are delivered to the frontend as newline-delimited JSON.
// Keeping the event shape documented here makes the contract easier to reason about.

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface StreamTimings {
  totalDurationMs: number;
  loadDurationMs: number;
  promptEvalDurationMs: number;
  completionDurationMs: number;
}

export interface StreamStartEvent {
  type: 'start';
  requestId: string;
  provider: string;
  model: string;
  generatedAt: string;
}

export interface StreamDeltaEvent {
  type: 'delta';
  requestId: string;
  delta: string;
}

export interface StreamDoneEvent {
  type: 'done';
  requestId: string;
  provider: string;
  model: string;
  generatedAt: string;
  usage: TokenUsage;
  timings: StreamTimings;
  doneReason: string;
}

export interface StreamErrorEvent {
  type: 'error';
  requestId: string;
  message: string;
  generatedAt: string;
}

export type GatewayStreamEvent =
  | StreamStartEvent
  | StreamDeltaEvent
  | StreamDoneEvent
  | StreamErrorEvent;

