import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Search, BookOpen, CheckCircle2, Hammer, Brain } from 'lucide-react';
import Fuse from 'fuse.js';
import { sections, allPages } from '../lib/content';
import { useStore } from '../stores/useStore';
import type { Difficulty, Section } from '../lib/content';

function DifficultyDot({ difficulty }: { difficulty?: Difficulty }) {
  if (!difficulty) return null;
  const colors = { easy: 'bg-emerald-400', medium: 'bg-yellow-400', hard: 'bg-red-400' };
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${colors[difficulty]}`} title={difficulty} />;
}

// Chapter groups for sidebar organization
interface ChapterGroup {
  label: string;
  icon: string;
  sectionNames: string[];
}

const chapterGroups: ChapterGroup[] = [
  {
    label: 'C# Fundamentals',
    icon: '📘',
    sectionNames: [
      'Getting Started', 'Type System', 'Object-Oriented Programming', 'Language Features',
      'Data & LINQ', 'Async & Concurrency', 'Error Handling', 'Advanced C#', 'Performance & Memory',
      'Working with Data', 'Architecture & Patterns', 'Frameworks', 'Testing', "What's New in C#",
    ],
  },
  {
    label: '.NET on Ubuntu',
    icon: '🛠',
    sectionNames: ['.NET on Ubuntu'],
  },
  {
    label: 'Database',
    icon: '🗄',
    sectionNames: ['T-SQL for Data Engineers', 'Oracle SQL for Data Engineers'],
  },
  {
    label: 'Data Access',
    icon: '🔌',
    sectionNames: ['ADO.NET and Data Access'],
  },
  {
    label: 'Web Development',
    icon: '🌐',
    sectionNames: ['ASP.NET Core MVC & Razor Pages'],
  },
  {
    label: 'Data Engineering',
    icon: '⚙',
    sectionNames: ['Data Engineering', 'Data Engineering Patterns'],
  },
  {
    label: 'Modern .NET',
    icon: '🚀',
    sectionNames: ['.NET 10 & Modern C#'],
  },
  {
    label: 'Azure',
    icon: '☁',
    sectionNames: ['Azure for Data Engineers'],
  },
  {
    label: 'DSA Interview Prep',
    icon: '🧠',
    sectionNames: [
      'DSA: Arrays & Hashing', 'DSA: Stack & Queue', 'DSA: Binary Search',
      'DSA: Linked Lists', 'DSA: Trees', 'DSA: Tries', 'DSA: Heaps',
      'DSA: Graphs', 'DSA: Dynamic Programming', 'DSA: Greedy', 'DSA: Backtracking',
      'DSA: Bit Manipulation', 'DSA: Math & Geometry', 'DSA: Advanced Structures',
    ],
  },
  {
    label: 'Projects',
    icon: '🔨',
    sectionNames: ['Projects'],
  },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { sidebarOpen, completedPages } = useStore();
  const [search, setSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    // Start with non-DSA sections expanded, DSA collapsed
    return new Set(sections.filter((s) => !s.title.startsWith('DSA:')).map((s) => s.slug));
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    return new Set(chapterGroups.map((g) => g.label));
  });

  const fuse = useMemo(
    () => new Fuse(allPages, { keys: ['title', 'content'], threshold: 0.4, ignoreLocation: true }),
    []
  );

  const filteredSections = useMemo(() => {
    if (!search.trim()) return sections;
    const results = fuse.search(search);
    const matchingSlugs = new Set(results.map((r) => r.item.slug));
    return sections
      .map((section) => ({
        ...section,
        pages: section.pages.filter((p) => matchingSlugs.has(p.slug)),
      }))
      .filter((section) => section.pages.length > 0);
  }, [search, fuse]);

  const filteredSectionMap = useMemo(() => {
    const map = new Map<string, Section>();
    for (const s of filteredSections) {
      map.set(s.title, s);
    }
    return map;
  }, [filteredSections]);

  const toggleSection = (sectionSlug: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionSlug)) next.delete(sectionSlug);
      else next.add(sectionSlug);
      return next;
    });
  };

  const toggleGroup = (groupLabel: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupLabel)) next.delete(groupLabel);
      else next.add(groupLabel);
      return next;
    });
  };

  const getSectionProgress = (sectionPages: typeof allPages) => {
    const completed = sectionPages.filter((p) => completedPages.includes(p.slug)).length;
    return { completed, total: sectionPages.length, percentage: Math.round((completed / sectionPages.length) * 100) };
  };

  const getGroupProgress = (group: ChapterGroup) => {
    let total = 0;
    let completed = 0;
    for (const name of group.sectionNames) {
      const section = filteredSectionMap.get(name);
      if (section) {
        total += section.pages.length;
        completed += section.pages.filter((p) => completedPages.includes(p.slug)).length;
      }
    }
    return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 };
  };

  function getPageIcon(page: typeof allPages[0], isComplete: boolean) {
    if (isComplete) return <CheckCircle2 size={14} className="shrink-0 text-mint" />;
    if (page.isProject) return <Hammer size={14} className="shrink-0 text-gold" />;
    if (page.isDSA) return <Brain size={14} className="shrink-0 text-purple-400" />;
    return <BookOpen size={14} className="shrink-0 opacity-40" />;
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-30 flex h-screen w-[280px] flex-col border-r border-surface-3 bg-surface-1 transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      {/* Logo */}
      <div
        className="flex h-14 cursor-pointer items-center gap-3 border-b border-surface-3 px-5"
        onClick={() => navigate('/')}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
          C#
        </div>
        <div>
          <h1 className="text-sm font-semibold text-text">C# Study Guide</h1>
          <p className="text-xs text-text-muted">{allPages.length} lessons</p>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
          <Search size={14} className="text-text-dim" />
          <input
            type="text"
            placeholder="Filter lessons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-text placeholder-text-dim outline-none"
          />
        </div>
      </div>

      {/* Chapter Groups */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {chapterGroups.map((group) => {
          const groupSections = group.sectionNames
            .map((name) => filteredSectionMap.get(name))
            .filter((s): s is Section => !!s);

          if (groupSections.length === 0) return null;

          const isGroupExpanded = expandedGroups.has(group.label);
          const groupProgress = getGroupProgress(group);

          return (
            <div key={group.label} className="mb-2">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">{group.icon}</span>
                  <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                    {group.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-dim">
                    {groupProgress.completed}/{groupProgress.total}
                  </span>
                  <ChevronDown
                    size={12}
                    className={`text-text-dim transition-transform duration-200 ${
                      isGroupExpanded ? '' : '-rotate-90'
                    }`}
                  />
                </div>
              </button>

              <AnimatePresence initial={false}>
                {isGroupExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {groupSections.map((section) => {
                      const isExpanded = expandedSections.has(section.slug);
                      const progress = getSectionProgress(section.pages);
                      const isDSASection = section.title.startsWith('DSA:');

                      return (
                        <div key={section.slug} className="ml-2">
                          <button
                            onClick={() => toggleSection(section.slug)}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-surface-2"
                          >
                            <div className="flex items-center gap-1.5">
                              <ChevronRight
                                size={12}
                                className={`text-text-dim transition-transform duration-200 ${
                                  isExpanded ? 'rotate-90' : ''
                                }`}
                              />
                              {isDSASection && <Brain size={11} className="text-purple-400" />}
                              <span className={`text-xs font-semibold ${
                                isDSASection ? 'text-purple-400/80' : 'text-text-muted'
                              }`}>
                                {section.title.replace('DSA: ', '')}
                              </span>
                            </div>
                            <span className="text-xs text-text-dim">
                              {progress.completed}/{progress.total}
                            </span>
                          </button>

                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                {section.pages.map((page) => {
                                  const isActive = slug === page.slug;
                                  const isComplete = completedPages.includes(page.slug);

                                  return (
                                    <button
                                      key={page.slug}
                                      onClick={() => navigate(`/lesson/${page.slug}`)}
                                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 pl-9 text-left text-sm transition-colors ${
                                        isActive
                                          ? 'border-l-2 border-accent bg-accent-muted text-accent'
                                          : 'text-text-muted hover:bg-surface-2 hover:text-text'
                                      }`}
                                    >
                                      {getPageIcon(page, isComplete)}
                                      <span className="flex-1 truncate">{page.title}</span>
                                      <DifficultyDot difficulty={page.difficulty} />
                                    </button>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
