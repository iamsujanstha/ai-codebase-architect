import type { ChatThread } from '@/core/types/chat';


interface ModelSidebarProps {
  threads: ChatThread[];
  currentThreadId: string | null;
  onSelectThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
  onNewChat: () => void;
}

export function ModelSidebar({
  threads,
  currentThreadId,
  onSelectThread,
  onDeleteThread,
  onNewChat,
}: ModelSidebarProps): JSX.Element {


  return (
    <>
      <div className="brand-block">
        <p className="section-kicker">Local models</p>
        <h2>AI Studio</h2>
        <p className="sidebar-copy">
          Keep the full storefront on `/` and the local-model workspace on `/chat`.
        </p>
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

    </>
  );
}
