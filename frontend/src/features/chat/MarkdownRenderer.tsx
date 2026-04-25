import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : 'text';

            if (!inline) {
              return (
                <div className="code-block-container">
                  <div className="code-block-header">
                    <span className="code-block-language">{language}</span>
                    <button
                      className="code-block-copy"
                      onClick={() => navigator.clipboard.writeText(String(children).replace(/\n$/, ''))}
                    >
                      Copy
                    </button>
                  </div>
                  <SyntaxHighlighter
                    {...props}
                    style={vscDarkPlus}
                    language={language}
                    PreTag="div"
                    className="code-block-content"
                    customStyle={{
                      margin: 0,
                      background: '#1e1e1e', // VSCode dark background
                      padding: '1rem',
                      borderRadius: '0 0 8px 8px',
                    }}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                </div>
              );
            }

            return (
              <code {...props} className="inline-code">
                {children}
              </code>
            );
          },
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
