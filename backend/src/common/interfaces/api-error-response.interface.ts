// Shared interfaces for error responses make the API contract explicit.
// In a multi-team environment this becomes valuable documentation for frontend and observability tooling.

export interface ApiErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  message: string | string[];
}

