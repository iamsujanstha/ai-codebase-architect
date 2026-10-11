import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface ConciergeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

/**
 * ConciergeDrawer - AI chat drawer matching atlas-app.html design.
 * Includes scrim overlay, drawer panel, messages, and composer.
 */
export function ConciergeDrawer({ isOpen, onClose }: ConciergeDrawerProps): JSX.Element | null {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hi! Tell me what you\'re setting up and I\'ll suggest products from the catalog.',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');

    // Simulate AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: 'I can help you find the perfect products for your setup. Could you tell me more about what you\'re looking for?',
      };
      setMessages((prev) => [...prev, aiMessage]);
    }, 800);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (text: string) => {
    setInputValue(text);
    textareaRef.current?.focus();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Scrim overlay */}
      <div className="scrim" onClick={onClose} />

      {/* Drawer panel */}
      <aside className="drawer" id="aid" aria-label="AI concierge">
        {/* Header */}
        <div className="dh">
          <span>AI concierge</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {/* Messages body */}
        <div className="db">
          <div className="msgs">
            {messages.map((msg) => (
              <div key={msg.id} className={`m ${msg.role === 'user' ? 'u' : 'a'}`}>
                {msg.content}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Footer with composer */}
        <div className="df">
          <div className="ctx" data-shop>
            Context: All products · 0 in cart
          </div>

          {/* Suggestions */}
          <div className="sug">
            <button type="button" onClick={() => handleSuggestion('Build me a quiet home-office setup')}>
              Build me a quiet home-office setup
            </button>
            <button type="button" onClick={() => handleSuggestion('What goes with my cart?')}>
              What goes with my cart?
            </button>
            <button type="button" onClick={() => handleSuggestion('Best audio under $250')}>
              Best audio under $250
            </button>
          </div>

          {/* Composer */}
          <form className="comp" onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
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
