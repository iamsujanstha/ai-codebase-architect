import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, RotateCcw } from 'lucide-react';
import { useCart } from '@/features/store/CartContext';
import { useAIConcierge } from '../AIConciergeContext';
import { fetchCatalogProducts } from '@/core/api/catalogApi';
import { streamAiResponse } from '@/core/api/aiApi';
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
  isStreaming?: boolean;
}

function createDefaultProduct(
  id: string,
  slug: string,
  name: string,
  subtitle: string,
  categorySlug: string,
  price: number,
  rating: number,
  glyph: string,
  from: string,
  to: string,
): CatalogProduct {
  return {
    id,
    slug,
    name,
    subtitle,
    shortDescription: subtitle,
    description: subtitle,
    price,
    compareAtPrice: price * 1.2,
    currency: 'USD',
    rating,
    reviewCount: 95,
    inventoryCount: 20,
    categorySlug,
    categoryName: categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1),
    tags: [categorySlug, 'workspace'],
    keyHighlights: ['Curated workspace design'],
    heroBadge: 'Best Seller',
    featured: true,
    bestSeller: true,
    newArrival: false,
    visual: {
      gradientFrom: from,
      gradientTo: to,
      accent: from,
      glyph,
    },
    specs: [],
  };
}

const DEFAULT_WORKSPACE_CATALOG: CatalogProduct[] = [
  createDefaultProduct(
    '1',
    'walnut-desk-mat',
    'Walnut Desk Mat & Pad',
    'Premium vegan leather & natural cork base',
    'accessories',
    48,
    4.9,
    '🪵',
    '#4a3728',
    '#2b1d14',
  ),
  createDefaultProduct(
    '2',
    'screenbar-halo-light',
    'ScreenBar Halo Monitor Light',
    'Asymmetric optical design, zero screen glare',
    'lighting',
    139,
    4.9,
    '💡',
    '#f5af19',
    '#f12711',
  ),
  createDefaultProduct(
    '3',
    'keychron-q1-pro',
    'Keychron Q1 Pro Wireless Keyboard',
    'CNC aluminum body, QMK/VIA, hot-swappable',
    'electronics',
    199,
    4.8,
    '⌨️',
    '#2c3e50',
    '#3498db',
  ),
  createDefaultProduct(
    '4',
    'ergonomic-chair',
    'Ergonomic Task Chair',
    'Synchronized tilt mechanism with 4D armrests',
    'furniture',
    480,
    4.9,
    '🪑',
    '#232526',
    '#414345',
  ),
  createDefaultProduct(
    '5',
    'walnut-monitor-stand',
    'Solid Walnut Dual Monitor Stand',
    'Integrated aluminum drawer and cable pass',
    'furniture',
    145,
    4.85,
    '🖥️',
    '#5c4033',
    '#3d2b1f',
  ),
  createDefaultProduct(
    '6',
    'cable-tray',
    'Magnetic Cable Management Tray',
    'Under-desk steel raceway with silicon ties',
    'accessories',
    34,
    4.7,
    '🧲',
    '#614385',
    '#516395',
  ),
  createDefaultProduct(
    '7',
    'studio-headphones',
    'Noise-Cancelling Studio Headphones',
    'High-res audio drivers with spatial acoustics',
    'electronics',
    299,
    4.88,
    '🎧',
    '#1e3c72',
    '#2a5298',
  ),
  createDefaultProduct(
    '8',
    'oak-wrist-rest',
    'Solid Oak Mechanical Keyboard Wrist Rest',
    'Beveled ergonomic angle with anti-slip pads',
    'accessories',
    28,
    4.75,
    '🪵',
    '#d4a373',
    '#a98467',
  ),
];

function InlineFormatted({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={idx}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return <em key={idx}>{part.slice(1, -1)}</em>;
        }
        return <span key={idx}>{part}</span>;
      })}
    </>
  );
}

function FormattedMessage({ content }: { content: string }) {
  const paragraphs = content.split(/\n\s*\n/);
  return (
    <div className="m-content">
      {paragraphs.map((para, i) => {
        const lines = para.trim().split('\n');
        const isBulletList = lines.length > 1 && lines.every((l) => /^[-*•]\s+/.test(l.trim()));
        if (isBulletList) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>
                  <InlineFormatted text={l.replace(/^[-*•]\s+/, '')} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((line, k) => (
              <span key={k}>
                <InlineFormatted text={line} />
                {k < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function generateFallbackReply(query: string): string {
  const q = query.toLowerCase();
  if (q.includes('walnut') || q.includes('desk')) {
    return 'For a walnut desk, pairing warm natural wood tones with matte black aluminum and warm 3000K lighting creates an elevated, distraction-free aesthetic. Here are curated pieces from our catalog that fit your workspace:';
  }
  if (q.includes('light') || q.includes('lighting')) {
    return 'Ergonomic lighting should illuminate your workstation without bouncing glare off the display. An asymmetric screenbar paired with soft warm task lighting helps prevent eye fatigue during focused sessions:';
  }
  if (q.includes('keyboard') || q.includes('mechanical')) {
    return 'For extended typing and coding sessions, a custom mechanical keyboard with tactile switches and a solid wood wrist rest provides optimal ergonomics and satisfying acoustic feedback:';
  }
  return 'Here are our top recommendations tailored to enhance your workstation setup:';
}

export function ConciergeDrawer({
  isOpen,
  onClose,
}: ConciergeDrawerProps): JSX.Element | null {
  const { itemCount, addItem } = useCart();
  const {
    selectedModel,
    setSelectedModel,
    availableModels,
    isLoadingModels,
  } = useAIConcierge();

  const [catalog, setCatalog] = useState<CatalogProduct[]>(DEFAULT_WORKSPACE_CATALOG);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        "Hi! I'm your AI Concierge. Tell me what kind of desk setup or workspace you're designing, and I'll find the best gear from our catalog.",
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [isSending, setIsSending] = useState(false);

  const handleReset = () => {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content:
          "Hi! I'm your AI Concierge. Tell me what kind of desk setup or workspace you're designing, and I'll find the best gear from our catalog.",
      },
    ]);
  };
  const [isWide, setIsWide] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(min-width: 1100px)').matches
      : false,
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load live catalog products
  useEffect(() => {
    fetchCatalogProducts({ limit: 100 })
      .then((res) => {
        if (res.items && res.items.length > 0) {
          setCatalog(res.items);
        }
      })
      .catch(() => {
        // Fallback remains DEFAULT_WORKSPACE_CATALOG
      });
  }, []);

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

  const STOP_WORDS = new Set([
    'what', 'is', 'the', 'of', 'for', 'and', 'are', 'out', 'list', 'show',
    'price', 'tell', 'me', 'have', 'with', 'about', 'some', 'any', 'can',
    'you', 'give', 'how', 'much', 'does', 'cost', 'product', 'products',
    'item', 'items', 'recommend', 'recommendation', 'recommendations',
    'device', 'devices', 'gadget', 'gadgets', 'shop', 'store', 'good',
    'best', 'popular', 'all',
  ]);

  const SYNONYM_MAP: Record<string, string[]> = {
    apple: ['apple', 'macbook', 'ipad', 'airpods'],
    mac: ['macbook', 'apple'],
    macbook: ['macbook', 'laptop', 'apple'],
    ipad: ['ipad', 'tablet', 'apple'],
    airpods: ['airpods', 'apple', 'earbuds', 'headphones'],
    iphone: ['apple', 'airpods', 'ipad', 'macbook'],
    samsung: ['samsung', 'galaxy', 'tab'],
    galaxy: ['samsung', 'galaxy', 'tab'],
    dell: ['dell', 'xps'],
    xps: ['dell', 'xps'],
    sony: ['sony', '1000xm5'],
    logitech: ['logitech', 'mx master'],
    keychron: ['keychron', 'keyboard'],
    laptop: ['laptop', 'macbook', 'xps'],
    laptops: ['laptop', 'macbook', 'xps'],
    tablet: ['ipad', 'galaxy tab', 'tab'],
    tablets: ['ipad', 'galaxy tab', 'tab'],
    headphone: ['airpods', 'sony', '1000xm5'],
    headphones: ['airpods', 'sony', '1000xm5'],
    earbuds: ['airpods'],
    audio: ['airpods', 'sony', '1000xm5', 'microphone'],
    keyboard: ['keyboard', 'keychron', 'mechanical'],
    keyboards: ['keyboard', 'keychron', 'mechanical'],
    mouse: ['mouse', 'logitech', 'mx master'],
    mice: ['mouse', 'logitech', 'mx master'],
    monitor: ['monitor', 'lg 27'],
    monitors: ['monitor', 'lg 27'],
    desk: ['standing desk'],
    desks: ['standing desk'],
    chair: ['ergochair', 'chair'],
    chairs: ['ergochair', 'chair'],
    book: ['clean code', 'designing data-intensive', 'system design', 'pragmatic', 'domain-driven', 'code complete', 'devops'],
    books: ['clean code', 'designing data-intensive', 'system design', 'pragmatic', 'domain-driven', 'code complete', 'devops'],
    software: ['adobe', 'jetbrains'],
  };

  const findProductsMentionedInText = (text: string): CatalogProduct[] => {
    if (!text) return [];
    const lower = text.toLowerCase();
    const matched: CatalogProduct[] = [];
    for (const p of catalog) {
      const name = p.name.toLowerCase();
      const simplified = name.replace(/[^a-z0-9 ]/g, ' ').trim();
      const tokens = simplified.split(/\s+/).filter(Boolean);
      const prefix = tokens.slice(0, 2).join(' ');
      if (lower.includes(name) || lower.includes(simplified) || (prefix.length >= 6 && lower.includes(prefix))) {
        if (!matched.some((m) => m.id === p.id)) {
          matched.push(p);
        }
      }
    }
    return matched;
  };

  const findMatchingProducts = (query: string): CatalogProduct[] => {
    const q = query.toLowerCase();
    const rawWords = q.split(/\W+/).filter((w) => w.length > 1);
    const keywords = rawWords.filter((w) => !STOP_WORDS.has(w));

    // Expand search keywords with synonyms (e.g. apple -> macbook, ipad, airpods)
    const searchTerms = new Set<string>(keywords);
    for (const kw of keywords) {
      if (SYNONYM_MAP[kw]) {
        for (const syn of SYNONYM_MAP[kw]) {
          searchTerms.add(syn);
        }
      }
    }

    if (searchTerms.size > 0) {
      const scored = catalog
        .map((p) => {
          const nameLower = p.name.toLowerCase();
          const haystack = `${nameLower} ${p.subtitle || ''} ${p.categorySlug || ''} ${(p.tags || []).join(' ')}`.toLowerCase();
          let score = 0;
          for (const term of searchTerms) {
            if (nameLower.includes(term)) {
              score += 4;
            } else if (haystack.includes(term)) {
              score += 1;
            }
          }
          return { product: p, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        return scored.slice(0, 4).map((s) => s.product);
      }
    }

    // Contextual match for broad desk/workspace/lighting setups
    if (/desk|setup|lighting|light|keyboard|audio|chair|workspace/.test(q)) {
      return [...catalog]
        .sort((a, b) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 3);
    }

    return [];
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? inputValue).trim();
    if (!text || isSending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
    };

    const aiMsgId = `ai-${Date.now()}`;
    const products = findMatchingProducts(text);

    const initialAiMessage: Message = {
      id: aiMsgId,
      role: 'assistant',
      content: '',
      products,
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, initialAiMessage]);
    setInputValue('');
    setIsSending(true);

    try {
      let accumulated = '';
      // Only include valid previous messages for clean conversation context
      const history = messages
        .filter((m) => m.content && m.content.trim().length > 0)
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      let streamedCitations: CatalogProduct[] = [];
      await streamAiResponse({
        prompt: text,
        model: selectedModel || 'qwen:latest',
        messages: history,
        onEvent: (event) => {
          if (event.type === 'citations') {
            streamedCitations = event.products;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMsgId ? { ...msg, products: event.products } : msg,
              ),
            );
          } else if (event.type === 'delta') {
            accumulated += event.delta;
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMsgId ? { ...msg, content: accumulated } : msg,
              ),
            );
          } else if (event.type === 'done') {
            const finalProducts =
              streamedCitations.length > 0
                ? streamedCitations
                : (findProductsMentionedInText(accumulated).length > 0
                    ? findProductsMentionedInText(accumulated)
                    : (products.length > 0 ? products : findMatchingProducts(accumulated)));
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMsgId
                  ? {
                      ...msg,
                      content:
                        accumulated || generateFallbackReply(text),
                      products: finalProducts,
                      isStreaming: false,
                    }
                  : msg,
              ),
            );
          }
        },
      });
    } catch (err: any) {
      console.warn('Live stream error, using fallback reply:', err);
      const fallback = generateFallbackReply(text);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMsgId
            ? {
                ...msg,
                content: msg.content || fallback,
                isStreaming: false,
              }
            : msg,
        ),
      );
    } finally {
      setIsSending(false);
    }
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
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={18} style={{ color: '#3b82f6' }} />
            <span>AI Concierge</span>
          </span>
          <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              className="model"
              id="m1"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              aria-label="Model"
              disabled={isLoadingModels}
            >
              {availableModels.length > 0 ? (
                <optgroup label="Downloaded Ollama Models">
                  {availableModels.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name} {m.sizeLabel ? `(${m.sizeLabel})` : ''}
                    </option>
                  ))}
                </optgroup>
              ) : (
                <option value="qwen:latest">qwen:latest (4B)</option>
              )}
            </select>
            <button
              className="icon-btn"
              onClick={handleReset}
              aria-label="Clear conversation"
              title="Clear conversation"
              type="button"
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="icon-btn"
              onClick={onClose}
              aria-label="Close concierge"
              type="button"
            >
              <X size={20} />
            </button>
          </span>
        </div>

        {/* Messages body */}
        <div className="db">
          <div className="msgs">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              return (
                <div
                  key={message.id}
                  className={`m ${isUser ? 'u' : 'a'}`}
                >
                  {!isUser && (
                    <div className="ai-badge">
                      <Sparkles size={11} />
                      <span>AI Concierge</span>
                      {selectedModel && (
                        <span className="ai-badge-model">
                          {selectedModel.replace(':latest', '')}
                        </span>
                      )}
                    </div>
                  )}

                  {isUser && (
                    <div style={{ fontSize: '11px', fontWeight: 600, opacity: 0.85, marginBottom: '4px' }}>
                      You
                    </div>
                  )}

                  {message.content ? (
                    <>
                      <FormattedMessage content={message.content} />
                      {message.isStreaming && <span className="streaming-cursor" />}
                    </>
                  ) : message.isStreaming ? (
                    <div className="ai-thinking">
                      <span className="dots">
                        <span className="dot" />
                        <span className="dot" />
                        <span className="dot" />
                      </span>
                      <span>Thinking with {selectedModel || 'AI'}…</span>
                    </div>
                  ) : null}

                  {/* Attached Product recommendations */}
                  {!isUser &&
                    message.products &&
                    message.products.length > 0 && (
                      <div className="prods">
                        {message.products.map((p) => {
                          const isAdded = addedIds[p.id];
                          return (
                            <div key={p.id} className="pcard">
                              <div
                                className="pv"
                                style={
                                  p.visual
                                    ? {
                                        background: `linear-gradient(135deg, ${p.visual.gradientFrom}, ${p.visual.gradientTo})`,
                                      }
                                    : undefined
                                }
                              >
                                <span>{p.visual?.glyph || '📦'}</span>
                              </div>
                              <div className="pi">
                                <div className="pt">{p.name}</div>
                                <div className="pp">
                                  ${p.price.toFixed(2)} · ★ {(p.rating || 4.8).toFixed(1)}
                                </div>
                              </div>
                              <button
                                className={`pb ${isAdded ? 'added' : ''}`}
                                onClick={() => handleAddToCart(p)}
                                type="button"
                              >
                                {isAdded ? 'Added ✓' : 'Add to cart'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Footer */}
        <div className="df">
          <div className="ctx">
            Context: All products · {itemCount} in cart ·{' '}
            {selectedModel || 'qwen:latest'}
          </div>

          {/* Quick prompts */}
          <div className="chips">
            <button
              className="chip"
              type="button"
              onClick={() =>
                handleSuggestion(
                  'What would look great with a walnut desk?',
                )
              }
            >
              Walnut desk setup
            </button>
            <button
              className="chip"
              type="button"
              onClick={() =>
                handleSuggestion(
                  'Recommend an ergonomic lighting setup',
                )
              }
            >
              Ergonomic lighting
            </button>
            <button
              className="chip"
              type="button"
              onClick={() =>
                handleSuggestion(
                  'Best developer mechanical keyboards',
                )
              }
            >
              Developer keyboards
            </button>
          </div>

          {/* Composer */}
          <div className="comp">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder={`Ask ${selectedModel || 'AI Concierge'} about desk setups…`}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending}
            />
            <button
              className="send"
              onClick={() => handleSend()}
              disabled={!inputValue.trim() || isSending}
              type="button"
              aria-label="Send message"
            >
              {isSending ? '…' : '↑'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
