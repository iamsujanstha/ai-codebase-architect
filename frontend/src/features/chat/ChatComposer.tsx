import type { Dispatch, KeyboardEvent, SetStateAction } from 'react';
import type { LocalModel } from '@/core/types/api';

interface ChatComposerProps {
  draft: string;
  models: LocalModel[];
  selectedModel: string;
  onSelectModel: (name: string) => void;
  isStreaming: boolean;
  isLoadingModels: boolean;
  modelCount: number;
  onDraftChange: Dispatch<SetStateAction<string>>;
  onSubmit: () => Promise<void>;
  onStop: () => void;
}

export function ChatComposer({
  draft,
  models,
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
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void onSubmit();
    }
  }

  return (
    <section className="composer-shell">
      <div className="composer panel-surface">
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your local model..."
          rows={1}
        />

        <div className="composer-footer">
          <div className="composer-pills">
            <select
              className="model-select-compact"
              value={selectedModel}
              onChange={(e) => onSelectModel(e.target.value)}
              disabled={isLoadingModels}
            >
              {models.map(m => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
            <span className="status-chip-compact">
              {isLoadingModels ? 'Loading...' : `${modelCount} models`}
            </span>
          </div>

          <div className="composer-actions">
            {isStreaming ? (
              <button
                className="stop-button"
                type="button"
                onClick={onStop}
                title="Stop generation"
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
              disabled={!draft.trim()}
              title="Send message"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

