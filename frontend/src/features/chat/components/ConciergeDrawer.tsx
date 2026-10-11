import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useCart } from '@/features/store/CartContext';
import { useAIConcierge } from '../AIConciergeContext';
import { DEMO_PRODUCTS } from '@/features/store/StorefrontPage';
import type { CatalogProduct } from '@/core/types/catalog';

interface ConciergeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  products?: CatalogProduct[];
}

/**
 * ConciergeDrawer - AI concierge drawer matching atlas-app.html design.
 * Features:
 * - Scrim overlay (on mobile/tablet) and side-docking on desktop (>=1100px)
 * - Model selector dropdown in header (Local Ollama / Cloud models)
 * - Interactive chat message stream
 * - Mini product cards with 1-click "Add to cart"
 * - Dynamic context status line
 * - Quick prompt suggestion pills
 * - Integrated auto-expanding composer
 */
export function ConciergeDrawer({ isOpen, onClose }: ConciergeDrawerProps): JSX.Element | null {
  const { itemCount, addItem } = useCart();
  const { selectedModel, setSelectedModel } = useAIConcierge();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hi! Tell me what you're setting up and I'll suggest products from the catalog.",
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [isWide, setIsWide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1100px)').matches : false
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Monitor screen width for docking vs scrim behavior
  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1100px)');
    const handler = (e: MediaQueryListEvent) => setIsWide(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Handle body.dock class on wide screens when open
  useEffect(() => {
    if (isOpen && isWide) {
      document.body.classList.add('dock');
    } else {
      document.body.classList.remove('dock');
    }
    return () => {
      document.body.classList.remove('dock');
    };
  }, [isOpen, isWide]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Focus textarea when drawer opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const generateReply = (query: string): { text: string; products: CatalogProduct[] } => {
    const q = query.toLowerCase();
    const words = q.split(/\W+/).filter((w) => w.length > 2);

    let matched = DEMO_PRODUCTS.filter((p) => {
      const haystack = `${p.name} ${p.subtitle || ''} ${p.categorySlug}`.toLowerCase();
      return words.some((w) => haystack.includes(w.replace(/s$/, '')));
    });

    if (/cart|bought|have|match|complement/.test(q)) {
      matched = DEMO_PRODUCTS.filter((p) => (p.rating || 0) >= 4.7);
    }

    if (!matched.length) {
      matched = [...DEMO_PRODUCTS].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    const picks = matched.slice(0, 3);
    const text = `Here are ${picks.length} picks that fit${
      itemCount > 0 ? ", chosen to go with what's in your cart" : ''
    }:`;

    return { text, products: picks };
  };

  const handleSend = (textToSend?: string) => {
    const text = (textToSend ?? inputValue).trim();
    if (!text) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    // Simulate AI response stream matching atlas-app.html reply behavior
    setTimeout(() => {
      const { text: replyText, products } = generateReply(text);
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: replyText,
        products,
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 450);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (prompt: string) => {
    handleSend(prompt);
  };

  const handleAddToCart = (product: CatalogProduct) => {
    addItem(product, 1);
    setAddedIds((prev) => ({ ...prev, [product.id]: true }));
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Scrim overlay shown on mobile/tablet or when not docked */}
      {!isWide && <div className="scrim" onClick={onClose} />}

      {/* Drawer panel */}
      <aside className="drawer" id="aid" aria-label="AI concierge">
        {/* Header */}
        <div className="dh">
          <span>AI concierge</span>
          <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              className="model"
              id="m1"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              aria-label="Model"
            >
              <optgroup label="Local (Ollama)">
                <option value="llama3">llama3</option>
                <option value="deepseek-coder:6.7b">deepseek-coder:6.7b</option>
              </optgroup>
              <optgroup label="Cloud">
                <option value="GPT-4o">GPT-4o</option>
                <option value="Claude 3.5 Sonnet">Claude 3.5 Sonnet</option>
                <option value="Gemini 2.0">Gemini 2.0</option>
              </optgroup>
            </select>
            <button
              className="icon-btn"
              onClick={onClose}
              aria-label="Close"
              type="button"
            >
              <X size={20} />
            </button>
          </span>
        </div>

        {/* Messages body */}
        <div className="db" id="ai-db">
          <div className="msgs">
            {messages.map((msg) => (
              <div key={msg.id} className={`m ${msg.role === 'user' ? 'u' : 'a'}`}>
                {msg.content}
                {msg.products && msg.products.length > 0 && (
                  <div style={{ marginTop: '8px' }}>
                    {msg.products.map((prod) => (
                      <div key={prod.id} className="mini">
                        <div
                          className="th"
                          style={{
                            background: `linear-gradient(145deg, ${prod.visual.gradientFrom}, ${prod.visual.gradientTo})`,
                          }}
                          aria-hidden="true"
                        >
                          {prod.visual.glyph}
                        </div>
                        <div>
                          <b>{prod.name}</b>
                          <span>${prod.price} · ★ {prod.rating}</span>
                        </div>
                        <button
                          className="btn"
                          style={{ padding: '6px 12px' }}
                          type="button"
                          disabled={addedIds[prod.id]}
                          onClick={() => handleAddToCart(prod)}
                        >
                          {addedIds[prod.id] ? 'Added' : 'Add'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Footer with composer */}
        <div className="df" id="ai-df">
          <div className="ctx" data-shop>
            Context: All products · {itemCount} in cart · {selectedModel}
          </div>

          {/* Suggestions */}
          <div className="sug">
            <button
              type="button"
              onClick={() => handleSuggestion('Build me a quiet home-office setup')}
            >
              Build me a quiet home-office setup
            </button>
            <button
              type="button"
              onClick={() => handleSuggestion('What goes with my cart?')}
            >
              What goes with my cart?
            </button>
            <button
              type="button"
              onClick={() => handleSuggestion('Best audio under $250')}
            >
              Best audio under $250
            </button>
          </div>

          {/* Composer */}
          <form
            className="comp"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Ask about products"
              aria-label="Message"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button className="go" type="submit" aria-label="Send">
              ↑
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
