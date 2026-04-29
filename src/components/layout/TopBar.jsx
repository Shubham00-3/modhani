import { useLocation } from 'react-router-dom';
import { useApp } from '../../context/useApp';
import { Search, Bell } from 'lucide-react';

const pageTitles = {
  '/': 'Overview',
  '/orders': 'Orders & Invoicing',
  '/production': 'Production & Batches',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/audit': 'Audit Trail',
};

export default function TopBar() {
  const { state } = useApp();
  const location = useLocation();
  const currentTitle = pageTitles[location.pathname] || 'ModhaniOS';

  return (
    <header className={`topbar${state.sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <div className="topbar-left">
        <div className="topbar-breadcrumb">
          <span className="topbar-breadcrumb-current">{currentTitle}</span>
        </div>
      </div>

      <div className="topbar-center">
        <div className="topbar-qb-status">
          <span className="topbar-qb-dot" />
          <span>QuickBooks Desktop — Synced</span>
          <span style={{ color: 'var(--color-text-muted)', marginLeft: '4px' }}>•</span>
          <span style={{ color: 'var(--color-text-muted)' }}>Last sync: 2 mins ago</span>
        </div>
      </div>

      <div className="topbar-right">
        <div className="topbar-search">
          <Search size={16} />
          <input type="text" placeholder="Search..." />
        </div>
        <button className="topbar-icon-btn">
          <Bell size={20} />
          <span className="notification-dot" />
        </button>
        <div className="topbar-avatar">{state.currentUser.initials}</div>
      </div>
    </header>
  );
}
