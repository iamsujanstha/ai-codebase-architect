import {
  startTransition,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ApiError,
  fetchAvailableModels,
  streamAiResponse,
} from '@/core/api/aiApi';
import type { ChatMessage } from '@/core/types/chat';
import type { LocalModel, StreamEvent } from '@/core/types/api';

const MODEL_STORAGE_KEY = 'ai-code-assistant:selected-model';

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
  const [draft, setDraft] = useState(
    'Explain microservices with a real-world example from Netflix, and explain why API gateways matter in AI SaaS platforms.',
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [models, setModels] = useState<LocalModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(true);

  const streamAbortControllerRef = useRef<AbortController | null>(null);

  async function loadModels() {
    setIsLoadingModels(true);
    setModelError(null);

    try {
      const modelsResponse = await fetchAvailableModels();
      setModels(modelsResponse.models);

      const storedModel = window.localStorage.getItem(MODEL_STORAGE_KEY);
      const hasStoredModel = modelsResponse.models.some(
        (model) => model.name === storedModel,
      );

      const nextModel = hasStoredModel
        ? storedModel ?? ''
        : modelsResponse.defaultModel || modelsResponse.models[0]?.name || '';

      setSelectedModel(nextModel);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setModelError(caughtError.message);
      } else {
        setModelError('The app could not load local Ollama models.');
      }
    } finally {
      setIsLoadingModels(false);
    }
  }

  useEffect(() => {
    void loadModels();
  }, []);

  useEffect(() => {
    if (!selectedModel) {
      return;
    }

    window.localStorage.setItem(MODEL_STORAGE_KEY, selectedModel);
  }, [selectedModel]);

  async function handleSubmit(promptOverride?: string) {
    if (isStreaming) {
      return;
    }

    const normalizedPrompt = (promptOverride ?? draft).trim();

    if (!normalizedPrompt) {
      setError('Please enter a prompt before submitting.');
      return;
    }

    setError(null);
    const userMessage = createMessage('user', normalizedPrompt, 'complete');
    const assistantMessage = createMessage('assistant', '', 'streaming', {
      model: selectedModel || undefined,
      provider: 'ollama-local',
    });

    setMessages((previousMessages) => [
      ...previousMessages,
      userMessage,
      assistantMessage,
    ]);

    setDraft('');

    setIsStreaming(true);
    const abortController = new AbortController();
    streamAbortControllerRef.current = abortController;

    try {
      await streamAiResponse({
        prompt: normalizedPrompt,
        model: selectedModel || undefined,
        signal: abortController.signal,
        onEvent: (event: StreamEvent) => {
          if (event.type === 'start') {
            startTransition(() => {
              setMessages((previousMessages) =>
                previousMessages.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        requestId: event.requestId,
                        provider: event.provider,
                        model: event.model,
                        createdAt: event.generatedAt,
                      }
                    : message,
                ),
              );
            });

            return;
          }

          if (event.type === 'delta') {
            startTransition(() => {
              setMessages((previousMessages) =>
                previousMessages.map((message) =>
                  message.id === assistantMessage.id
                    ? {
                        ...message,
                        content: `${message.content}${event.delta}`,
                      }
                    : message,
                ),
              );
            });

            return;
          }

          if (event.type === 'done') {
            setMessages((previousMessages) =>
              previousMessages.map((message) =>
                message.id === assistantMessage.id
                  ? {
                      ...message,
                      status: 'complete',
                      requestId: event.requestId,
                      provider: event.provider,
                      model: event.model,
                      usage: event.usage,
                      timings: event.timings,
                      createdAt: event.generatedAt,
                    }
                  : message,
              ),
            );

            return;
          }

          setError(event.message);
          setMessages((previousMessages) =>
            previousMessages.map((message) =>
              message.id === assistantMessage.id
                ? {
                    ...message,
                    status: 'error',
                    requestId: event.requestId,
                    createdAt: event.generatedAt,
                    content:
                      message.content.trim() || 'The local model could not complete this response.',
                  }
                : message,
            ),
          );
        },
      });
    } catch (caughtError) {
      if (caughtError instanceof DOMException && caughtError.name === 'AbortError') {
        setMessages((previousMessages) =>
          previousMessages.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  status: 'complete',
                  content:
                    message.content.trim() || 'Generation stopped before content arrived.',
                }
              : message,
          ),
        );
      } else if (caughtError instanceof ApiError) {
        setError(caughtError.message);
        setMessages((previousMessages) =>
          previousMessages.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  status: 'error',
                  content:
                    message.content.trim() || caughtError.message,
                }
              : message,
          ),
        );
      } else {
        setError('The frontend hit an unexpected streaming error.');
        setMessages((previousMessages) =>
          previousMessages.map((message) =>
            message.id === assistantMessage.id
              ? {
                  ...message,
                  status: 'error',
                  content:
                    message.content.trim() ||
                    'The frontend hit an unexpected streaming error.',
                }
              : message,
          ),
        );
      }
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
    models,
    selectedModel,
    setSelectedModel,
    isStreaming,
    isLoadingModels,
    error,
    modelError,
    handleSubmit,
    stopStreaming,
    refreshModels: loadModels,
  };
}
