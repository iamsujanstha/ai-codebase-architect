import type { Dispatch, KeyboardEvent, SetStateAction } from 'react';

interface ChatComposerProps {
  draft: string;
  selectedModel: string;
  isStreaming: boolean;
  isLoadingModels: boolean;
  modelCount: number;
  onDraftChange: Dispatch<SetStateAction<string>>;
  onSubmit: () => Promise<void>;
  onStop: () => void;
}

export function ChatComposer({
  draft,
  selectedModel,
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
      <div className="composer">
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your local model about architecture, code, debugging, or system design."
        />

        <div className="composer-footer">
          <div className="composer-pills">
            <span className="status-chip">
              {selectedModel || 'No model selected'}
            </span>
            <span className="status-chip">
              {isLoadingModels ? 'Loading local models' : `${modelCount} models available`}
            </span>
          </div>

          <div className="composer-actions">
            {isStreaming ? (
              <button
                className="secondary-button"
                type="button"
                onClick={onStop}
              >
                Stop
              </button>
            ) : null}

            <button
              className="primary-button"
              type="button"
              onClick={() => {
                void onSubmit();
              }}
              disabled={isStreaming || !draft.trim()}
            >
              {isStreaming ? 'Streaming' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
