export interface PdfDocument {
  id: string;
  filename: string;
  chunkCount: number;
  createdAt: string;
}

export interface PdfRagCostEvent {
  id: string;
  documentId: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  createdAt: string;
}

export interface PdfRagCostsResponse {
  events: PdfRagCostEvent[];
  totals: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
}

export async function uploadPdfForRag(file: File): Promise<PdfDocument> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/pdf-rag/documents', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { message?: string | string[] }
      | null;
    const message = Array.isArray(error?.message)
      ? error.message.join(', ')
      : error?.message;
    throw new Error(message ?? 'The PDF could not be uploaded.');
  }

  return (await response.json()) as PdfDocument;
}

export async function fetchPdfRagCosts(): Promise<PdfRagCostsResponse> {
  const response = await fetch('/pdf-rag/costs');

  if (!response.ok) {
    throw new Error('Could not load PDF RAG token costs.');
  }

  return (await response.json()) as PdfRagCostsResponse;
}
