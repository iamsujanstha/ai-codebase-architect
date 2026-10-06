import { ChatComposer } from '@/features/chat/ChatComposer';
import { ChatWindow } from '@/features/chat/ChatWindow';
import { ModelSidebar } from '@/features/models/ModelSidebar';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { useAiAssistant } from '@/features/chat/useAiAssistant';
import { MainLayout } from '@/shared/ui/MainLayout';

export default function App(): JSX.Element {
  const {
    draft,
    setDraft,
    messages,
    threads,
    currentThreadId,
    models,
    provider,
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
      provider={provider}
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
    <MainLayout sidebar={sidebar}>
      <header className="chat-header">
        <div>
          <p className="section-kicker">Workspace / Conversations</p>
          <h1>{threads.find((thread) => thread.id === currentThreadId)?.title || 'New conversation'}</h1>
          <p className="chat-subtitle">
            A focused space to think through your code.
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
              {!models.length && <option value="">No models available</option>}
              {models.map((model) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
          </label>

          <div className="status-chip" role="status">
            {isLoadingModels ? 'Connecting' : modelError ? 'Unavailable' : provider || 'AI workspace'}
          </div>

          <ThemeToggle />
        </div>
      </header>

      <ChatWindow
        messages={messages}
        isStreaming={isStreaming}
        error={error}
        onStarterPrompt={(prompt) => { setDraft(prompt ?? ''); document.getElementById('chat-prompt')?.focus(); }}
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
  );
}
