// This interface models the response contract exposed to the frontend.
// The gateway is a good place to normalize naming conventions and hide downstream details from clients.

export interface GatewayAiResponse {
  requestId: string;
  prompt: string;
  summary: string;
  answer: string;
  keyPoints: string[];
  suggestedFollowUpPrompts: string[];
  provider: string;
  model: string;
  upstreamProcessingTimeMs: number;
  gatewayProcessingTimeMs: number;
  generatedAt: string;
}
