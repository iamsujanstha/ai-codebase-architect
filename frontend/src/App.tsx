import { ChatComposer } from './components/ChatComposer';
import { ChatWindow } from './components/ChatWindow';
import { ModelSidebar } from './components/ModelSidebar';
import { ThemeToggle } from './components/ThemeToggle';
import { useAiAssistant } from './hooks/useAiAssistant';
import { MainLayout } from './components/layout/MainLayout';

export default function App(): JSX.Element {
  const {
    draft,
    setDraft,
    messages,
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
  } = useAiAssistant();

  const sidebar = (
    <ModelSidebar
      models={models}
      selectedModel={selectedModel}
      isLoadingModels={isLoadingModels}
      modelError={modelError}
      onSelectModel={setSelectedModel}
      onRefreshModels={refreshModels}
    />
  );

  return (
    <MainLayout sidebar={sidebar}>
      <header className="chat-header">
        <div>
          <p className="section-kicker">Local AI Workspace</p>
          <h1>Chat with your models</h1>
          <p className="chat-subtitle">
            Responses stream token-by-token, powered by local infrastructure.
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

          <ThemeToggle />
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
  );
}
