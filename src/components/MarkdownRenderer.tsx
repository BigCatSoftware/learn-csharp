import { useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { Check, Copy, Link as LinkIcon } from 'lucide-react';
import type { Components } from 'react-markdown';

import 'highlight.js/styles/github-dark-dimmed.css';

function flattenChildren(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenChildren).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return flattenChildren((node as any).props.children);
  }
  return '';
}

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const language = className?.replace('hljs language-', '').replace('language-', '') || '';
  const plainText = flattenChildren(children).replace(/\n$/, '');

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [plainText]);

  return (
    <div className="group relative my-4 overflow-hidden rounded-lg border border-surface-3 bg-[#0d0d1a]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-surface-3 bg-surface-2 px-4 py-1.5">
        <span className="font-mono text-xs text-text-dim uppercase">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-dim transition-colors hover:bg-surface-3 hover:text-text"
        >
          {copied ? <Check size={12} className="text-mint" /> : <Copy size={12} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {/* Code content - rendered directly to preserve rehype-highlight spans */}
      <div className="overflow-x-auto">
        <pre className="p-4 font-mono text-sm leading-6">
          <code className={className}>{children}</code>
        </pre>
      </div>
    </div>
  );
}

function Callout({ type, children }: { type: string; children: React.ReactNode }) {
  const styles: Record<string, { border: string; bg: string; icon: string }> = {
    note: { border: 'border-blue-500', bg: 'bg-[#1a1a3a]', icon: 'Note' },
    tip: { border: 'border-emerald-500', bg: 'bg-[#1a2a2a]', icon: 'Tip' },
    warning: { border: 'border-yellow-500', bg: 'bg-[#2a2a1a]', icon: 'Warning' },
    important: { border: 'border-purple-500', bg: 'bg-[#2a1a2a]', icon: 'Important' },
    caution: { border: 'border-red-500', bg: 'bg-[#2a1a1a]', icon: 'Caution' },
  };

  const style = styles[type] || styles.note;

  return (
    <div className={`my-4 rounded-lg border-l-4 ${style.border} ${style.bg} p-4`}>
      <div className="font-semibold text-sm mb-1 text-text">{style.icon}</div>
      <div className="text-sm text-text/90 [&>p]:m-0">{children}</div>
    </div>
  );
}

const components: Components = {
  pre({ children, node, ...props }) {
    // Check if the pre contains a code element (fenced code block)
    // For untagged code blocks (``` with no language), the code child has no className
    // We detect this case and render it as a CodeBlock
    if (
      children &&
      typeof children === 'object' &&
      'type' in (children as any) &&
      (children as any).type === 'code'
    ) {
      const codeChild = children as React.ReactElement;
      const codeClassName = codeChild.props?.className;
      const hasLanguage = codeClassName?.includes('language-') || codeClassName?.includes('hljs');
      if (!hasLanguage) {
        // Untagged code block (``` or ```text) — render as diagram/text block
        return <CodeBlock className="">{codeChild.props?.children}</CodeBlock>;
      }
    }
    return <>{children}</>;
  },
  code({ className, children, ...props }) {
    const isBlock = className?.includes('language-') || className?.includes('hljs');
    if (isBlock) {
      return <CodeBlock className={className}>{children}</CodeBlock>;
    }
    return (
      <code className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-sm text-mint" {...props}>
        {children}
      </code>
    );
  },
  blockquote({ children }) {
    const text = extractText(children);
    const calloutMatch = text.match(/^\*\*(Note|Tip|Warning|Important|Caution):\*\*/);
    if (calloutMatch) {
      return <Callout type={calloutMatch[1].toLowerCase()}>{children}</Callout>;
    }
    return (
      <blockquote className="my-4 border-l-4 border-accent pl-4 text-text-muted italic">
        {children}
      </blockquote>
    );
  },
  table({ children }) {
    return (
      <div className="my-4 overflow-x-auto rounded-lg border border-surface-3">
        <table className="w-full text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="border-b border-surface-3 bg-surface-2">{children}</thead>;
  },
  th({ children }) {
    return <th className="px-4 py-2.5 text-left font-semibold text-text">{children}</th>;
  },
  td({ children }) {
    return <td className="px-4 py-2.5 text-text-muted border-b border-surface-3/50">{children}</td>;
  },
  tr({ children }) {
    return <tr className="transition-colors hover:bg-surface-2/50">{children}</tr>;
  },
  h1({ children }) {
    return null;
  },
  h2({ children, id, ...props }) {
    const headingId = makeId(children);
    return (
      <h2 id={headingId} className="group mt-10 mb-4 scroll-mt-20 text-2xl font-bold text-text">
        <a href={`#${headingId}`} className="flex items-center gap-2">
          {children}
          <LinkIcon size={16} className="opacity-0 group-hover:opacity-50 transition-opacity text-text-dim" />
        </a>
      </h2>
    );
  },
  h3({ children, ...props }) {
    const headingId = makeId(children);
    return (
      <h3 id={headingId} className="group mt-8 mb-3 scroll-mt-20 text-xl font-semibold text-text">
        <a href={`#${headingId}`} className="flex items-center gap-2">
          {children}
          <LinkIcon size={14} className="opacity-0 group-hover:opacity-50 transition-opacity text-text-dim" />
        </a>
      </h3>
    );
  },
  a({ href, children }) {
    return (
      <a href={href} className="text-accent underline decoration-accent/30 hover:decoration-accent transition-colors">
        {children}
      </a>
    );
  },
  ul({ children }) {
    return <ul className="my-3 space-y-1 pl-6 list-disc marker:text-text-dim">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-3 space-y-1 pl-6 list-decimal marker:text-text-dim">{children}</ol>;
  },
  li({ children }) {
    return <li className="text-text/90 leading-relaxed">{children}</li>;
  },
  p({ children }) {
    return <p className="my-3 leading-relaxed text-text/90">{children}</p>;
  },
  strong({ children }) {
    return <strong className="font-semibold text-text">{children}</strong>;
  },
  hr() {
    return <hr className="my-8 border-surface-3" />;
  },
};

function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as any).props.children);
  }
  return '';
}

function makeId(children: React.ReactNode): string {
  return extractText(children)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeHighlight]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}
