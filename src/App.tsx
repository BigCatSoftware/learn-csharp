import { Routes, Route, Navigate } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { AnimatePresence } from 'framer-motion';
import { Layout } from './components/Layout';
import { HomePage } from './components/HomePage';
import { LessonPage } from './components/LessonPage';
import { CommandPalette } from './components/CommandPalette';
import { useStore } from './stores/useStore';

export default function App() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useStore();

  useHotkeys('mod+k', (e) => {
    e.preventDefault();
    setCommandPaletteOpen(!commandPaletteOpen);
  });

  return (
    <>
      <AnimatePresence>
        {commandPaletteOpen && <CommandPalette />}
      </AnimatePresence>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="lesson/:slug" element={<LessonPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
