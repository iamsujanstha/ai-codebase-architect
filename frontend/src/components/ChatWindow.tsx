import { useEffect, useRef, useState } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { STARTER_PROMPTS } from '../hooks/useAiAssistant';
import type { ChatMessage } from '../types/chat';

interface ChatWindowProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  onStarterPrompt: (promptOverride?: string) => Promise<void>;
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(durationMs?: number): string | null {
  if (!durationMs || durationMs <= 0) {
    return null;
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  return `${(durationMs / 1000).toFixed(1)} s`;
}

export function ChatWindow({
  messages,
  isStreaming,
  error,
  onStarterPrompt,
}: ChatWindowProps): JSX.Element {
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({
      behavior: isStreaming ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [messages, isStreaming]);

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(null), 1600);
    } catch {
      setCopiedMessageId(null);
    }
  }

  return (
    <section className="chat-thread">
      {messages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-copy">
            <h2>Start with a practical prompt</h2>
            <p>
              The response will stream in live, and the final message will show
              model choice, token counts, and generation timings.
            </p>
          </div>

          <div className="starter-grid">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                className="starter-tile"
                type="button"
                onClick={() => {
                  void onStarterPrompt(prompt);
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="thread-banner error">
          <strong>Request issue</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="message-stack">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`message-row ${message.role}`}
          >
            <div
              className={`message-card ${message.role} ${
                message.status === 'streaming' ? 'streaming' : ''
              } ${message.status === 'error' ? 'error' : ''}`}
            >
              <div className="message-meta">
                <div className="message-meta-primary">
                  <span>{message.role === 'user' ? 'You' : 'Assistant'}</span>
                  <span>{formatTime(message.createdAt)}</span>
                  {message.model ? <span>{message.model}</span> : null}
                  {message.provider ? <span>{message.provider}</span> : null}
                </div>

                {message.role === 'assistant' ? (
                  <button
                    className="message-copy-button"
                    type="button"
                    onClick={() => {
                      void copyMessage(message);
                    }}
                  >
                    {copiedMessageId === message.id ? 'Copied' : 'Copy'}
                  </button>
                ) : null}
              </div>

              {message.role === 'assistant' ? (
                <MarkdownRenderer content={message.content} />
              ) : (
                <div className="message-plain-content">{message.content}</div>
              )}

              {message.role === 'assistant' && message.usage ? (
                <div className="message-footer">
                  <span>{message.usage.inputTokens} input tokens</span>
                  <span>{message.usage.outputTokens} output tokens</span>
                  <span>{message.usage.totalTokens} total tokens</span>
                  {message.timings?.totalDurationMs ? (
                    <span>{formatDuration(message.timings.totalDurationMs)}</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <div ref={scrollAnchorRef} />
    </section>
  );
}
