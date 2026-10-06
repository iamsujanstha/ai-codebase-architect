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
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!isStreaming && !isLoadingModels && modelCount > 0 && draft.trim().length >= 3) void onSubmit();
    }
  }

  return (
    <section className="composer-shell">
      <div className="composer">
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
            <span className="status-chip">
              {selectedModel || 'No model selected'}
            </span>
            <span className="status-chip">
              {draft.length > 3500 ? `${draft.length} / 4000` : 'AI response'}
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
              disabled={isStreaming || isLoadingModels || modelCount === 0 || !selectedModel || draft.trim().length < 3}
            >
              {isStreaming ? 'Generating…' : 'Send message ↑'}
            </button>
          </div>
        </div>
      </div>
      <p className="composer-hint">Enter to send · Shift + Enter for a new line <span>Review generated code before using it.</span></p>
    </section>
  );
}
