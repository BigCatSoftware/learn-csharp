import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen, CheckCircle2, ArrowRight, Sparkles, Hammer, Brain, Clock, Tag } from 'lucide-react';
import { sections, allPages, projectPages, dsaPages, dsaSectionsList } from '../lib/content';
import { useStore } from '../stores/useStore';
import type { Section, ProjectCategory } from '../lib/content';

interface ChapterGroup {
  label: string;
  icon: string;
  description: string;
  sectionNames: string[];
  color: string;
  borderColor: string;
  hoverBorder: string;
  progressColor: string;
}

const chapterGroups: ChapterGroup[] = [
  {
    label: 'C# Fundamentals',
    icon: '📘',
    description: 'Core language features, OOP, async, LINQ, and more',
    sectionNames: [
      'Getting Started', 'Type System', 'Object-Oriented Programming', 'Language Features',
      'Data & LINQ', 'Async & Concurrency', 'Error Handling', 'Advanced C#', 'Performance & Memory',
      'Working with Data', 'Architecture & Patterns', 'Frameworks', 'Testing', "What's New in C#",
    ],
    color: 'text-accent',
    borderColor: 'border-accent/20',
    hoverBorder: 'hover:border-accent/50',
    progressColor: 'bg-accent',
  },
  {
    label: '.NET on Ubuntu',
    icon: '🛠',
    description: 'Dev environment, CLI, project structure, tooling',
    sectionNames: ['.NET on Ubuntu'],
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/20',
    hoverBorder: 'hover:border-emerald-500/50',
    progressColor: 'bg-emerald-500',
  },
  {
    label: 'Database',
    icon: '🗄',
    description: 'T-SQL and Oracle SQL deep dives for Data Engineers',
    sectionNames: ['T-SQL for Data Engineers', 'Oracle SQL for Data Engineers'],
    color: 'text-blue-400',
    borderColor: 'border-blue-500/20',
    hoverBorder: 'hover:border-blue-500/50',
    progressColor: 'bg-blue-500',
  },
  {
    label: 'Data Access',
    icon: '🔌',
    description: 'ADO.NET, Dapper, connection management, SqlBulkCopy',
    sectionNames: ['ADO.NET and Data Access'],
    color: 'text-orange-400',
    borderColor: 'border-orange-500/20',
    hoverBorder: 'hover:border-orange-500/50',
    progressColor: 'bg-orange-500',
  },
  {
    label: 'Web Development',
    icon: '🌐',
    description: 'ASP.NET Core MVC, Razor Pages, REST APIs, DI',
    sectionNames: ['ASP.NET Core MVC & Razor Pages'],
    color: 'text-cyan-400',
    borderColor: 'border-cyan-500/20',
    hoverBorder: 'hover:border-cyan-500/50',
    progressColor: 'bg-cyan-500',
  },
  {
    label: 'Data Engineering',
    icon: '⚙',
    description: 'ETL patterns, pipelines, chunking, observability',
    sectionNames: ['Data Engineering', 'Data Engineering Patterns'],
    color: 'text-amber-400',
    borderColor: 'border-amber-500/20',
    hoverBorder: 'hover:border-amber-500/50',
    progressColor: 'bg-amber-500',
  },
  {
    label: 'Modern .NET',
    icon: '🚀',
    description: '.NET 10, C# 13/14, performance, Native AOT',
    sectionNames: ['.NET 10 & Modern C#'],
    color: 'text-rose-400',
    borderColor: 'border-rose-500/20',
    hoverBorder: 'hover:border-rose-500/50',
    progressColor: 'bg-rose-500',
  },
  {
    label: 'Azure',
    icon: '☁',
    description: 'Azure SQL, Data Factory, Blob Storage, Service Bus',
    sectionNames: ['Azure for Data Engineers'],
    color: 'text-sky-400',
    borderColor: 'border-sky-500/20',
    hoverBorder: 'hover:border-sky-500/50',
    progressColor: 'bg-sky-500',
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const { completedPages } = useStore();

  const totalPages = allPages.length;
  const completedCount = completedPages.length;
  const percentage = totalPages > 0 ? Math.round((completedCount / totalPages) * 100) : 0;
  const lessonCount = allPages.filter((p) => !p.isProject && !p.isDSA).length;
  const projectCount = projectPages.length;
  const dsaCount = dsaPages.length;
  const dsaCompleted = dsaPages.filter((p) => completedPages.includes(p.slug)).length;
  const dsaPct = dsaCount > 0 ? Math.round((dsaCompleted / dsaCount) * 100) : 0;

  const sectionMap = new Map<string, Section>();
  for (const s of sections) {
    sectionMap.set(s.title, s);
  }

  const projectSection = sections.find((s) => s.title === 'Projects');

  function getGroupStats(group: ChapterGroup) {
    let total = 0;
    let completed = 0;
    let firstPage: string | null = null;
    const groupSections: Section[] = [];
    for (const name of group.sectionNames) {
      const section = sectionMap.get(name);
      if (section) {
        groupSections.push(section);
        total += section.pages.length;
        completed += section.pages.filter((p) => completedPages.includes(p.slug)).length;
        if (!firstPage && section.pages.length > 0) firstPage = section.pages[0].slug;
      }
    }
    return { total, completed, percentage: total > 0 ? Math.round((completed / total) * 100) : 0, firstPage, sections: groupSections };
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-12"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white">
            C#
          </div>
          <div>
            <h1 className="text-3xl font-bold text-text">C# Study Guide</h1>
            <p className="text-text-muted">
              {lessonCount} lessons, {dsaCount} DSA lessons, {projectCount} projects
            </p>
          </div>
        </div>

        {/* Overall Progress */}
        <div className="mt-6 rounded-xl border border-surface-3 bg-surface-2 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-accent" />
              <span className="text-sm font-medium text-text">Overall Progress</span>
            </div>
            <span className="text-2xl font-bold text-accent font-mono">{percentage}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent to-mint"
              initial={{ width: 0 }}
              animate={{ width: `${percentage}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-text-muted">
            <span>{completedCount} of {totalPages} completed</span>
            <span>{totalPages - completedCount} remaining</span>
          </div>
        </div>
      </motion.div>

      {/* Chapter Groups Grid */}
      <h2 className="text-lg font-semibold text-text mb-4">Chapters</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-12">
        {chapterGroups.map((group, i) => {
          const stats = getGroupStats(group);
          if (stats.total === 0) return null;

          return (
            <motion.div
              key={group.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.03 }}
              onClick={() => stats.firstPage && navigate(`/lesson/${stats.firstPage}`)}
              className={`group cursor-pointer rounded-xl border ${group.borderColor} bg-surface-2 p-5 transition-all ${group.hoverBorder} hover:bg-surface-3`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{group.icon}</span>
                  <h3 className={`font-semibold text-text group-hover:${group.color} transition-colors`}>
                    {group.label}
                  </h3>
                </div>
                <ArrowRight size={16} className="text-text-dim opacity-0 transition-all group-hover:opacity-100" />
              </div>
              <p className="text-xs text-text-dim mb-3">{group.description}</p>
              <div className="mb-2 flex flex-wrap gap-1">
                {stats.sections.slice(0, 3).map((section) => (
                  <span key={section.slug} className="inline-block rounded-md bg-surface-3 px-2 py-0.5 text-xs text-text-muted">
                    {section.title.replace('DSA: ', '')}
                  </span>
                ))}
                {stats.sections.length > 3 && (
                  <span className="inline-block rounded-md bg-surface-3 px-2 py-0.5 text-xs text-text-dim">
                    +{stats.sections.length - 3} more
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span className="flex items-center gap-1">
                  <BookOpen size={12} /> {stats.total} lessons
                </span>
                <span className="flex items-center gap-1">
                  {stats.completed > 0 && <CheckCircle2 size={12} className="text-mint" />}
                  {stats.percentage}%
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-4">
                <div className={`h-full rounded-full ${group.progressColor} transition-all duration-500`} style={{ width: `${stats.percentage}%` }} />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* DSA Interview Prep Banner */}
      {dsaPages.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-12 rounded-xl border border-purple-500/30 bg-gradient-to-r from-purple-500/10 to-accent-muted p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Brain size={24} className="text-purple-400" />
              <div>
                <h2 className="text-lg font-bold text-text">DSA Interview Prep</h2>
                <p className="text-sm text-text-muted">NeetCode 150 roadmap — {dsaCount} lessons covering all major topics</p>
              </div>
            </div>
            <button
              onClick={() => dsaPages[0] && navigate(`/lesson/${dsaPages[0].slug}`)}
              className="rounded-lg bg-purple-500/20 px-4 py-2 text-sm font-medium text-purple-300 transition-colors hover:bg-purple-500/30"
            >
              Start DSA Prep
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-purple-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${dsaPct}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
            </div>
            <span className="text-sm font-mono text-purple-300">{dsaCompleted}/{dsaCount}</span>
          </div>
          <div className="mt-3 flex gap-4 text-xs text-text-dim">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Easy</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-400" /> Medium</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Hard</span>
          </div>
        </motion.div>
      )}

      {/* DSA Sections Grid */}
      {dsaSectionsList.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
            <Brain size={18} className="text-purple-400" />
            Data Structures & Algorithms
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-12">
            {dsaSectionsList.map((section, i) => {
              const completed = section.pages.filter((p) => completedPages.includes(p.slug)).length;
              const sectionPct = Math.round((completed / section.pages.length) * 100);

              return (
                <motion.div
                  key={section.slug}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.03 }}
                  onClick={() => navigate(`/lesson/${section.pages[0].slug}`)}
                  className="group cursor-pointer rounded-xl border border-purple-500/20 bg-surface-2 p-5 transition-all hover:border-purple-500/50 hover:bg-surface-3"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-text group-hover:text-purple-400 transition-colors">
                      {section.title.replace('DSA: ', '')}
                    </h3>
                    <ArrowRight size={16} className="text-text-dim opacity-0 transition-all group-hover:opacity-100 group-hover:text-purple-400" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                    <span>{section.pages.length} lessons</span>
                    <span>{sectionPct}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-4">
                    <div className="h-full rounded-full bg-purple-500 transition-all duration-500" style={{ width: `${sectionPct}%` }} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {/* Projects Section */}
      <ProjectsSection
        projects={projectPages}
        completedPages={completedPages}
        navigate={navigate}
      />

      {/* Keyboard shortcuts */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-8 flex justify-center gap-6 text-xs text-text-dim"
      >
        <span>
          <kbd className="rounded border border-surface-4 bg-surface-3 px-1.5 py-0.5 font-mono">Ctrl+K</kbd> Search
        </span>
        <span>
          <kbd className="rounded border border-surface-4 bg-surface-3 px-1.5 py-0.5 font-mono">[</kbd>{' '}
          <kbd className="rounded border border-surface-4 bg-surface-3 px-1.5 py-0.5 font-mono">]</kbd> Navigate
        </span>
      </motion.div>
    </div>
  );
}

// Category badge colors
const categoryColors: Record<string, { bg: string; text: string }> = {
  'CS Fundamentals': { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  'Systems': { bg: 'bg-purple-500/15', text: 'text-purple-400' },
  'Web': { bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
  'Data Engineering': { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  'General SWE': { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  'Programming Languages': { bg: 'bg-rose-500/15', text: 'text-rose-400' },
  'Web Development / Data Engineering': { bg: 'bg-orange-500/15', text: 'text-orange-400' },
  'Data Engineering / Distributed Systems': { bg: 'bg-red-500/15', text: 'text-red-400' },
  'Systems Programming': { bg: 'bg-purple-500/15', text: 'text-purple-400' },
};

const difficultyColors: Record<string, { bg: string; text: string }> = {
  'Medium': { bg: 'bg-yellow-400/15', text: 'text-yellow-400' },
  'Medium-Hard': { bg: 'bg-orange-400/15', text: 'text-orange-400' },
  'Hard': { bg: 'bg-red-400/15', text: 'text-red-400' },
  'Very Hard': { bg: 'bg-red-500/15', text: 'text-red-500' },
};

type CategoryFilter = 'All' | ProjectCategory;

function ProjectsSection({
  projects,
  completedPages,
  navigate,
}: {
  projects: typeof projectPages;
  completedPages: string[];
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');

  if (projects.length === 0) return null;

  const categories: CategoryFilter[] = ['All', 'CS Fundamentals', 'Systems', 'Web', 'Data Engineering', 'General SWE'];
  const filteredProjects = categoryFilter === 'All'
    ? projects
    : projects.filter((p) => p.projectMeta?.category === categoryFilter);

  const completedCount = projects.filter((p) => completedPages.includes(p.slug)).length;

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text flex items-center gap-2">
            <Hammer size={18} className="text-gold" />
            Projects — {projects.length} total
          </h2>
          <span className="text-sm text-text-muted">
            {completedCount}/{projects.length} complete
          </span>
        </div>
        <p className="text-sm text-text-dim mb-4">
          Portfolio-worthy projects spanning CS fundamentals, systems programming, web development, and data engineering.
          Recommended order: P1 through P11, building on skills progressively.
        </p>

        {/* Category filter */}
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((cat) => {
            const count = cat === 'All' ? projects.length : projects.filter((p) => p.projectMeta?.category === cat).length;
            if (count === 0 && cat !== 'All') return null;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  categoryFilter === cat
                    ? 'bg-gold/20 text-gold'
                    : 'bg-surface-3 text-text-muted hover:text-text'
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 mb-12">
        {filteredProjects.map((project, i) => {
          const isComplete = completedPages.includes(project.slug);
          const meta = project.projectMeta;
          const catStyle = categoryColors[meta?.category || ''] || categoryColors['General SWE'];
          const diffStyle = difficultyColors[meta?.difficultyLabel || 'Medium'] || difficultyColors['Medium'];

          return (
            <motion.div
              key={project.slug}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              onClick={() => navigate(`/lesson/${project.slug}`)}
              className="group cursor-pointer rounded-xl border border-gold/20 bg-surface-2 p-5 transition-all hover:border-gold/50 hover:bg-surface-3"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Hammer size={16} className="text-gold shrink-0" />
                  <h3 className="font-semibold text-text group-hover:text-gold transition-colors text-sm">
                    {project.title}
                  </h3>
                </div>
                {isComplete && <CheckCircle2 size={16} className="text-mint shrink-0" />}
              </div>

              {/* Description */}
              {meta && (
                <p className="text-xs text-text-dim mb-3 leading-relaxed">{meta.oneliner}</p>
              )}

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                {meta && (
                  <>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${catStyle.bg} ${catStyle.text}`}>
                      {meta.category}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${diffStyle.bg} ${diffStyle.text}`}>
                      {meta.difficultyLabel}
                    </span>
                    <span className="flex items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5 text-xs text-text-dim">
                      <Clock size={10} /> {meta.estimatedTime}
                    </span>
                  </>
                )}
              </div>

              {/* Skills */}
              {meta && (
                <div className="flex flex-wrap gap-1">
                  {meta.skills.map((skill) => (
                    <span key={skill} className="rounded-md bg-surface-4 px-1.5 py-0.5 text-xs text-text-dim">
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </>
  );
}
