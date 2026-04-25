import type { Dispatch, SetStateAction } from 'react';
import type { LocalModel } from '@/core/types/api';
import type { ChatThread } from '@/core/types/chat';

interface ModelSidebarProps {
  models: LocalModel[];
  selectedModel: string;
  isLoadingModels: boolean;
  modelError: string | null;
  onSelectModel: Dispatch<SetStateAction<string>>;
  onRefreshModels: () => Promise<void>;
  threads: ChatThread[];
  currentThreadId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onNewChat: () => void;
}

export function ModelSidebar({
  models,
  selectedModel,
  isLoadingModels,
  modelError,
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
      : 'Ready';

  return (
    <>
      <div className="brand-block">
        <p className="section-kicker">Enterprise AI</p>
        <h2>Control Plane</h2>
      </div>

      <button className="primary-button new-chat-button" onClick={onNewChat}>
        <span className="plus-icon">+</span> New Chat
      </button>

      <section className="sidebar-section history-section">
        <div className="sidebar-section-header">
          <h3>Chat History</h3>
        </div>
        <div className="thread-list">
          {threads.length === 0 ? (
            <p className="sidebar-copy empty-history">No conversations yet.</p>
          ) : (
            threads.map((thread) => (
              <div
                key={thread.id}
                className={`thread-item ${thread.id === currentThreadId ? 'selected' : ''}`}
                onClick={() => onSelectThread(thread.id)}
              >
                <div className="thread-content">
                  <span className="thread-title">{thread.title}</span>
                  <span className="thread-date">
                    {new Date(thread.lastMessageAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="delete-thread-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(thread.id);
                  }}
                  title="Delete chat"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <h3>Runtime</h3>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              void onRefreshModels();
            }}
          >
            Refresh
          </button>
        </div>

        <div className="status-list">
          <div className="status-row">
            <span>Provider</span>
            <strong>Ollama local</strong>
          </div>
          <div className="status-row">
            <span>Status</span>
            <strong>{runtimeStatus}</strong>
          </div>
          <div className="status-row">
            <span>Installed</span>
            <strong>{models.length}</strong>
          </div>
        </div>

        {modelError ? <p className="inline-error">{modelError}</p> : null}
      </section>

      <section className="sidebar-section">
        <div className="sidebar-section-header">
          <h3>Available Models</h3>
        </div>

        <div className="model-list">
          {models.map((model) => {
            const isSelected = model.name === selectedModel;

            return (
              <button
                key={model.name}
                className={`model-tile ${isSelected ? 'selected' : ''}`}
                type="button"
                onClick={() => onSelectModel(model.name)}
              >
                <span className="model-name">{model.name}</span>
                <span className="model-meta">
                  {model.sizeLabel}
                  {model.parameterSize ? ` • ${model.parameterSize}` : ''}
                </span>
                <span className="model-meta">
                  {model.family || 'General'}
                  {model.quantizationLevel
                    ? ` • ${model.quantizationLevel}`
                    : ''}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
