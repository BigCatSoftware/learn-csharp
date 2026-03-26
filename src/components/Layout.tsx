import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useStore } from '../stores/useStore';

export function Layout() {
  const { sidebarOpen } = useStore();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div
        className="flex flex-1 flex-col overflow-hidden transition-all duration-300"
        style={{ marginLeft: sidebarOpen ? '280px' : '0' }}
      >
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
