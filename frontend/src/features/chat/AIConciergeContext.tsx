import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { fetchAvailableModels } from '@/core/api/aiApi';
import type { AiModel } from '@/core/types/api';

interface AIConciergeContextValue {
  isConciergeOpen: boolean;
  openConcierge: () => void;
  closeConcierge: () => void;
  toggleConcierge: () => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  availableModels: AiModel[];
  isLoadingModels: boolean;
  refreshModels: () => Promise<void>;
}

const AIConciergeContext = createContext<AIConciergeContextValue | undefined>(
  undefined,
);

export function AIConciergeProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [isConciergeOpen, setIsConciergeOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<AiModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const openConcierge = () => setIsConciergeOpen(true);
  const closeConcierge = () => setIsConciergeOpen(false);
  const toggleConcierge = () => setIsConciergeOpen((prev) => !prev);

  const loadModels = useCallback(async () => {
    try {
      setIsLoadingModels(true);
      const res = await fetchAvailableModels();
      // Filter out embedding-only models
      const chatModels: AiModel[] = (res.models || []).filter(
        (m: AiModel) => !m.name.toLowerCase().includes('embed'),
      );
      setAvailableModels(chatModels);

      const defaultChoice =
        chatModels.find((m: AiModel) => m.name === 'qwen:latest')?.name ||
        chatModels.find((m: AiModel) => m.name === res.defaultModel)?.name ||
        chatModels[0]?.name ||
        'qwen:latest';

      setSelectedModel((current) => current || defaultChoice);
    } catch (err) {
      console.warn('Failed to dynamically load Ollama models:', err);
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const value = useMemo(
    () => ({
      isConciergeOpen,
      openConcierge,
      closeConcierge,
      toggleConcierge,
      selectedModel,
      setSelectedModel,
      availableModels,
      isLoadingModels,
      refreshModels: loadModels,
    }),
    [isConciergeOpen, selectedModel, availableModels, isLoadingModels, loadModels],
  );

  return (
    <AIConciergeContext.Provider value={value}>
      {children}
    </AIConciergeContext.Provider>
  );
}

export function useAIConcierge(): AIConciergeContextValue {
  const context = useContext(AIConciergeContext);
  if (!context) {
    throw new Error('useAIConcierge must be used within an AIConciergeProvider');
  }
  return context;
}
