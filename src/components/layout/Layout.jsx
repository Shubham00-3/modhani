import { useApp } from '../../context/useApp';
import PhaseOneSidebar from './PhaseOneSidebar';
import PhaseOneTopBar from './PhaseOneTopBar';

export default function Layout({ children }) {
  const { state } = useApp();

  return (
    <div className="app-layout">
      <PhaseOneSidebar />
      <div className={`app-main${state.sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <PhaseOneTopBar />
        <main className="app-content">
          {children}
        </main>
      </div>
      {/* Toast container */}
      {state.toasts.length > 0 && (
        <div className="toast-container">
          {state.toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              {t.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
