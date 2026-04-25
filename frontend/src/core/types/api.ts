// Centralized frontend API types are a small but important best practice.
// They prevent "stringly typed" contracts from leaking across the UI.
//
// Production analogy:
// A typed contract is like an API agreement between teams.
// If the backend changes shape, TypeScript helps us detect the mismatch early.

export interface GenerateAiResponse {
  requestId: string;
  prompt: string;
  summary: string;
  answer: string;
  keyPoints: string[];
  suggestedFollowUpPrompts: string[];
  provider: string;
  model: string;
  upstreamProcessingTimeMs: number;
  gatewayProcessingTimeMs: number;
  generatedAt: string;
}

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

export interface LocalModel {
  name: string;
  sizeBytes: number;
  sizeLabel: string;
  modifiedAt: string;
  digest?: string | null;
  family?: string | null;
  parameterSize?: string | null;
  quantizationLevel?: string | null;
}

export interface ModelsResponse {
  defaultModel: string;
  models: LocalModel[];
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

export type StreamEvent =
  | StreamStartEvent
  | StreamDeltaEvent
  | StreamDoneEvent
  | StreamErrorEvent;

export interface ApiErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string | string[];
  detail?: string;
}
