import type { StreamTimings, TokenUsage } from './api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'streaming' | 'error';
  createdAt: string;
  requestId?: string;
  provider?: string;
  model?: string;
  usage?: TokenUsage;
  timings?: StreamTimings;
}

