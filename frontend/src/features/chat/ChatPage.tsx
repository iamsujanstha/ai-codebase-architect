import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChatComposer } from '@/features/chat/ChatComposer';
import { ChatWindow } from '@/features/chat/ChatWindow';
import { useAiAssistant } from '@/features/chat/useAiAssistant';
import { ModelSidebar } from '@/features/models/ModelSidebar';
import { MainLayout } from '@/shared/ui/MainLayout';
import { PackagePlus } from 'lucide-react';

export function ChatPage(): JSX.Element {
  const { threadId } = useParams<{ threadId: string }>();
  const navigate = useNavigate();

  const {
    draft,
    setDraft,
    messages,
    threads,
    currentThreadId,
    models,
    selectedModel,
    setSelectedModel,
    isStreaming,
    isLoadingModels,
    error,
    productsCreatedCount,
    handleSubmit,
    stopStreaming,
    createNewThread,
    selectThread,
    deleteThread,
  } = useAiAssistant();

  // Sync internal state with URL
  useEffect(() => {
    if (threadId && threadId !== currentThreadId) {
      selectThread(threadId);
    }
  }, [threadId, currentThreadId, selectThread]);

  // If we are at /chat but have a saved threadId, redirect to it
  useEffect(() => {
    if (!threadId && currentThreadId) {
      navigate(`/chat/${currentThreadId}`, { replace: true });
    }
  }, [threadId, currentThreadId, navigate]);

  const handleSelectThread = (id: string) => {
    navigate(`/chat/${id}`);
  };

  const handleNewChat = () => {
    const newThread = createNewThread();
    navigate(`/chat/${newThread.id}`);
  };

  const sidebar = (
    <ModelSidebar
      threads={threads}
      currentThreadId={currentThreadId}
      onSelectThread={handleSelectThread}
      onDeleteThread={deleteThread}
      onNewChat={handleNewChat}
    />
  );

  return (
    <div className="chat-page">
      {/* Products-created toast */}
      {productsCreatedCount !== null && (
        <div className="products-created-toast">
          <PackagePlus size={18} />
          <span>
            <strong>{productsCreatedCount} product{productsCreatedCount > 1 ? 's' : ''}</strong> added to the catalog!
            <a href="/" style={{ marginLeft: '0.5rem', textDecoration: 'underline', color: 'inherit' }}>
              View store →
            </a>
          </span>
        </div>
      )}

      <MainLayout sidebar={sidebar}>
        <div className="chat-content-container">
          <ChatWindow
            messages={messages}
            isStreaming={isStreaming}
            error={error}
            onStarterPrompt={handleSubmit}
          />

          <ChatComposer
            draft={draft}
            models={models}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            isStreaming={isStreaming}
            isLoadingModels={isLoadingModels}
            modelCount={models.length}
            onDraftChange={setDraft}
            onSubmit={() => handleSubmit()}
            onStop={stopStreaming}
          />
        </div>
      </MainLayout>
    </div>
  );
}
