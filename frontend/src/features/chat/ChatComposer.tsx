import type { Dispatch, KeyboardEvent, SetStateAction } from 'react';
import type { AiModel } from '@/core/types/api';

interface ChatComposerProps {
  draft: string;
  models?: AiModel[];
  selectedModel: string;
  onSelectModel?: (name: string) => void;
  isStreaming: boolean;
  isLoadingModels: boolean;
  modelCount: number;
  onDraftChange: Dispatch<SetStateAction<string>>;
  onSubmit: () => Promise<void>;
  onStop: () => void;
}

export function ChatComposer({
  draft,
  models = [],
  selectedModel,
  onSelectModel,
  isStreaming,
  isLoadingModels,
  modelCount,
  onDraftChange,
  onSubmit,
  onStop,
}: ChatComposerProps): JSX.Element {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!isStreaming && !isLoadingModels && modelCount > 0 && draft.trim().length >= 3) {
        void onSubmit();
      }
    }
  }

  return (
    <section className="composer-shell">
      <div className="composer panel-surface">
        <label className="sr-only" htmlFor="chat-prompt">Your message</label>
        <textarea
          id="chat-prompt"
          rows={3}
          maxLength={4000}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question, or describe what you’re working on…"
        />

        <div className="composer-footer">
          <div className="composer-pills">
            {onSelectModel && models.length > 0 ? (
              <select
                className="model-select-compact"
                value={selectedModel}
                onChange={(e) => onSelectModel(e.target.value)}
                disabled={isLoadingModels}
                aria-label="Select AI model"
              >
                {models.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            ) : (
              <span className="status-chip">
                {selectedModel || 'No model selected'}
              </span>
            )}
            <span className="status-chip">
              {draft.length > 3500 ? `${draft.length} / 4000` : 'AI response'}
            </span>
          </div>

          <div className="composer-actions">
            {isStreaming ? (
              <button
                className="stop-button"
                type="button"
                onClick={onStop}
                title="Stop generation"
                aria-label="Stop generation"
              >
                <div className="stop-icon" />
              </button>
            ) : null}

            <button
              className="send-button-circle"
              type="button"
              onClick={() => {
                void onSubmit();
              }}
              disabled={isStreaming || isLoadingModels || modelCount === 0 || !selectedModel || draft.trim().length < 3}
              title={isStreaming ? 'Generating…' : 'Send message'}
              aria-label="Send message"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <p className="composer-hint">Enter to send · Shift + Enter for a new line <span>Review generated code before using it.</span></p>
    </section>
  );
}
