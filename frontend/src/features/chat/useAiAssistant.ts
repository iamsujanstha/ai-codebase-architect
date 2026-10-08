import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, fetchAvailableModels, streamAiResponse } from '@/core/api/aiApi';
import { buildRequestHistory } from './history';
import {
  deleteThreadFromServer,
  fetchMyThreads,
  saveThread,
} from '@/core/api/chatThreadsApi';
import { useAuth } from '@/features/auth/AuthContext';
import type { ChatMessage, ChatThread } from '@/core/types/chat';
import type { AiModel, StreamEvent } from '@/core/types/api';

// ─── storage strategy ─────────────────────────────────────────────────────────
//
// Anonymous users  → sessionStorage (tab-scoped, cleared on tab close — like ChatGPT)
// Logged-in users  → MongoDB via /ai/threads  (persisted across devices)

const SESSION_THREADS_KEY = 'acl:chat:session-threads';
const SESSION_THREAD_ID_KEY = 'acl:chat:session-current-id';
const MODEL_STORAGE_KEY = 'acl:chat:selected-model';

export const STARTER_PROMPTS = [
  'Explain microservices with a real-world example from Netflix.',
  'Design a production-ready NestJS API gateway for AI workloads.',
  'Show how to containerize a FastAPI service for local LLM development.',
  'Explain RAG using a practical SaaS support assistant example.',
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function createMessage(
  role: ChatMessage['role'],
  content: string,
  status: ChatMessage['status'],
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    status,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function readSessionThreads(): ChatThread[] {
  try {
    const raw = sessionStorage.getItem(SESSION_THREADS_KEY);
    return raw ? (JSON.parse(raw) as ChatThread[]) : [];
  } catch {
    return [];
  }
}

function writeSessionThreads(threads: ChatThread[]) {
  try {
    sessionStorage.setItem(SESSION_THREADS_KEY, JSON.stringify(threads));
  } catch {
    /* quota exceeded — ignore */
  }
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useAiAssistant() {
  const { user } = useAuth();
  const isLoggedIn = Boolean(user);

  const [draft, setDraft] = useState('');
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  const [provider, setProvider] = useState('');
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [productsCreatedCount, setProductsCreatedCount] = useState<number | null>(null);

  const streamAbortRef = useRef<AbortController | null>(null);
  const prevUserRef = useRef<string | null>(null);

  // Keep a ref that always mirrors the latest threads state to avoid stale closures in callbacks
  const threadsRef = useRef<ChatThread[]>(threads);
  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  const currentThread = threads.find((t) => t.id === currentThreadId);
  const messages = currentThread?.messages ?? [];

  // ── load models once ────────────────────────────────────────────────────────
  useEffect(() => {
    void loadModels();
  }, []);

  // ── auth state transitions ───────────────────────────────────────────────────
  useEffect(() => {
    const prevUserId = prevUserRef.current;
    const currentUserId = user?.id ?? null;
    prevUserRef.current = currentUserId;

    if (currentUserId === prevUserId) return;

    if (currentUserId) {
      void loadServerThreads();
    } else {
      const sessionThreads = readSessionThreads();
      setThreads(sessionThreads);
      setCurrentThreadId(sessionStorage.getItem(SESSION_THREAD_ID_KEY) ?? null);
    }
  }, [user?.id]);

  // ── initial load for anonymous users ────────────────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) {
      const sessionThreads = readSessionThreads();
      setThreads(sessionThreads);
      setCurrentThreadId(sessionStorage.getItem(SESSION_THREAD_ID_KEY) ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── persist anonymous threads to sessionStorage ──────────────────────────────
  useEffect(() => {
    if (!isLoggedIn) writeSessionThreads(threads);
  }, [threads, isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      if (currentThreadId) sessionStorage.setItem(SESSION_THREAD_ID_KEY, currentThreadId);
      else sessionStorage.removeItem(SESSION_THREAD_ID_KEY);
    }
  }, [currentThreadId, isLoggedIn]);

  useEffect(() => {
    if (selectedModel) localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  // ── functions ────────────────────────────────────────────────────────────────

  async function loadModels() {
    setIsLoadingModels(true);
    setModelError(null);
    try {
      const modelsResponse = await fetchAvailableModels();
      setModels(modelsResponse.models);
      setProvider(modelsResponse.provider);

      const storedModel = window.localStorage.getItem(MODEL_STORAGE_KEY);
      const hasStoredModel = modelsResponse.models.some(
        (model) => model.name === storedModel,
      );

      const nextModel = hasStoredModel
        ? (storedModel as string)
        : modelsResponse.models.find((model) => model.name === modelsResponse.defaultModel)?.name ||
          modelsResponse.models[0]?.name ||
          '';

      setSelectedModel(nextModel);

      if (nextModel) {
        setModelError(null);
      } else {
        setModelError('No models are available. Check your AI provider configuration, then refresh.');
      }
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setModelError(caughtError.message);
      } else {
        setModelError('The app could not load configured AI models.');
      }
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function loadServerThreads() {
    setIsLoadingHistory(true);
    try {
      const serverThreads = await fetchMyThreads();
      setThreads(serverThreads);
      setCurrentThreadId(serverThreads[0]?.id ?? null);
    } catch (e) {
      console.error('Failed to load chat history:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  const createNewThread = useCallback((): ChatThread => {
    const thread: ChatThread = {
      id: crypto.randomUUID(),
      title: 'New Conversation',
      messages: [],
      lastMessageAt: new Date().toISOString(),
    };
    setThreads((prev) => [thread, ...prev]);
    setCurrentThreadId(thread.id);
    return thread;
  }, []);

  const deleteThread = useCallback(
    async (id: string) => {
      setThreads((prev) => prev.filter((t) => t.id !== id));
      if (currentThreadId === id) setCurrentThreadId(null);
      if (isLoggedIn) {
        try {
          await deleteThreadFromServer(id);
        } catch {
          /* best-effort */
        }
      }
    },
    [currentThreadId, isLoggedIn],
  );

  const selectThread = useCallback((id: string | null) => {
    setCurrentThreadId(id);
  }, []);

  async function handleSubmit(promptOverride?: string) {
    if (isStreaming || isLoadingModels || !models.some((model) => model.name === selectedModel)) {
      return;
    }

    const normalizedPrompt = (promptOverride ?? draft).trim();

    if (normalizedPrompt.length < 3 || normalizedPrompt.length > 4000) {
      setError('Please enter a message between 3 and 4,000 characters.');
      return;
    }

    setError(null);

    const userMsg = createMessage('user', normalizedPrompt, 'complete');
    const assistantMsg = createMessage('assistant', '', 'streaming', {
      model: selectedModel || undefined,
      provider: provider || undefined,
    });

    let activeThread = threadsRef.current.find((t) => t.id === currentThreadId);
    if (!activeThread) activeThread = createNewThread();

    const activeThreadId = activeThread.id;
    const isFirst = activeThread.messages.length === 0;
    const title = isFirst
      ? (normalizedPrompt.length > 40 ? normalizedPrompt.slice(0, 40) + '…' : normalizedPrompt)
      : activeThread.title;

    setThreads((prev) =>
      prev.map((t) =>
        t.id === activeThreadId
          ? {
              ...t,
              title,
              messages: [...t.messages, userMsg, assistantMsg],
              lastMessageAt: new Date().toISOString(),
            }
          : t,
      ),
    );

    const history = buildRequestHistory(activeThread.messages);

    setDraft('');
    setIsStreaming(true);
    const abort = new AbortController();
    streamAbortRef.current = abort;

    try {
      await streamAiResponse({
        prompt: normalizedPrompt,
        messages: history,
        model: selectedModel || undefined,
        signal: abort.signal,
        onEvent: (event: StreamEvent) => {
          setThreads((prev) =>
            prev.map((t) => {
              if (t.id !== activeThreadId) return t;
              const updatedMessages = t.messages.map((m) => {
                if (m.id !== assistantMsg.id) return m;

                if (event.type === 'start') {
                  return {
                    ...m,
                    requestId: event.requestId,
                    provider: event.provider,
                    model: event.model,
                    createdAt: event.generatedAt,
                  };
                }

                if (event.type === 'delta') {
                  return {
                    ...m,
                    content: m.content + event.delta,
                  };
                }

                if (event.type === 'done') {
                  return {
                    ...m,
                    status: 'complete' as const,
                    requestId: event.requestId,
                    provider: event.provider ?? m.provider,
                    model: event.model ?? m.model,
                    usage: event.usage,
                    timings: event.timings,
                    createdAt: event.generatedAt,
                  };
                }

                if (event.type === 'error') {
                  setError(event.message);
                  return {
                    ...m,
                    status: 'error' as const,
                    requestId: event.requestId,
                    createdAt: event.generatedAt,
                    content: m.content.trim() || 'The model could not complete this response.',
                  };
                }

                if (event.type === 'products_created') {
                  setProductsCreatedCount(event.count);
                  setTimeout(() => setProductsCreatedCount(null), 5000);
                }

                return m;
              });

              return { ...t, messages: updatedMessages };
            }),
          );
        },
      });
    } catch (e) {
      setThreads((prev) =>
        prev.map((t) => {
          if (t.id !== activeThreadId) return t;
          return {
            ...t,
            messages: t.messages.map((m) => {
              if (m.id !== assistantMsg.id) return m;
              if (e instanceof DOMException && e.name === 'AbortError') {
                return { ...m, status: 'complete' as const, content: m.content.trim() || 'Generation stopped.' };
              }
              const msg = e instanceof ApiError ? e.message : 'Unexpected streaming error.';
              setError(msg);
              return { ...m, status: 'error' as const, content: m.content.trim() || msg };
            }),
          };
        }),
      );
    } finally {
      if (streamAbortRef.current === abort) streamAbortRef.current = null;
      setIsStreaming(false);

      if (isLoggedIn) {
        const latestThread = threadsRef.current.find((t) => t.id === activeThreadId);
        if (latestThread) {
          void saveThread({ ...latestThread, title }).catch((err) => {
            console.error('Failed to persist chat thread:', err);
          });
        }
      }
    }
  }

  function stopStreaming() {
    streamAbortRef.current?.abort();
  }

  return {
    draft,
    setDraft,
    messages,
    threads,
    currentThreadId,
    models,
    provider,
    selectedModel,
    setSelectedModel,
    isStreaming,
    isLoadingModels,
    isLoadingHistory,
    error,
    modelError,
    productsCreatedCount,
    handleSubmit,
    stopStreaming,
    refreshModels: loadModels,
    createNewThread,
    selectThread,
    deleteThread,
  };
}
