// This interface models the raw response shape from the FastAPI service.
// Notice that it uses snake_case because service boundaries often preserve each service's language conventions.

export interface DownstreamAiResponse {
  request_id: string;
  prompt: string;
  summary: string;
  answer: string;
  key_points: string[];
  suggested_follow_up_prompts: string[];
  provider: string;
  model: string;
  processing_time_ms: number;
  generated_at: string;
}
