import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { Pool } from 'pg';
import { PDFParse } from 'pdf-parse';

export interface PdfDocumentRecord {
  id: string;
  filename: string;
  chunkCount: number;
  createdAt: string;
}

interface RetrievedChunk {
  id: string;
  chunk_index: number;
  content: string;
  distance: number;
}

export interface CostEvent {
  id: string;
  documentId: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  createdAt: string;
}

@Injectable()
export class PdfRagService implements OnModuleInit {
  private readonly logger = new Logger(PdfRagService.name);
  private readonly pool = new Pool({
    connectionString:
      process.env.PGVECTOR_DATABASE_URL ??
      process.env.DATABASE_URL ??
      'postgres://postgres:postgres@localhost:5433/pdf_rag',
  });
  private readonly embeddingDimensions = Number(
    process.env.PDF_RAG_EMBEDDING_DIMENSIONS ?? 768,
  );
  private readonly ollamaBaseUrl =
    process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  private readonly embeddingModel =
    process.env.PDF_RAG_EMBEDDING_MODEL ?? 'nomic-embed-text';
  private readonly chatModel =
    process.env.PDF_RAG_CHAT_MODEL ??
    process.env.OLLAMA_MODEL ??
    'deepseek-coder:6.7b';
  private readonly promptTokenUsd = Number(
    process.env.PDF_RAG_PROMPT_TOKEN_USD ?? 0,
  );
  private readonly completionTokenUsd = Number(
    process.env.PDF_RAG_COMPLETION_TOKEN_USD ?? 0,
  );
  private readonly costEvents: CostEvent[] = [];

  async onModuleInit() {
    await this.initializeDatabase();
  }

  async indexPdf(file: Express.Multer.File): Promise<PdfDocumentRecord> {
    const parser = new PDFParse({ data: file.buffer });
    let text = '';

    try {
      const parsed = await parser.getText();
      text = this.normalizeText(parsed.text);
    } finally {
      await parser.destroy();
    }
    const chunks = this.chunkText(text);

    if (chunks.length === 0) {
      throw new BadRequestException('The uploaded PDF did not contain readable text.');
    }

    const documentId = randomUUID();
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO pdf_documents (id, filename, mime_type, text_chars)
         VALUES ($1, $2, $3, $4)`,
        [documentId, file.originalname, file.mimetype, text.length],
      );

      for (const [index, content] of chunks.entries()) {
        const embedding = await this.embed(content);
        await client.query(
          `INSERT INTO pdf_document_chunks
             (id, document_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4, $5::vector)`,
          [randomUUID(), documentId, index, content, this.toVectorLiteral(embedding)],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error(
        'Failed to index PDF into pgvector.',
        error instanceof Error ? error.stack : String(error),
      );
      if (error instanceof HttpException) {
        throw error;
      }
      throw new BadGatewayException(this.describeIndexingFailure(error));
    } finally {
      client.release();
    }

    return {
      id: documentId,
      filename: file.originalname,
      chunkCount: chunks.length,
      createdAt: new Date().toISOString(),
    };
  }

  async streamChat(request: Record<string, unknown>, response: Response) {
    const documentId =
      typeof request.documentId === 'string' ? request.documentId : undefined;
    const question = this.extractLatestUserText(request);

    if (!documentId) {
      throw new BadRequestException('Upload and select a PDF before chatting.');
    }

    if (!question) {
      throw new BadRequestException('Ask a question about the uploaded PDF.');
    }

    const chunks = await this.retrieveChunks(documentId, question);
    const prompt = this.buildGroundedPrompt(question, chunks);

    response.status(200);
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders?.();

    let answer = '';

    try {
      const upstream = await axios.post(
        `${this.ollamaBaseUrl}/api/generate`,
        {
          model: this.chatModel,
          prompt,
          stream: true,
          options: {
            temperature: 0.1,
          },
        },
        {
          responseType: 'stream',
          timeout: Number(process.env.PDF_RAG_STREAM_TIMEOUT_MS ?? 600000),
        },
      );

      upstream.data.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString('utf8').split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const event = JSON.parse(trimmed) as { response?: string };
            if (event.response) {
              answer += event.response;
              response.write(event.response);
            }
          } catch {
            this.logger.warn('Ollama returned a malformed stream line.');
          }
        }
      });

      upstream.data.on('end', () => {
        this.recordCost(documentId, prompt, answer);
        response.end();
      });

      upstream.data.on('error', (error: Error) => {
        this.logger.error('Ollama stream failed.', error.stack ?? error.message);
        if (!response.writableEnded) response.end();
      });
    } catch (error) {
      this.logger.error(
        'Failed to stream PDF RAG answer.',
        error instanceof Error ? error.stack : String(error),
      );

      if (!response.headersSent) {
        throw new BadGatewayException('The local model could not answer the PDF question.');
      }

      response.write('\nThe local model could not complete this answer.');
      response.end();
    }
  }

  getCostEvents() {
    return {
      events: this.costEvents,
      totals: this.costEvents.reduce(
        (acc, event) => ({
          promptTokens: acc.promptTokens + event.promptTokens,
          completionTokens: acc.completionTokens + event.completionTokens,
          totalTokens: acc.totalTokens + event.totalTokens,
          estimatedCostUsd: acc.estimatedCostUsd + event.estimatedCostUsd,
        }),
        {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
        },
      ),
    };
  }

  async getHealth() {
    const [database, ollama] = await Promise.allSettled([
      this.pool.query('SELECT 1'),
      axios.get(`${this.ollamaBaseUrl}/api/tags`, {
        timeout: 5000,
      }),
    ]);

    const models =
      ollama.status === 'fulfilled'
        ? ((ollama.value.data as { models?: Array<{ name?: string; model?: string }> })
            .models ?? []
          ).map((model) => model.name ?? model.model ?? 'unknown')
        : [];

    return {
      pgvector: database.status === 'fulfilled' ? 'ok' : 'unavailable',
      ollama:
        ollama.status === 'fulfilled'
          ? 'ok'
          : this.describeAxiosFailure(ollama.reason),
      embeddingModel: this.embeddingModel,
      embeddingModelAvailable: this.hasOllamaModel(models, this.embeddingModel),
      availableModels: models,
      hint: this.hasOllamaModel(models, this.embeddingModel)
        ? null
        : `Run: ollama pull ${this.embeddingModel}`,
    };
  }

  private async initializeDatabase() {
    const client = await this.pool.connect();

    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query(`
        CREATE TABLE IF NOT EXISTS pdf_documents (
          id uuid PRIMARY KEY,
          filename text NOT NULL,
          mime_type text NOT NULL,
          text_chars integer NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await client.query(`
        CREATE TABLE IF NOT EXISTS pdf_document_chunks (
          id uuid PRIMARY KEY,
          document_id uuid NOT NULL REFERENCES pdf_documents(id) ON DELETE CASCADE,
          chunk_index integer NOT NULL,
          content text NOT NULL,
          embedding vector(${this.embeddingDimensions}) NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS pdf_document_chunks_document_idx
        ON pdf_document_chunks(document_id)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS pdf_document_chunks_embedding_idx
        ON pdf_document_chunks
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);
    } finally {
      client.release();
    }
  }

  private async retrieveChunks(
    documentId: string,
    question: string,
  ): Promise<RetrievedChunk[]> {
    const embedding = await this.embed(question);
    const { rows } = await this.pool.query<RetrievedChunk>(
      `SELECT id, chunk_index, content, embedding <=> $2::vector AS distance
       FROM pdf_document_chunks
       WHERE document_id = $1
       ORDER BY embedding <=> $2::vector
       LIMIT 6`,
      [documentId, this.toVectorLiteral(embedding)],
    );

    if (rows.length === 0) {
      throw new BadRequestException('No indexed chunks were found for this PDF.');
    }

    return rows;
  }

  private async embed(input: string): Promise<number[]> {
    let firstFailure: unknown;

    try {
      const { data } = await axios.post<{ embeddings?: number[][] }>(
        `${this.ollamaBaseUrl}/api/embed`,
        {
          model: this.embeddingModel,
          input,
        },
        {
          timeout: Number(process.env.PDF_RAG_EMBED_TIMEOUT_MS ?? 120000),
        },
      );

      const embedding = data.embeddings?.[0];
      if (embedding) return embedding;
    } catch (error) {
      firstFailure = error;
      // Older Ollama versions expose /api/embeddings instead of /api/embed.
    }

    try {
      const { data } = await axios.post<{ embedding: number[] }>(
        `${this.ollamaBaseUrl}/api/embeddings`,
        {
          model: this.embeddingModel,
          prompt: input,
        },
        {
          timeout: Number(process.env.PDF_RAG_EMBED_TIMEOUT_MS ?? 120000),
        },
      );

      return data.embedding;
    } catch (error) {
      throw new BadGatewayException(
        this.describeEmbeddingFailure(error, firstFailure),
      );
    }
  }

  private buildGroundedPrompt(question: string, chunks: RetrievedChunk[]) {
    const context = chunks
      .map(
        (chunk) =>
          `[Chunk ${chunk.chunk_index + 1}, score ${chunk.distance.toFixed(4)}]\n${chunk.content}`,
      )
      .join('\n\n---\n\n');

    return `You are a PDF-grounded assistant. Answer only from the provided PDF excerpts.
If the excerpts do not contain the answer, say: "I could not find that in the uploaded PDF."
Do not use outside knowledge.

PDF excerpts:
${context}

Question: ${question}

Answer:`;
  }

  private extractLatestUserText(request: Record<string, unknown>) {
    if (typeof request.prompt === 'string') return request.prompt.trim();

    const messages = Array.isArray(request.messages) ? request.messages : [];
    const latestUser = [...messages]
      .reverse()
      .find(
        (message) =>
          typeof message === 'object' &&
          message !== null &&
          (message as { role?: string }).role === 'user',
      ) as Record<string, unknown> | undefined;

    if (!latestUser) return '';

    if (typeof latestUser.content === 'string') return latestUser.content.trim();

    const parts = Array.isArray(latestUser.parts) ? latestUser.parts : [];
    return parts
      .map((part) => {
        if (typeof part !== 'object' || part === null) return '';
        const value = part as { type?: string; text?: unknown };
        return value.type === 'text' && typeof value.text === 'string'
          ? value.text
          : '';
      })
      .join('')
      .trim();
  }

  private chunkText(text: string) {
    const chunks: string[] = [];
    const targetSize = Number(process.env.PDF_RAG_CHUNK_CHARS ?? 1200);
    const overlap = Number(process.env.PDF_RAG_CHUNK_OVERLAP_CHARS ?? 200);

    for (let start = 0; start < text.length; start += targetSize - overlap) {
      const chunk = text.slice(start, start + targetSize).trim();
      if (chunk.length >= 80) chunks.push(chunk);
    }

    return chunks;
  }

  private normalizeText(text: string) {
    return text.replace(/\s+/g, ' ').trim();
  }

  private toVectorLiteral(embedding: number[]) {
    if (embedding.length !== this.embeddingDimensions) {
      throw new BadGatewayException(
        `Embedding model returned ${embedding.length} dimensions, but pgvector is configured for ${this.embeddingDimensions}.`,
      );
    }

    return `[${embedding.join(',')}]`;
  }

  private hasOllamaModel(models: string[], modelName: string) {
    return models.some(
      (model) => model === modelName || model === `${modelName}:latest`,
    );
  }

  private describeIndexingFailure(error: unknown) {
    return `The backend could not index the PDF. ${this.describeAxiosFailure(error)}`;
  }

  private describeEmbeddingFailure(error: unknown, firstFailure?: unknown) {
    const message = this.describeAxiosFailure(error);
    const firstMessage = firstFailure
      ? this.describeAxiosFailure(firstFailure)
      : '';

    if (
      message.includes('model') ||
      firstMessage.includes('model') ||
      message.includes('404') ||
      firstMessage.includes('404')
    ) {
      return `Ollama embedding model "${this.embeddingModel}" is not available. Run: ollama pull ${this.embeddingModel}`;
    }

    return `The backend could not create embeddings with Ollama. ${message}`;
  }

  private describeAxiosFailure(error: unknown) {
    if (!axios.isAxiosError(error)) {
      return error instanceof Error ? error.message : String(error);
    }

    const payload = error.response?.data as
      | { error?: string; message?: string }
      | string
      | undefined;
    const payloadMessage =
      typeof payload === 'string'
        ? payload
        : payload?.error ?? payload?.message ?? '';

    if (payloadMessage) return payloadMessage;
    if (error.response?.status) return `HTTP ${error.response.status}`;
    if (error.code) return error.code;
    return error.message;
  }

  private estimateTokens(text: string) {
    return Math.max(1, Math.ceil(text.length / 4));
  }

  private recordCost(documentId: string, prompt: string, answer: string) {
    const promptTokens = this.estimateTokens(prompt);
    const completionTokens = this.estimateTokens(answer);
    const estimatedCostUsd =
      promptTokens * this.promptTokenUsd +
      completionTokens * this.completionTokenUsd;
    const event: CostEvent = {
      id: randomUUID(),
      documentId,
      model: this.chatModel,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      estimatedCostUsd,
      createdAt: new Date().toISOString(),
    };

    this.costEvents.unshift(event);
    this.costEvents.splice(25);
    this.logger.log(
      `PDF RAG cost: model=${event.model} promptTokens=${event.promptTokens} completionTokens=${event.completionTokens} totalTokens=${event.totalTokens} estimatedCostUsd=${event.estimatedCostUsd.toFixed(6)}`,
    );
  }
}
