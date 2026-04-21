import { useLocation } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { useApp } from '../../context/useApp';
import { formatTime } from '../../data/phaseOneData';

const pageTitles = {
  '/': 'Overview',
  '/orders': 'Orders & Invoicing',
  '/production': 'Production & Batches',
  '/reports': 'Reports',
  '/clients-locations': 'Clients & Locations',
  '/products': 'Products',
  '/settings': 'Settings',
  '/audit': 'Audit Trail',
};

export default function PhaseOneTopBar() {
  const { state, dispatch, logout } = useApp();
  const location = useLocation();
  const currentTitle = pageTitles[location.pathname] || 'ModhaniOS';
  const qbHealthy = state.quickBooks.connected && state.quickBooks.status === 'connected';
  const currentUser = state.currentUser ?? { id: '', initials: '?', name: 'Staff user', role: 'staff' };
  const qbStatusLabel = qbHealthy ? 'Connected' : 'Not Configured Yet';
  const qbSyncLabel = state.quickBooks.lastSyncAt ? formatTime(state.quickBooks.lastSyncAt) : 'Not synced yet';

  return (
    <header className={`topbar${state.sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <div className="topbar-left">
        <div className="topbar-breadcrumb">
          <span>ModhaniOS</span>
          <span>/</span>
          <span className="topbar-breadcrumb-current">{currentTitle}</span>
        </div>
      </div>

      <div className="topbar-center">
        <div className="topbar-qb-status">
          <span
            className="topbar-qb-dot"
            style={{ background: qbHealthy ? 'var(--color-success)' : 'var(--color-warning)' }}
          />
          <span>QuickBooks Desktop - {qbStatusLabel}</span>
          <span style={{ color: 'var(--color-text-muted)', marginLeft: '4px' }}>|</span>
          <span style={{ color: 'var(--color-text-muted)' }}>
            Last sync: {qbSyncLabel}
          </span>
        </div>
      </div>

      <div className="topbar-right">
        <label className="topbar-search" style={{ minWidth: 0 }}>
          <Search size={16} />
          <input type="text" placeholder="Search dashboard..." />
        </label>

        {state.authConfigured ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '8px 12px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-card)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap' }}>{currentUser.name}</div>
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                {currentUser.role} account
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" type="button" onClick={logout}>
              Sign Out
            </button>
          </div>
        ) : (
          <select
            className="form-select"
            style={{ minWidth: 180 }}
            value={currentUser.id}
            onChange={(event) => dispatch({ type: 'SET_CURRENT_USER', payload: event.target.value })}
          >
            {state.users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.role})
              </option>
            ))}
          </select>
        )}

        <button className="topbar-icon-btn" type="button">
          <Bell size={20} />
          <span className="notification-dot" />
        </button>

        <div className="topbar-avatar">{currentUser.initials}</div>
      </div>
    </header>
  );
}
