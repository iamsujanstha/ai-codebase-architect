import type { StreamTimings, TokenUsage } from './api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'complete' | 'streaming' | 'error';
  createdAt: string;
  requestId?: string;
  provider?: string;
  model?: string;
  usage?: TokenUsage;
  timings?: StreamTimings;
}

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  lastMessageAt: string;
  model?: string;
}

