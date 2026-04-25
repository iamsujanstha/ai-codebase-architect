import { ChatComposer } from './components/ChatComposer';
import { ChatWindow } from './components/ChatWindow';
import { ModelSidebar } from './components/ModelSidebar';
import { ThemeToggle } from './components/ThemeToggle';
import { useAiAssistant } from './hooks/useAiAssistant';
import { useTheme } from './hooks/useTheme';

export default function App(): JSX.Element {
  const { theme, setTheme } = useTheme();
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

  return (
    <main className="app-shell">
      <ModelSidebar
        models={models}
        selectedModel={selectedModel}
        isLoadingModels={isLoadingModels}
        modelError={modelError}
        onSelectModel={setSelectedModel}
        onRefreshModels={refreshModels}
      />

      <section className="chat-shell">
        <header className="chat-header">
          <div>
            <p className="section-kicker">Local AI Workspace</p>
            <h1>Chat with your Ollama models</h1>
            <p className="chat-subtitle">
              Responses stream token-by-token through the backend gateway, just
              like a production AI application should feel.
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
              {isLoadingModels ? 'Loading models' : `${models.length} local models`}
            </div>

            <ThemeToggle
              theme={theme}
              onThemeChange={setTheme}
            />
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
      </section>
    </main>
  );
}
