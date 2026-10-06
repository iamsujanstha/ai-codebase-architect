import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ApiError,
  fetchAvailableModels,
  streamAiResponse,
} from '@/core/api/aiApi';
import { buildRequestHistory } from './history';
import type { ChatMessage, ChatThread } from '@/core/types/chat';
import type { AiModel, StreamEvent } from '@/core/types/api';

const MODEL_STORAGE_KEY = 'ai-code-assistant:selected-model';
const THREADS_STORAGE_KEY = 'ai-code-assistant:threads';
const CURRENT_THREAD_ID_KEY = 'ai-code-assistant:current-thread-id';

export const STARTER_PROMPTS = [
  'Explain microservices with a real-world example from Netflix.',
  'Design a production-ready NestJS API gateway for AI workloads.',
  'Show how to containerize a FastAPI service for local LLM development.',
  'Explain RAG using a practical SaaS support assistant example.',
];

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

export function useAiAssistant() {
  const [draft, setDraft] = useState('');
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  const [provider, setProvider] = useState('');
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(true);

  const streamAbortControllerRef = useRef<AbortController | null>(null);

  // Derived state
  const currentThread = threads.find(t => t.id === currentThreadId);
  const messages = currentThread?.messages ?? [];

  // Load threads and models on mount
  useEffect(() => {
    // 1. Load models
    void loadModels();

    // 2. Load threads from localStorage
    const savedThreads = window.localStorage.getItem(THREADS_STORAGE_KEY);
    if (savedThreads) {
      try {
        const parsed = JSON.parse(savedThreads) as ChatThread[];
        setThreads(parsed);
      } catch (e) {
        console.error('Failed to parse saved threads', e);
      }
    }

    // 3. Load current thread ID
    const savedId = window.localStorage.getItem(CURRENT_THREAD_ID_KEY);
    if (savedId) {
      setCurrentThreadId(savedId);
    }
    setHistoryLoaded(true);
  }, []);

  // Persist threads to localStorage whenever they change
  useEffect(() => {
    if (historyLoaded) {
      window.localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads));
    }
  }, [threads, historyLoaded]);

  // Persist current thread ID
  useEffect(() => {
    if (!historyLoaded) return;
    if (currentThreadId) {
      window.localStorage.setItem(CURRENT_THREAD_ID_KEY, currentThreadId);
    } else {
      window.localStorage.removeItem(CURRENT_THREAD_ID_KEY);
    }
  }, [currentThreadId, historyLoaded]);

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

      // If we have a stored model and it's still available, use it.
      // Otherwise, pick the default from backend or the first one in the list.
      const nextModel = hasStoredModel
        ? (storedModel as string)
        : modelsResponse.models.find((model) => model.name === modelsResponse.defaultModel)?.name || modelsResponse.models[0]?.name || '';

      setSelectedModel(nextModel);

      if (nextModel) {
        setSelectedModel(nextModel);
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

  useEffect(() => {
    if (!selectedModel) {
      return;
    }
    window.localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  const createNewThread = () => {
    const newThread: ChatThread = {
      id: crypto.randomUUID(),
      title: 'New Conversation',
      messages: [],
      lastMessageAt: new Date().toISOString(),
    };
    setThreads(prev => [newThread, ...prev]);
    setCurrentThreadId(newThread.id);
    return newThread;
  };

  const deleteThread = (id: string) => {
    setThreads(prev => prev.filter(t => t.id !== id));
    if (currentThreadId === id) {
      setCurrentThreadId(null);
    }
  };

  const selectThread = (id: string) => {
    setCurrentThreadId(id);
  };

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
    const userMessage = createMessage('user', normalizedPrompt, 'complete');
    const assistantMessage = createMessage('assistant', '', 'streaming', {
      model: selectedModel || undefined,
      provider: provider || undefined,
    });

    // Ensure we have a thread to work with
    let activeThread = currentThread;
    if (!activeThread) {
      activeThread = createNewThread();
    }

    const isFirstMessage = activeThread.messages.length === 0;
    const threadTitle = isFirstMessage ? (normalizedPrompt.length > 30 ? normalizedPrompt.slice(0, 30) + '...' : normalizedPrompt) : activeThread.title;

    // Update thread state immediately with user message and empty assistant placeholder
    setThreads(prev => prev.map(t =>
      t.id === activeThread!.id
        ? {
          ...t,
          title: threadTitle,
          messages: [...t.messages, userMessage, assistantMessage],
          lastMessageAt: new Date().toISOString()
        }
        : t
    ));

    // Prepare history for AI, filtering out empty placeholders
    const history = buildRequestHistory(activeThread.messages);

    setDraft('');
    setIsStreaming(true);
    const abortController = new AbortController();
    streamAbortControllerRef.current = abortController;

    try {
      await streamAiResponse({
        prompt: normalizedPrompt,
        messages: history, // Send history for context
        model: selectedModel || undefined,
        signal: abortController.signal,
        onEvent: (event: StreamEvent) => {
          setThreads(prev => prev.map(t => {
            if (t.id !== activeThread!.id) return t;

            const updatedMessages = t.messages.map(m => {
              if (m.id !== assistantMessage.id) return m;

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
                  content: `${m.content}${event.delta}`,
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
                  content: m.content.trim() || 'The local model could not complete this response.',
                };
              }

              return m;
            });

            return { ...t, messages: updatedMessages };
          }));
        },
      });
    } catch (caughtError) {
      // Handle abort and API errors by updating the message status
      setThreads(prev => prev.map(t => {
        if (t.id !== activeThread!.id) return t;
        const updatedMessages = t.messages.map(m => {
          if (m.id !== assistantMessage.id) return m;

          if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
            return { ...m, status: 'complete' as const, content: m.content.trim() || 'Generation stopped.' };
          }

          const errorMsg = caughtError instanceof ApiError ? caughtError.message : 'Unexpected streaming error.';
          setError(errorMsg);
          return { ...m, status: 'error' as const, content: m.content.trim() || errorMsg };
        });
        return { ...t, messages: updatedMessages };
      }));
    } finally {
      if (streamAbortControllerRef.current === abortController) {
        streamAbortControllerRef.current = null;
      }
      setIsStreaming(false);
    }
  }

  function stopStreaming() {
    streamAbortControllerRef.current?.abort();
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
    error,
    modelError,
    handleSubmit,
    stopStreaming,
    refreshModels: loadModels,
    createNewThread,
    selectThread,
    deleteThread,
  };
}
