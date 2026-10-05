import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import {
  BarChart3,
  FileText,
  Loader2,
  Send,
  Square,
  UploadCloud,
} from 'lucide-react';
import { fetchPdfRagCosts, uploadPdfForRag } from '@/core/api/pdfRagApi';
import type { PdfDocument, PdfRagCostsResponse } from '@/core/api/pdfRagApi';

function textFromParts(parts: Array<{ type: string; text?: string }>) {
  return parts
    .map((part) => (part.type === 'text' ? part.text ?? '' : ''))
    .join('');
}

export function PdfRagPage(): JSX.Element {
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [input, setInput] = useState('');
  const [costs, setCosts] = useState<PdfRagCostsResponse | null>(null);

  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: '/pdf-rag/chat',
      }),
    [],
  );

  const { messages, sendMessage, status, stop, error } = useChat({
    transport,
  });
  const isStreaming = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    void loadCosts();
    const interval = window.setInterval(() => void loadCosts(), 2500);
    return () => window.clearInterval(interval);
  }, []);

  async function loadCosts() {
    try {
      setCosts(await fetchPdfRagCosts());
    } catch {
      // The dashboard is supportive telemetry, not a blocker for chat.
    }
  }

  async function handleUpload(file?: File) {
    if (!file) return;

    setUploadError(null);
    setIsUploading(true);

    try {
      setDocument(await uploadPdfForRag(file));
    } catch (uploadFailure) {
      setUploadError(
        uploadFailure instanceof Error
          ? uploadFailure.message
          : 'The PDF could not be uploaded.',
      );
    } finally {
      setIsUploading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || !document || isStreaming) return;

    void sendMessage(
      { text },
      {
        body: {
          documentId: document.id,
        },
      },
    );
    setInput('');
  }

  return (
    <main className="pdf-rag-page">
      <section className="pdf-rag-workspace">
        <aside className="pdf-rag-sidebar panel-surface">
          <div className="pdf-rag-sidebar__header">
            <span className="pdf-rag-icon">
              <FileText size={20} />
            </span>
            <div>
              <h1>PDF RAG Chat</h1>
              <p>Upload one PDF, then ask grounded questions.</p>
            </div>
          </div>

          <label className="pdf-upload-target">
            <input
              type="file"
              accept="application/pdf"
              disabled={isUploading}
              onChange={(event) => void handleUpload(event.target.files?.[0])}
            />
            {isUploading ? <Loader2 className="spin" size={28} /> : <UploadCloud size={28} />}
            <span>{isUploading ? 'Chunking and embedding...' : 'Upload PDF'}</span>
          </label>

          {uploadError && <p className="pdf-rag-error">{uploadError}</p>}

          {document && (
            <div className="pdf-document-summary">
              <p className="pdf-document-summary__name">{document.filename}</p>
              <p>{document.chunkCount} chunks indexed in pgvector</p>
            </div>
          )}

          <div className="pdf-cost-panel">
            <div className="pdf-cost-panel__title">
              <BarChart3 size={18} />
              <span>Token Cost Dashboard</span>
            </div>
            <dl className="pdf-cost-grid">
              <div>
                <dt>Total tokens</dt>
                <dd>{costs?.totals.totalTokens ?? 0}</dd>
              </div>
              <div>
                <dt>Estimated cost</dt>
                <dd>${(costs?.totals.estimatedCostUsd ?? 0).toFixed(6)}</dd>
              </div>
            </dl>
            <div className="pdf-cost-events">
              {(costs?.events ?? []).slice(0, 4).map((event) => (
                <div key={event.id} className="pdf-cost-event">
                  <span>{event.model}</span>
                  <strong>{event.totalTokens} tokens</strong>
                </div>
              ))}
              {(costs?.events ?? []).length === 0 && (
                <p>No responses logged yet.</p>
              )}
            </div>
          </div>
        </aside>

        <section className="pdf-chat panel-surface">
          <div className="pdf-chat__messages">
            {messages.length === 0 && (
              <div className="pdf-chat-empty">
                <FileText size={34} />
                <h2>{document ? 'Ask about the PDF' : 'Upload a PDF to begin'}</h2>
                <p>
                  Answers are constrained to retrieved chunks from the uploaded document.
                </p>
              </div>
            )}

            {messages.map((message) => (
              <article
                key={message.id}
                className={`pdf-message pdf-message--${message.role}`}
              >
                <span>{message.role === 'user' ? 'You' : 'PDF assistant'}</span>
                <p>{textFromParts(message.parts as Array<{ type: string; text?: string }>)}</p>
              </article>
            ))}
          </div>

          {(error || !document) && (
            <div className="pdf-chat-status">
              {error ? error.message : 'Upload a PDF before sending a question.'}
            </div>
          )}

          <form className="pdf-chat-composer" onSubmit={handleSubmit}>
            <input
              value={input}
              disabled={!document || isStreaming}
              onChange={(event) => setInput(event.target.value)}
              placeholder={
                document
                  ? 'Ask a question grounded in this PDF...'
                  : 'Upload a PDF first'
              }
            />
            {isStreaming ? (
              <button type="button" onClick={stop} aria-label="Stop response">
                <Square size={18} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!document || !input.trim()}
                aria-label="Send question"
              >
                <Send size={18} />
              </button>
            )}
          </form>
        </section>
      </section>
    </main>
  );
}
