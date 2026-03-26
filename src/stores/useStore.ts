import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface StudyState {
  completedPages: string[];
  sidebarOpen: boolean;
  commandPaletteOpen: boolean;
  scrollPositions: Record<string, number>;
  togglePageComplete: (slug: string) => void;
  isPageComplete: (slug: string) => boolean;
  setSidebarOpen: (open: boolean) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  saveScrollPosition: (slug: string, position: number) => void;
  getScrollPosition: (slug: string) => number;
}

export const useStore = create<StudyState>()(
  persist(
    (set, get) => ({
      completedPages: [],
      sidebarOpen: true,
      commandPaletteOpen: false,
      scrollPositions: {},

      togglePageComplete: (slug) =>
        set((state) => ({
          completedPages: state.completedPages.includes(slug)
            ? state.completedPages.filter((s) => s !== slug)
            : [...state.completedPages, slug],
        })),

      isPageComplete: (slug) => get().completedPages.includes(slug),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

      saveScrollPosition: (slug, position) =>
        set((state) => ({
          scrollPositions: { ...state.scrollPositions, [slug]: position },
        })),

      getScrollPosition: (slug) => get().scrollPositions[slug] || 0,
    }),
    {
      name: 'csharp-study-storage',
      partialize: (state) => ({
        completedPages: state.completedPages,
        scrollPositions: state.scrollPositions,
      }),
    }
  )
);
