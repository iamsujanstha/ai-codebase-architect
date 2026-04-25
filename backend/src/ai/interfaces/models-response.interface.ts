import { ModelSummary } from './model-summary.interface';

// This is the response shape for the frontend model selector.
// It intentionally mirrors the information users care about in a model picker:
// what is installed, which one is the default, and a few helpful characteristics.

export interface ModelsResponse {
  defaultModel: string;
  models: ModelSummary[];
}

