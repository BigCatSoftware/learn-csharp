import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { motion } from 'framer-motion';
import { BookOpen, Search, Home, Clock } from 'lucide-react';
import { sections, allPages } from '../lib/content';
import { useStore } from '../stores/useStore';

export function CommandPalette() {
  const navigate = useNavigate();
  const { setCommandPaletteOpen } = useStore();

  const handleSelect = (value: string) => {
    setCommandPaletteOpen(false);
    if (value === 'home') {
      navigate('/');
    } else {
      navigate(`/lesson/${value}`);
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={() => setCommandPaletteOpen(false)}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        transition={{ duration: 0.15 }}
        className="fixed left-1/2 top-[20%] z-50 w-[560px] -translate-x-1/2"
      >
        <Command
          className="overflow-hidden rounded-xl border border-surface-3 bg-surface-2 shadow-2xl"
          loop
        >
          <div className="flex items-center gap-2 border-b border-surface-3 px-4">
            <Search size={16} className="text-text-dim" />
            <Command.Input
              autoFocus
              placeholder="Search lessons..."
              className="flex-1 bg-transparent py-3 text-sm text-text placeholder-text-dim outline-none"
            />
          </div>

          <Command.List className="max-h-[320px] overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-text-dim">
              No lessons found.
            </Command.Empty>

            <Command.Group heading="Navigation">
              <Command.Item
                value="home"
                onSelect={() => handleSelect('home')}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors data-[selected=true]:bg-accent-muted data-[selected=true]:text-accent"
              >
                <Home size={14} />
                Home
              </Command.Item>
            </Command.Group>

            {sections.map((section) => (
              <Command.Group key={section.slug} heading={section.title}>
                {section.pages.map((page) => (
                  <Command.Item
                    key={page.slug}
                    value={`${page.title} ${section.title}`}
                    onSelect={() => handleSelect(page.slug)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors data-[selected=true]:bg-accent-muted data-[selected=true]:text-accent"
                  >
                    <BookOpen size={14} />
                    <span className="flex-1">{page.title}</span>
                    <span className="flex items-center gap-1 text-xs text-text-dim">
                      <Clock size={10} />
                      {page.readingTime}m
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          <div className="flex items-center justify-between border-t border-surface-3 px-4 py-2 text-xs text-text-dim">
            <span>
              <kbd className="rounded border border-surface-4 bg-surface-3 px-1 font-mono">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="rounded border border-surface-4 bg-surface-3 px-1 font-mono">↵</kbd> Open
            </span>
            <span>
              <kbd className="rounded border border-surface-4 bg-surface-3 px-1 font-mono">Esc</kbd> Close
            </span>
          </div>
        </Command>
      </motion.div>
    </>
  );
}
