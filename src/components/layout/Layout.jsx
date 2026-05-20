import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../../context/useApp';
import PhaseOneSidebar from './PhaseOneSidebar';
import PhaseOneTopBar from './PhaseOneTopBar';

const MOBILE_BREAKPOINT = 900;

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

export default function Layout({ children }) {
  const { state, dispatch } = useApp();
  const location = useLocation();

  // On first mount: if we're on a mobile-sized viewport, force the sidebar
  // closed so it doesn't cover the screen. On desktop default behavior is
  // unchanged.
  useEffect(() => {
    if (isMobileViewport() && !state.sidebarCollapsed) {
      dispatch({ type: 'TOGGLE_SIDEBAR' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close the sidebar when navigating on mobile (the drawer should never
  // stay open across a route change).
  useEffect(() => {
    if (isMobileViewport() && !state.sidebarCollapsed) {
      dispatch({ type: 'TOGGLE_SIDEBAR' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  function closeMobileSidebar() {
    if (isMobileViewport() && !state.sidebarCollapsed) {
      dispatch({ type: 'TOGGLE_SIDEBAR' });
    }
  }

  const sidebarOpen = !state.sidebarCollapsed;

  return (
    <div className={`app-layout ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <PhaseOneSidebar />
      {/* Backdrop appears on mobile only (CSS-gated) while the drawer is open */}
      <button
        type="button"
        className={`app-sidebar-backdrop ${sidebarOpen ? 'is-visible' : ''}`}
        onClick={closeMobileSidebar}
        aria-label="Close menu"
        tabIndex={sidebarOpen ? 0 : -1}
      />
      <div className={`app-main${state.sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <PhaseOneTopBar />
        <main className="app-content">
          {children}
        </main>
      </div>
      {/* Toast container */}
      {state.toasts.length > 0 && (
        <div className="toast-container">
          {state.toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              {t.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
