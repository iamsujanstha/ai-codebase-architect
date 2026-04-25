import { Fragment, useMemo, useState } from 'react';

interface MarkdownRendererProps {
  content: string;
}

interface CodeBlockData {
  type: 'code';
  language: string;
  content: string;
}

interface ParagraphBlockData {
  type: 'paragraph';
  content: string;
}

interface HeadingBlockData {
  type: 'heading';
  level: 1 | 2 | 3;
  content: string;
}

interface ListBlockData {
  type: 'unordered-list' | 'ordered-list';
  items: string[];
}

interface QuoteBlockData {
  type: 'quote';
  content: string;
}

type MarkdownBlock =
  | CodeBlockData
  | ParagraphBlockData
  | HeadingBlockData
  | ListBlockData
  | QuoteBlockData;

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  function isSpecialLine(line: string): boolean {
    return (
      /^```/.test(line) ||
      /^#{1,3}\s+/.test(line) ||
      /^\s*[-*]\s+/.test(line) ||
      /^\s*\d+\.\s+/.test(line) ||
      /^>\s?/.test(line)
    );
  }

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length && lines[index].startsWith('```')) {
        index += 1;
      }

      blocks.push({
        type: 'code',
        language,
        content: codeLines.join('\n'),
      });

      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);

    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        content: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, '').trim());
        index += 1;
      }

      blocks.push({
        type: 'unordered-list',
        items,
      });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, '').trim());
        index += 1;
      }

      blocks.push({
        type: 'ordered-list',
        items,
      });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];

      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, '').trim());
        index += 1;
      }

      blocks.push({
        type: 'quote',
        content: quoteLines.join(' '),
      });
      continue;
    }

    const paragraphLines: string[] = [];

    while (
      index < lines.length &&
      lines[index].trim() &&
      !isSpecialLine(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    blocks.push({
      type: 'paragraph',
      content: paragraphLines.join(' '),
    });
  }

  return blocks;
}

function renderInline(text: string) {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);

  return tokens
    .filter(Boolean)
    .map((token, index) => {
      if (token.startsWith('`') && token.endsWith('`')) {
        return (
          <code className="inline-code" key={`inline-${index}`}>
            {token.slice(1, -1)}
          </code>
        );
      }

      if (token.startsWith('**') && token.endsWith('**')) {
        return <strong key={`inline-${index}`}>{token.slice(2, -2)}</strong>;
      }

      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

      if (linkMatch) {
        return (
          <a
            className="markdown-link"
            href={linkMatch[2]}
            key={`inline-${index}`}
            rel="noreferrer"
            target="_blank"
          >
            {linkMatch[1]}
          </a>
        );
      }

      return <Fragment key={`inline-${index}`}>{token}</Fragment>;
    });
}

function CodeBlock({
  language,
  content,
}: {
  language: string;
  content: string;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const lines = content.split('\n');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="code-block">
      <div className="code-toolbar">
        <div className="code-toolbar-left">
          <div className="code-window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="code-language">{language || 'code'}</span>
        </div>

        <button
          className="code-copy-button"
          type="button"
          onClick={() => {
            void handleCopy();
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="code-body">
        {lines.map((line, index) => (
          <div className="code-line" key={`${language}-${index}`}>
            <span className="code-line-number">{index + 1}</span>
            <code className="code-line-text">{line || ' '}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarkdownRenderer({
  content,
}: MarkdownRendererProps): JSX.Element {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  return (
    <div className="markdown-root">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          if (block.level === 1) {
            return (
              <h1 className="markdown-heading h1" key={`block-${index}`}>
                {renderInline(block.content)}
              </h1>
            );
          }

          if (block.level === 2) {
            return (
              <h2 className="markdown-heading h2" key={`block-${index}`}>
                {renderInline(block.content)}
              </h2>
            );
          }

          return (
            <h3 className="markdown-heading h3" key={`block-${index}`}>
              {renderInline(block.content)}
            </h3>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p className="markdown-paragraph" key={`block-${index}`}>
              {renderInline(block.content)}
            </p>
          );
        }

        if (block.type === 'unordered-list') {
          return (
            <ul className="markdown-list" key={`block-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ordered-list') {
          return (
            <ol className="markdown-list ordered" key={`block-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`}>{renderInline(item)}</li>
              ))}
            </ol>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote className="markdown-quote" key={`block-${index}`}>
              {renderInline(block.content)}
            </blockquote>
          );
        }

        if (block.type === 'code') {
          return (
            <CodeBlock
              key={`block-${index}`}
              language={block.language}
              content={block.content}
            />
          );
        }

        return null;
      })}
    </div>
  );
}

