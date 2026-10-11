import { createContext, useContext, useState, useMemo, ReactNode } from 'react';

interface AIConciergeContextValue {
  isConciergeOpen: boolean;
  openConcierge: () => void;
  closeConcierge: () => void;
  toggleConcierge: () => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;
}

const AIConciergeContext = createContext<AIConciergeContextValue | undefined>(undefined);

export function AIConciergeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isConciergeOpen, setIsConciergeOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('llama3');

  const openConcierge = () => setIsConciergeOpen(true);
  const closeConcierge = () => setIsConciergeOpen(false);
  const toggleConcierge = () => setIsConciergeOpen((prev) => !prev);

  const value = useMemo(
    () => ({
      isConciergeOpen,
      openConcierge,
      closeConcierge,
      toggleConcierge,
      selectedModel,
      setSelectedModel,
    }),
    [isConciergeOpen, selectedModel]
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
