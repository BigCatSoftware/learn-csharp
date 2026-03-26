import { useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Circle,
  ArrowUp,
} from 'lucide-react';
import { getPageBySlug, getAdjacentPages, sections } from '../lib/content';
import { useStore } from '../stores/useStore';
import { MarkdownRenderer } from './MarkdownRenderer';
import { TableOfContents } from './TableOfContents';

export function LessonPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLDivElement>(null);
  const { togglePageComplete, isPageComplete, saveScrollPosition, getScrollPosition } = useStore();

  const page = slug ? getPageBySlug(slug) : undefined;
  const { prev, next } = slug ? getAdjacentPages(slug) : {};
  const completed = slug ? isPageComplete(slug) : false;

  // Find section for breadcrumb
  const section = sections.find((s) => s.pages.some((p) => p.slug === slug));

  // Keyboard navigation
  useHotkeys('[', () => prev && navigate(`/lesson/${prev.slug}`), [prev]);
  useHotkeys(']', () => next && navigate(`/lesson/${next.slug}`), [next]);

  // Scroll restoration
  useEffect(() => {
    if (slug && mainRef.current) {
      const pos = getScrollPosition(slug);
      // Delay to let content render
      requestAnimationFrame(() => {
        mainRef.current?.closest('main')?.scrollTo(0, pos);
      });
    }
  }, [slug]);

  // Save scroll position on leave
  useEffect(() => {
    const mainEl = mainRef.current?.closest('main');
    if (!mainEl || !slug) return;

    const handleScroll = () => {
      saveScrollPosition(slug, mainEl.scrollTop);
    };

    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, [slug, saveScrollPosition]);

  // Scroll to top on page change
  useEffect(() => {
    mainRef.current?.closest('main')?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [slug]);

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-text">Lesson not found</h2>
          <p className="mt-2 text-text-muted">The requested lesson could not be found.</p>
          <Link to="/" className="mt-4 inline-block text-accent hover:underline">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div ref={mainRef} className="flex justify-center">
      {/* Main content */}
      <motion.article
        key={slug}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-3xl px-8 py-8"
      >
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-text-dim mb-6">
          <Link to="/" className="hover:text-text-muted transition-colors">
            Home
          </Link>
          <span>/</span>
          {section && (
            <>
              <span className="text-text-muted">{section.title}</span>
              <span>/</span>
            </>
          )}
          <span className="text-text-muted">{page.title}</span>
        </div>

        {/* Title header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text mb-3">{page.title}</h1>
          <div className="flex items-center gap-4 text-sm text-text-muted flex-wrap">
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {page.readingTime} min read
            </span>
            {page.difficulty && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                page.difficulty === 'easy' ? 'bg-emerald-400/15 text-emerald-400' :
                page.difficulty === 'medium' ? 'bg-yellow-400/15 text-yellow-400' :
                'bg-red-400/15 text-red-400'
              }`}>
                {page.difficulty.charAt(0).toUpperCase() + page.difficulty.slice(1)}
              </span>
            )}
            <button
              onClick={() => slug && togglePageComplete(slug)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1 transition-colors ${
                completed
                  ? 'bg-mint/10 text-mint'
                  : 'bg-surface-3 text-text-muted hover:text-text'
              }`}
            >
              {completed ? <CheckCircle2 size={14} /> : <Circle size={14} />}
              {completed ? 'Completed' : 'Mark complete'}
            </button>
          </div>
        </div>

        {/* Markdown content */}
        <div className="prose-content">
          <MarkdownRenderer content={page.content} />
        </div>

        {/* Navigation */}
        <div className="mt-12 flex items-center justify-between border-t border-surface-3 pt-6">
          {prev ? (
            <Link
              to={`/lesson/${prev.slug}`}
              className="group flex items-center gap-2 rounded-lg border border-surface-3 px-4 py-3 transition-colors hover:border-accent/50 hover:bg-surface-2"
            >
              <ChevronLeft size={16} className="text-text-dim group-hover:text-accent" />
              <div className="text-right">
                <div className="text-xs text-text-dim">Previous</div>
                <div className="text-sm text-text-muted group-hover:text-text">{prev.title}</div>
              </div>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link
              to={`/lesson/${next.slug}`}
              className="group flex items-center gap-2 rounded-lg border border-surface-3 px-4 py-3 transition-colors hover:border-accent/50 hover:bg-surface-2"
            >
              <div>
                <div className="text-xs text-text-dim">Next</div>
                <div className="text-sm text-text-muted group-hover:text-text">{next.title}</div>
              </div>
              <ChevronRight size={16} className="text-text-dim group-hover:text-accent" />
            </Link>
          ) : (
            <div />
          )}
        </div>

        {/* Keyboard hint */}
        <div className="mt-4 flex justify-center gap-4 text-xs text-text-dim pb-8">
          <span>
            <kbd className="rounded border border-surface-4 bg-surface-3 px-1.5 py-0.5 font-mono">[</kbd> Previous
          </span>
          <span>
            <kbd className="rounded border border-surface-4 bg-surface-3 px-1.5 py-0.5 font-mono">]</kbd> Next
          </span>
        </div>
      </motion.article>

      {/* Table of Contents - right side */}
      <aside className="hidden xl:block w-56 shrink-0 py-8 pr-4">
        <TableOfContents headings={page.headings} />
      </aside>
    </div>
  );
}
