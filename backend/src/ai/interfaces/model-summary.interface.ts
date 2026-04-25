// Model metadata surfaced to the frontend model picker.
// The gateway keeps this interface explicit so the UI never has to guess
// what information is available about each local model.

export interface ModelSummary {
  name: string;
  sizeBytes: number;
  sizeLabel: string;
  modifiedAt: string;
  digest?: string | null;
  family?: string | null;
  parameterSize?: string | null;
  quantizationLevel?: string | null;
}

