import { ChatComposer } from '@/features/chat/ChatComposer';
import { ChatWindow } from '@/features/chat/ChatWindow';
import { useAiAssistant } from '@/features/chat/useAiAssistant';
import { ModelSidebar } from '@/features/models/ModelSidebar';
import { MainLayout } from '@/shared/ui/MainLayout';

// The chat route preserves the existing local-model experience,
// but now lives beside the ecommerce storefront rather than replacing it.
export function ChatPage(): JSX.Element {
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
      onSelectThread={selectThread}
      onDeleteThread={deleteThread}
      onNewChat={createNewThread}
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
