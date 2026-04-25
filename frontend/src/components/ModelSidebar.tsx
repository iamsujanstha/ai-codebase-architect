import type { Dispatch, SetStateAction } from 'react';
import type { LocalModel } from '../types/api';

interface ModelSidebarProps {
  models: LocalModel[];
  selectedModel: string;
  isLoadingModels: boolean;
  modelError: string | null;
  onSelectModel: Dispatch<SetStateAction<string>>;
  onRefreshModels: () => Promise<void>;
}

export function ModelSidebar({
  models,
  selectedModel,
  isLoadingModels,
  modelError,
  onSelectModel,
  onRefreshModels,
}: ModelSidebarProps): JSX.Element {
  const runtimeStatus = isLoadingModels
    ? 'Discovering models'
    : modelError
      ? 'Unavailable'
      : 'Ready';

  return (
    <>
      <div className="brand-block">
        <p className="section-kicker">Production Demo</p>
        <h2>AI Control Plane</h2>
        <p className="sidebar-copy">
          The frontend talks only to the gateway. The gateway talks to the AI
          service. The AI service talks to your local Ollama runtime.
        </p>
      </div>

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
