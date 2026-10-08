import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
  content: string;
}

function CopyCode({ content }: { content: string }) {
  const [label, setLabel] = useState('Copy');
  return (
    <button
      className="code-block-copy"
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(content);
          setLabel('Copied');
          setTimeout(() => setLabel('Copy'), 1600);
        } catch {
          setLabel('Copy unavailable');
        }
      }}
    >
      {label}
    </button>
  );
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="markdown-root">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ children, className }) {
            return <code className={className || 'inline-code'}>{children}</code>;
          },
          pre({ children }) {
            const child = React.Children.toArray(children)[0];
            if (!React.isValidElement<{ className?: string; children?: React.ReactNode }>(child)) {
              return <pre>{children}</pre>;
            }
            const language = /language-([\w-]+)/.exec(child.props.className || '')?.[1] || 'text';
            const code = String(child.props.children ?? '').replace(/\n$/, '');
            return (
              <div className="code-block-container">
                <div className="code-block-header">
                  <span className="code-block-language">{language}</span>
                  <CopyCode content={code} />
                </div>
                <SyntaxHighlighter
                  style={vscDarkPlus}
                  language={language}
                  PreTag="div"
                  className="code-block-content"
                  customStyle={{ margin: 0, background: '#1e1e1e', padding: '1rem' }}
                >
                  {code}
                </SyntaxHighlighter>
              </div>
            );
          },
          table({ children, ...props }) {
            return (
              <div className="table-wrapper">
                <table {...props}>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
