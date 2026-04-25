import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChatComposer } from '@/features/chat/ChatComposer';
import { ChatWindow } from '@/features/chat/ChatWindow';
import { useAiAssistant } from '@/features/chat/useAiAssistant';
import { ModelSidebar } from '@/features/models/ModelSidebar';
import { MainLayout } from '@/shared/ui/MainLayout';

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
    modelError,
    handleSubmit,
    stopStreaming,
    refreshModels,
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
      models={models}
      selectedModel={selectedModel}
      isLoadingModels={isLoadingModels}
      modelError={modelError}
      onSelectModel={setSelectedModel}
      onRefreshModels={refreshModels}
      threads={threads}
      currentThreadId={currentThreadId}
      onSelectThread={handleSelectThread}
      onDeleteThread={deleteThread}
      onNewChat={handleNewChat}

    />
  );

  return (
    <div className="chat-page">
      <MainLayout sidebar={sidebar}>
        <header className="chat-header">
          <div>
            <p className="section-kicker">Local AI route</p>
            <h1>Chat with your installed models</h1>
            <p className="chat-subtitle">
              Stream responses token-by-token, inspect model metadata, and use the
              same platform alongside the storefront.
            </p>
          </div>

          <div className="chat-toolbar">
            <label className="toolbar-field" htmlFor="header-model-select">
              <span>Model</span>
              <select
                id="header-model-select"
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                disabled={isLoadingModels || models.length === 0}
              >
                {models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="status-chip">
              {isLoadingModels ? 'Loading...' : `${models.length} models`}
            </div>
          </div>
        </header>

        <ChatWindow
          messages={messages}
          isStreaming={isStreaming}
          error={error}
          onStarterPrompt={handleSubmit}
        />

        <ChatComposer
          draft={draft}
          selectedModel={selectedModel}
          isStreaming={isStreaming}
          isLoadingModels={isLoadingModels}
          modelCount={models.length}
          onDraftChange={setDraft}
          onSubmit={() => handleSubmit()}
          onStop={stopStreaming}
        />
      </MainLayout>
    </div>
  );
}
