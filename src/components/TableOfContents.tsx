import { useState, useEffect } from 'react';
import { List } from 'lucide-react';

interface Heading {
  level: number;
  text: string;
  id: string;
}

export function TableOfContents({ headings }: { headings: Heading[] }) {
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: '-80px 0px -80% 0px', threshold: 0 }
    );

    headings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <div className="sticky top-8">
      <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider text-text-dim">
        <List size={14} />
        On this page
      </div>
      <nav className="space-y-0.5">
        {headings.map(({ level, text, id }) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`block rounded py-1 text-xs transition-colors ${
              level === 3 ? 'pl-4' : level === 4 ? 'pl-8' : 'pl-0'
            } ${
              activeId === id
                ? 'text-accent font-medium'
                : 'text-text-dim hover:text-text-muted'
            }`}
          >
            {text}
          </a>
        ))}
      </nav>
    </div>
  );
}
