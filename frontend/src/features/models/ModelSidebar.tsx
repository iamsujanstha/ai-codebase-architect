import type { Dispatch, SetStateAction } from 'react';
import type { AiModel } from '@/core/types/api';
import type { ChatThread } from '@/core/types/chat';

interface ModelSidebarProps {
  models?: AiModel[];
  provider?: string;
  selectedModel?: string;
  isLoadingModels?: boolean;
  modelError?: string | null;
  onSelectModel?: Dispatch<SetStateAction<string>> | ((name: string) => void);
  onRefreshModels?: () => Promise<void>;
  threads: ChatThread[];
  currentThreadId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onNewChat: () => void;
}

export function ModelSidebar({
  models = [],
  provider = '',
  selectedModel = '',
  isLoadingModels = false,
  modelError = null,
  onSelectModel,
  onRefreshModels,
  threads,
  currentThreadId,
  onSelectThread,
  onDeleteThread,
  onNewChat,
}: ModelSidebarProps): JSX.Element {
  const runtimeStatus = isLoadingModels
    ? 'Discovering models'
    : modelError
      ? 'Unavailable'
      : models.length
        ? 'Connected'
        : 'No models';

  return (
    <>
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          a<span> /</span>
        </div>
        <div>
          <h2>Architect</h2>
          <p>AI workspace</p>
        </div>
      </div>

      <button className="primary-button new-chat-button" onClick={onNewChat} type="button">
        <span className="plus-icon">+</span> New conversation
      </button>

      <section className="sidebar-section history-section">
        <div className="sidebar-section-header">
          <h3>Conversations</h3>
        </div>
        <div className="thread-list">
          {threads.length === 0 ? (
            <p className="sidebar-copy empty-history">Your conversations will appear here.</p>
          ) : (
            threads.map((thread) => (
              <div
                key={thread.id}
                className={`thread-item ${thread.id === currentThreadId ? 'selected' : ''}`}
              >
                <button
                  type="button"
                  className="thread-content"
                  aria-current={thread.id === currentThreadId ? 'true' : undefined}
                  onClick={() => onSelectThread(thread.id)}
                >
                  <span className="thread-title">{thread.title}</span>
                  <span className="thread-date">
                    {new Date(thread.lastMessageAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  className="delete-thread-btn"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(thread.id);
                  }}
                  title="Delete conversation"
                  aria-label={`Delete ${thread.title}`}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {(onRefreshModels || provider || models.length > 0) && (
        <section className="sidebar-section">
          <div className="sidebar-section-header">
            <h3>Runtime</h3>
            {onRefreshModels && (
              <button
                className="secondary-button"
                disabled={isLoadingModels}
                type="button"
                onClick={() => {
                  void onRefreshModels();
                }}
              >
                Refresh
              </button>
            )}
          </div>

          <div className="status-list">
            <div className="status-row">
              <span>Provider</span>
              <strong>{provider || 'Not connected'}</strong>
            </div>
            <div className="status-row">
              <span>Status</span>
              <strong>{runtimeStatus}</strong>
            </div>
            <div className="status-row">
              <span>Available</span>
              <strong>{models.length}</strong>
            </div>
          </div>

          {modelError ? <p className="inline-error">{modelError}</p> : null}
        </section>
      )}

      {models.length > 0 && onSelectModel && (
        <section className="sidebar-section">
          <div className="sidebar-section-header">
            <h3>Available models</h3>
          </div>

          <div className="model-list">
            {models.map((model) => {
              const isSelected = model.name === selectedModel;

              return (
                <button
                  key={model.name}
                  className={`model-tile ${isSelected ? 'selected' : ''}`}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelectModel(model.name)}
                >
                  <span className="model-name">{model.name}</span>
                  <span className="model-meta">
                    {model.sizeLabel}
                    {model.parameterSize ? ` • ${model.parameterSize}` : ''}
                  </span>
                  <span className="model-meta">
                    {model.family || 'General'}
                    {model.quantizationLevel ? ` • ${model.quantizationLevel}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <p className="sidebar-footnote">Conversations saved in this browser</p>
    </>
  );
}
