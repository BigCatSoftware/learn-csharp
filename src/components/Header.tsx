import { useNavigate } from 'react-router-dom';
import { Search, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useStore } from '../stores/useStore';
import { allPages, sections } from '../lib/content';

export function Header() {
  const { sidebarOpen, setSidebarOpen, setCommandPaletteOpen, completedPages } = useStore();

  const totalPages = allPages.length;
  const completedCount = completedPages.length;
  const percentage = totalPages > 0 ? Math.round((completedCount / totalPages) * 100) : 0;

  return (
    <header className="flex h-14 items-center justify-between border-b border-surface-3 bg-surface-1 px-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-3 hover:text-text"
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        </button>
      </div>

      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-surface-3 bg-surface-2 px-3 py-1.5 text-sm text-text-muted transition-colors hover:border-accent hover:text-text"
      >
        <Search size={14} />
        <span>Search lessons...</span>
        <kbd className="ml-2 rounded border border-surface-4 bg-surface-3 px-1.5 py-0.5 text-xs font-mono">
          Ctrl+K
        </kbd>
      </button>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span>{completedCount}/{totalPages} complete</span>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="font-mono text-accent">{percentage}%</span>
        </div>
      </div>
    </header>
  );
}
