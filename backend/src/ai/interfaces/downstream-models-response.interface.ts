// The Python service exposes model metadata in snake_case.
// The NestJS gateway translates that into the camelCase contract used by the frontend.

export interface DownstreamModelSummary {
  name: string;
  size_bytes: number;
  size_label: string;
  modified_at: string;
  digest?: string | null;
  family?: string | null;
  parameter_size?: string | null;
  quantization_level?: string | null;
}

export interface DownstreamModelsResponse {
  default_model: string;
  models: DownstreamModelSummary[];
}

