export type Difficulty = 'easy' | 'medium' | 'hard';
export type ProjectCategory = 'CS Fundamentals' | 'Systems' | 'Web' | 'Data Engineering' | 'General SWE';

export interface ProjectMeta {
  category: ProjectCategory;
  difficultyLabel: string;
  estimatedTime: string;
  skills: string[];
  oneliner: string;
}

export interface Page {
  title: string;
  slug: string;
  filename: string;
  content: string;
  section: string;
  readingTime: number;
  headings: { level: number; text: string; id: string }[];
  isProject: boolean;
  isDSA: boolean;
  difficulty?: Difficulty;
  projectMeta?: ProjectMeta;
}

export interface Section {
  title: string;
  slug: string;
  pages: Page[];
}

// DSA sub-section mapping and difficulty
const dsaSections: Record<string, { section: string; difficulty: Difficulty }> = {
  '80': { section: 'DSA: Arrays & Hashing', difficulty: 'easy' },
  '81': { section: 'DSA: Arrays & Hashing', difficulty: 'easy' },
  '82': { section: 'DSA: Arrays & Hashing', difficulty: 'medium' },
  '83': { section: 'DSA: Arrays & Hashing', difficulty: 'medium' },
  '84': { section: 'DSA: Arrays & Hashing', difficulty: 'medium' },
  '85': { section: 'DSA: Stack & Queue', difficulty: 'easy' },
  '86': { section: 'DSA: Stack & Queue', difficulty: 'easy' },
  '87': { section: 'DSA: Stack & Queue', difficulty: 'hard' },
  '88': { section: 'DSA: Binary Search', difficulty: 'medium' },
  '89': { section: 'DSA: Linked Lists', difficulty: 'easy' },
  '90': { section: 'DSA: Linked Lists', difficulty: 'medium' },
  '91': { section: 'DSA: Trees', difficulty: 'easy' },
  '92': { section: 'DSA: Trees', difficulty: 'medium' },
  '93': { section: 'DSA: Trees', difficulty: 'medium' },
  '94': { section: 'DSA: Trees', difficulty: 'hard' },
  '95': { section: 'DSA: Tries', difficulty: 'medium' },
  '96': { section: 'DSA: Heaps', difficulty: 'medium' },
  '97': { section: 'DSA: Graphs', difficulty: 'medium' },
  '98': { section: 'DSA: Graphs', difficulty: 'medium' },
  '99': { section: 'DSA: Graphs', difficulty: 'medium' },
  '100': { section: 'DSA: Graphs', difficulty: 'hard' },
  '101': { section: 'DSA: Graphs', difficulty: 'hard' },
  '102': { section: 'DSA: Graphs', difficulty: 'medium' },
  '103': { section: 'DSA: Dynamic Programming', difficulty: 'medium' },
  '104': { section: 'DSA: Dynamic Programming', difficulty: 'medium' },
  '105': { section: 'DSA: Dynamic Programming', difficulty: 'hard' },
  '106': { section: 'DSA: Dynamic Programming', difficulty: 'hard' },
  '107': { section: 'DSA: Dynamic Programming', difficulty: 'hard' },
  '108': { section: 'DSA: Dynamic Programming', difficulty: 'hard' },
  '109': { section: 'DSA: Greedy', difficulty: 'medium' },
  '110': { section: 'DSA: Backtracking', difficulty: 'medium' },
  '111': { section: 'DSA: Bit Manipulation', difficulty: 'medium' },
  '112': { section: 'DSA: Math & Geometry', difficulty: 'medium' },
  '113': { section: 'DSA: Math & Geometry', difficulty: 'medium' },
  '114': { section: 'DSA: Advanced Structures', difficulty: 'hard' },
  '115': { section: 'DSA: Advanced Structures', difficulty: 'hard' },
  '116': { section: 'DSA: Advanced Structures', difficulty: 'hard' },
};

// Map file prefixes to sections
const sectionMeta: Record<string, string> = {
  '01': 'Getting Started',
  '02': 'Type System', '13': 'Type System', '14': 'Type System', '17': 'Type System',
  '03': 'Object-Oriented Programming', '04': 'Object-Oriented Programming', '05': 'Object-Oriented Programming',
  '08': 'Language Features', '09': 'Language Features', '12': 'Language Features', '22': 'Language Features', '31': 'Language Features',
  '06': 'Data & LINQ', '10': 'Data & LINQ',
  '07': 'Async & Concurrency', '23': 'Async & Concurrency', '32': 'Async & Concurrency', '33': 'Async & Concurrency', '34': 'Async & Concurrency',
  '11': 'Error Handling', '18': 'Error Handling',
  '25': 'Performance & Memory', '35': 'Performance & Memory', '36': 'Performance & Memory', '68': 'Performance & Memory',
  '26': 'Advanced C#', '27': 'Advanced C#', '28': 'Advanced C#', '29': 'Advanced C#', '30': 'Advanced C#',
  '16': 'Working with Data', '21': 'Working with Data',
  '15': 'Architecture & Patterns', '24': 'Architecture & Patterns',
  '19': 'Frameworks', '20': 'Testing',
  '50': "What's New in C#", '51': "What's New in C#", '52': "What's New in C#", '53': "What's New in C#", '54': "What's New in C#", '55': "What's New in C#",
  '60': 'Data Engineering', '61': 'Data Engineering', '62': 'Data Engineering', '63': 'Data Engineering',
  '64': 'Data Engineering', '65': 'Data Engineering', '66': 'Data Engineering', '67': 'Data Engineering', '69': 'Data Engineering',
  '70': '.NET on Ubuntu', '71': '.NET on Ubuntu', '72': '.NET on Ubuntu', '73': '.NET on Ubuntu',
  '74': '.NET on Ubuntu', '75': '.NET on Ubuntu', '76': '.NET on Ubuntu', '77': '.NET on Ubuntu',
  // T-SQL for Data Engineers
  '120': 'T-SQL for Data Engineers', '121': 'T-SQL for Data Engineers', '122': 'T-SQL for Data Engineers',
  '123': 'T-SQL for Data Engineers', '124': 'T-SQL for Data Engineers', '125': 'T-SQL for Data Engineers',
  '126': 'T-SQL for Data Engineers', '127': 'T-SQL for Data Engineers', '128': 'T-SQL for Data Engineers',
  '129': 'T-SQL for Data Engineers', '130': 'T-SQL for Data Engineers', '131': 'T-SQL for Data Engineers',
  '132': 'T-SQL for Data Engineers', '133': 'T-SQL for Data Engineers', '134': 'T-SQL for Data Engineers',
  // Oracle SQL for Data Engineers
  '140': 'Oracle SQL for Data Engineers', '141': 'Oracle SQL for Data Engineers', '142': 'Oracle SQL for Data Engineers',
  '143': 'Oracle SQL for Data Engineers', '144': 'Oracle SQL for Data Engineers', '145': 'Oracle SQL for Data Engineers',
  '146': 'Oracle SQL for Data Engineers', '147': 'Oracle SQL for Data Engineers', '148': 'Oracle SQL for Data Engineers',
  '149': 'Oracle SQL for Data Engineers', '150': 'Oracle SQL for Data Engineers', '151': 'Oracle SQL for Data Engineers',
  // ADO.NET and Data Access
  '160': 'ADO.NET and Data Access', '161': 'ADO.NET and Data Access', '162': 'ADO.NET and Data Access',
  '163': 'ADO.NET and Data Access', '164': 'ADO.NET and Data Access', '165': 'ADO.NET and Data Access',
  '166': 'ADO.NET and Data Access', '167': 'ADO.NET and Data Access', '168': 'ADO.NET and Data Access',
  '169': 'ADO.NET and Data Access',
  // ASP.NET Core MVC and Razor Pages
  '180': 'ASP.NET Core MVC & Razor Pages', '181': 'ASP.NET Core MVC & Razor Pages', '182': 'ASP.NET Core MVC & Razor Pages',
  '183': 'ASP.NET Core MVC & Razor Pages', '184': 'ASP.NET Core MVC & Razor Pages', '185': 'ASP.NET Core MVC & Razor Pages',
  '186': 'ASP.NET Core MVC & Razor Pages', '187': 'ASP.NET Core MVC & Razor Pages', '188': 'ASP.NET Core MVC & Razor Pages',
  '189': 'ASP.NET Core MVC & Razor Pages', '190': 'ASP.NET Core MVC & Razor Pages', '191': 'ASP.NET Core MVC & Razor Pages',
  '192': 'ASP.NET Core MVC & Razor Pages', '193': 'ASP.NET Core MVC & Razor Pages', '194': 'ASP.NET Core MVC & Razor Pages',
  // Data Engineering Patterns in C#
  '200': 'Data Engineering Patterns', '201': 'Data Engineering Patterns', '202': 'Data Engineering Patterns',
  '203': 'Data Engineering Patterns', '204': 'Data Engineering Patterns', '205': 'Data Engineering Patterns',
  '206': 'Data Engineering Patterns', '207': 'Data Engineering Patterns', '208': 'Data Engineering Patterns',
  '209': 'Data Engineering Patterns', '210': 'Data Engineering Patterns',
  // .NET 10 and Modern C#
  '220': '.NET 10 & Modern C#', '221': '.NET 10 & Modern C#', '222': '.NET 10 & Modern C#',
  '223': '.NET 10 & Modern C#', '224': '.NET 10 & Modern C#', '225': '.NET 10 & Modern C#',
  // Azure for Data Engineers
  '230': 'Azure for Data Engineers', '231': 'Azure for Data Engineers', '232': 'Azure for Data Engineers',
  '233': 'Azure for Data Engineers', '234': 'Azure for Data Engineers', '235': 'Azure for Data Engineers',
  'P1': 'Projects', 'P2': 'Projects', 'P3': 'Projects', 'P4': 'Projects', 'P5': 'Projects',
  'P6': 'Projects', 'P7': 'Projects', 'P8': 'Projects', 'P9': 'Projects', 'P10': 'Projects', 'P11': 'Projects',
};

const projectMetaMap: Record<string, ProjectMeta> = {
  'P1': {
    category: 'CS Fundamentals',
    difficultyLabel: 'Medium',
    estimatedTime: '3-5 days',
    skills: ['Generics', 'Interfaces', 'xUnit', 'BenchmarkDotNet'],
    oneliner: 'Build a fully tested generic collections library from scratch',
  },
  'P2': {
    category: 'Systems',
    difficultyLabel: 'Medium',
    estimatedTime: '4-6 days',
    skills: ['Async/Await', 'Channels', 'HttpClient', 'CLI Tools'],
    oneliner: 'Build a concurrent web crawler with politeness and resume support',
  },
  'P3': {
    category: 'CS Fundamentals',
    difficultyLabel: 'Hard',
    estimatedTime: '1-2 weeks',
    skills: ['Lexer', 'Parser', 'AST', 'Visitor Pattern', 'Recursion'],
    oneliner: 'Build a tree-walking interpreter for a simple scripting language',
  },
  'P4': {
    category: 'Web',
    difficultyLabel: 'Medium',
    estimatedTime: '4-6 days',
    skills: ['ASP.NET Core', 'EF Core', 'JWT', 'Swagger', 'Docker'],
    oneliner: 'Build a production-quality REST API with auth and full CRUD',
  },
  'P5': {
    category: 'Web',
    difficultyLabel: 'Medium-Hard',
    estimatedTime: '5-7 days',
    skills: ['SignalR', 'Razor Pages', 'Identity', 'Real-Time'],
    oneliner: 'Build a real-time chat app with rooms, DMs, and presence',
  },
  'P6': {
    category: 'Data Engineering',
    difficultyLabel: 'Medium-Hard',
    estimatedTime: '5-7 days',
    skills: ['SqlBulkCopy', 'Streaming I/O', 'CLI', 'Benchmarking'],
    oneliner: 'Build a high-performance file ingestion engine for SQL Server',
  },
  'P7': {
    category: 'Data Engineering',
    difficultyLabel: 'Hard',
    estimatedTime: '1-2 weeks',
    skills: ['Channels', 'Backpressure', 'Pipeline Design', 'Oracle/SQL Server'],
    oneliner: 'Build a composable async data pipeline framework',
  },
  'P8': {
    category: 'General SWE',
    difficultyLabel: 'Medium',
    estimatedTime: '3-5 days',
    skills: ['SQLite', 'Spectre.Console', 'Dapper', 'CLI Tools'],
    oneliner: 'Build a personal finance CLI tool with reports and charts',
  },
  'P9': {
    category: 'Systems',
    difficultyLabel: 'Very Hard',
    estimatedTime: '2-3 weeks',
    skills: ['B-Trees', 'File I/O', 'SQL Parsing', 'Buffer Pool'],
    oneliner: 'Build a mini relational database engine with SQL support',
  },
  'P10': {
    category: 'Web',
    difficultyLabel: 'Medium-Hard',
    estimatedTime: '1-2 weeks',
    skills: ['MVC', 'Razor Views', 'EF Core', 'SignalR', 'Chart.js'],
    oneliner: 'Build an ETL pipeline monitoring dashboard',
  },
  'P11': {
    category: 'Data Engineering',
    difficultyLabel: 'Very Hard',
    estimatedTime: '3-4 weeks',
    skills: ['DAG Execution', 'Scheduling', 'SignalR', 'MVC', 'CLI'],
    oneliner: 'Build a distributed ETL orchestrator like mini-Airflow',
  },
};

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1] : 'Untitled';
}

function extractHeadings(content: string): { level: number; text: string; id: string }[] {
  const headings: { level: number; text: string; id: string }[] = [];
  const regex = /^(#{2,4})\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const text = match[2].replace(/`/g, '').replace(/\*\*/g, '');
    const id = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim();
    headings.push({ level: match[1].length, text, id });
  }
  return headings;
}

function estimateReadingTime(content: string): number {
  const words = content.replace(/```[\s\S]*?```/g, '').split(/\s+/).length;
  const codeBlocks = (content.match(/```[\s\S]*?```/g) || []).length;
  return Math.max(1, Math.ceil((words + codeBlocks * 30) / 200));
}

function slugify(filename: string): string {
  return filename.replace(/^\d+-/, '').replace(/^P\d+-/, '').replace(/\.md$/, '');
}

function getPrefix(filename: string): string {
  const projMatch = filename.match(/^(P\d+)-/);
  if (projMatch) return projMatch[1];
  const numMatch = filename.match(/^(\d+)-/);
  if (numMatch) return numMatch[1];
  return '';
}

const mdModulesRaw = import.meta.glob('/src/content/*.md', { query: '?raw', eager: true });

const mdModules: Record<string, string> = {};
for (const [path, mod] of Object.entries(mdModulesRaw)) {
  if (typeof mod === 'string') {
    mdModules[path] = mod;
  } else if (mod && typeof mod === 'object' && 'default' in mod) {
    mdModules[path] = String((mod as any).default);
  } else {
    mdModules[path] = String(mod);
  }
}

function loadAllContent(): { sections: Section[]; allPages: Page[] } {
  const pages: Page[] = [];

  for (const [path, content] of Object.entries(mdModules)) {
    const filename = path.split('/').pop()!;
    const prefix = getPrefix(filename);
    const dsaInfo = dsaSections[prefix];
    const sectionName = dsaInfo?.section || sectionMeta[prefix] || 'Other';
    const isProject = filename.startsWith('P');
    const isDSA = !!dsaInfo;

    const page: Page = {
      title: extractTitle(content),
      slug: slugify(filename),
      filename,
      content,
      section: sectionName,
      readingTime: estimateReadingTime(content),
      headings: extractHeadings(content),
      isProject,
      isDSA,
      difficulty: dsaInfo?.difficulty,
      projectMeta: isProject ? projectMetaMap[prefix] : undefined,
    };
    pages.push(page);
  }

  pages.sort((a, b) => {
    const aNum = parseInt(a.filename.replace(/^P/, ''));
    const bNum = parseInt(b.filename.replace(/^P/, ''));
    const aIsProject = a.filename.startsWith('P');
    const bIsProject = b.filename.startsWith('P');
    if (aIsProject !== bIsProject) return aIsProject ? 1 : -1;
    return aNum - bNum;
  });

  const sectionOrder = [
    // C# Fundamentals
    'Getting Started', 'Type System', 'Object-Oriented Programming', 'Language Features',
    'Data & LINQ', 'Async & Concurrency', 'Error Handling', 'Advanced C#', 'Performance & Memory',
    'Working with Data', 'Architecture & Patterns', 'Frameworks', 'Testing',
    "What's New in C#",
    // .NET on Ubuntu
    '.NET on Ubuntu',
    // Database
    'T-SQL for Data Engineers', 'Oracle SQL for Data Engineers',
    // Data Access
    'ADO.NET and Data Access',
    // Web Development
    'ASP.NET Core MVC & Razor Pages',
    // Data Engineering
    'Data Engineering', 'Data Engineering Patterns',
    // Modern .NET
    '.NET 10 & Modern C#',
    // Azure
    'Azure for Data Engineers',
    // DSA sections
    'DSA: Arrays & Hashing', 'DSA: Stack & Queue', 'DSA: Binary Search',
    'DSA: Linked Lists', 'DSA: Trees', 'DSA: Tries', 'DSA: Heaps',
    'DSA: Graphs', 'DSA: Dynamic Programming', 'DSA: Greedy', 'DSA: Backtracking',
    'DSA: Bit Manipulation', 'DSA: Math & Geometry', 'DSA: Advanced Structures',
    // Projects last
    'Projects',
  ];

  const sectionMap = new Map<string, Page[]>();
  for (const page of pages) {
    const existing = sectionMap.get(page.section) || [];
    existing.push(page);
    sectionMap.set(page.section, existing);
  }

  const sections: Section[] = sectionOrder
    .filter((name) => sectionMap.has(name))
    .map((name) => ({
      title: name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      pages: sectionMap.get(name)!,
    }));

  return { sections, allPages: pages };
}

export const { sections, allPages } = loadAllContent();
export const projectPages = allPages.filter((p) => p.isProject);
export const dsaPages = allPages.filter((p) => p.isDSA);
export const dsaSectionsList = sections.filter((s) => s.title.startsWith('DSA:'));

export function getPageBySlug(slug: string): Page | undefined {
  return allPages.find((p) => p.slug === slug);
}

export function getAdjacentPages(slug: string): { prev?: Page; next?: Page } {
  const idx = allPages.findIndex((p) => p.slug === slug);
  if (idx === -1) return {};
  return {
    prev: idx > 0 ? allPages[idx - 1] : undefined,
    next: idx < allPages.length - 1 ? allPages[idx + 1] : undefined,
  };
}
