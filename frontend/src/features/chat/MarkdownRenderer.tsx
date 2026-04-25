import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
  content: string;
}

function MarkdownCodeBlock({
  inline,
  className,
  children,
  ...props
}: any) {
  const [isCopied, setIsCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : 'text';
  const code = String(children).replace(/\n$/, '');

  if (inline) {
    return (
      <code {...props} className="inline-code">
        {children}
      </code>
    );
  }

  return (
    <div className="editor-frame">
      <div className="editor-toolbar">
        <div className="editor-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <span className="editor-language">{language}</span>

        <button
          className="editor-copy-button"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(code);
            setIsCopied(true);
            window.setTimeout(() => setIsCopied(false), 1600);
          }}
        >
          {isCopied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <SyntaxHighlighter
        {...props}
        style={vscDarkPlus}
        language={language}
        PreTag="div"
        showLineNumbers
        wrapLongLines
        className="editor-code"
        customStyle={{
          margin: 0,
          background: 'transparent',
          padding: '1rem 1.25rem 1.1rem',
          borderRadius: 0,
        }}
        lineNumberStyle={{
          color: 'rgba(148, 163, 184, 0.7)',
          minWidth: '2.4rem',
          paddingRight: '1rem',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="markdown-root">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: MarkdownCodeBlock,
          table({ children, ...props }) {
            return (
              <div className="table-wrapper">
                <table {...props}>{children}</table>
              </div>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
