import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bell, LogOut, Menu, Package, Search, ShoppingCart, X } from 'lucide-react';
import { useApp } from '../../context/useApp';
import { formatTime } from '../../data/phaseOneData';
import { formatRelativeTime } from '../../lib/notifications';

const pageTitles = {
  '/': 'Overview',
  '/orders': 'Orders & Invoicing',
  '/production': 'Production & Lots',
  '/inventory': 'Inventory',
  '/reports': 'Reports',
  '/clients-locations': 'Clients & Locations',
  '/customers': 'Customers',
  '/products': 'Products',
  '/settings': 'Settings',
  '/audit': 'Audit Trail',
};

const notificationMeta = {
  'low-stock': {
    icon: Package,
    label: 'Low stock',
  },
  'late-order': {
    icon: AlertTriangle,
    label: 'Late order',
  },
  'order-received': {
    icon: ShoppingCart,
    label: 'Order received',
  },
  fifo: {
    icon: AlertTriangle,
    label: 'FIFO reminder',
  },
};

function getNotificationIcon(notification) {
  return notificationMeta[notification.type]?.icon ?? Bell;
}

export default function PhaseOneTopBar() {
  const { state, dispatch, logout, dismissNotification, clearNotifications } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [notificationPanelPath, setNotificationPanelPath] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const notificationPanelRef = useRef(null);
  const userMenuRef = useRef(null);
  const currentTitle = pageTitles[location.pathname] || 'ModhaniOS';
  const dashboardSearchValue = searchParams.get('q') ?? '';
  const qbHealthy = state.quickBooks.connected && state.quickBooks.status === 'connected';
  const currentUser = state.currentUser ?? { id: '', initials: '?', name: 'Staff user', role: 'staff' };
  const qbStatusLabel = qbHealthy ? 'Connected' : 'Not Configured Yet';
  const qbSyncLabel = state.quickBooks.lastSyncAt ? formatTime(state.quickBooks.lastSyncAt) : 'Not synced yet';
  const notificationCount = state.notifications.length;
  const notificationsOpen = notificationPanelPath === location.pathname;

  function handleDashboardSearchChange(event) {
    const nextSearchParams = new URLSearchParams(searchParams);
    const value = event.target.value;

    if (value.trim()) {
      nextSearchParams.set('q', value);
    } else {
      nextSearchParams.delete('q');
    }

    setSearchParams(nextSearchParams, { replace: true });
  }

  useEffect(() => {
    if (!notificationsOpen) return undefined;

    function handlePointerDown(event) {
      if (!notificationPanelRef.current?.contains(event.target)) {
        setNotificationPanelPath(null);
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setNotificationPanelPath(null);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [notificationsOpen]);

  useEffect(() => {
    if (!userMenuOpen) return undefined;

    function handlePointerDown(event) {
      if (!userMenuRef.current?.contains(event.target)) {
        setUserMenuOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') setUserMenuOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [userMenuOpen]);

  function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
  }

  return (
    <header className={`topbar${state.sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <div className="topbar-left">
        <button
          className="topbar-menu-btn"
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          aria-label={state.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Menu size={20} />
        </button>
        <div className="topbar-breadcrumb">
          <span className="topbar-breadcrumb-current">{currentTitle}</span>
        </div>
      </div>

      <div className="topbar-center">
        <button
          className="topbar-qb-status topbar-qb-status-btn"
          type="button"
          onClick={() => navigate('/settings')}
          title="Open QuickBooks settings"
        >
          <span
            className="topbar-qb-dot"
            style={{ background: qbHealthy ? 'var(--color-success)' : 'var(--color-warning)' }}
          />
          <span>QuickBooks Desktop - {qbStatusLabel}</span>
          <span style={{ color: 'var(--color-text-muted)', marginLeft: '4px' }}>|</span>
          <span style={{ color: 'var(--color-text-muted)' }}>
            Last sync: {qbSyncLabel}
          </span>
        </button>
      </div>

      <div className="topbar-right">
        <label className="topbar-search" style={{ minWidth: 0 }}>
          <Search size={16} />
          <input
            type="search"
            placeholder="Search dashboard..."
            value={dashboardSearchValue}
            onChange={handleDashboardSearchChange}
          />
        </label>

        {!state.authConfigured ? (
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
        ) : null}

        <div className="topbar-notifications" ref={notificationPanelRef}>
          <button
            className="topbar-icon-btn"
            type="button"
            aria-label="Open notifications"
            aria-expanded={notificationsOpen}
            onClick={() =>
              setNotificationPanelPath((current) => (current === location.pathname ? null : location.pathname))
            }
          >
            <Bell size={20} />
            {notificationCount > 0 ? (
              <span className="topbar-icon-badge">{notificationCount > 99 ? '99+' : notificationCount}</span>
            ) : null}
          </button>

          {notificationsOpen ? (
            <div className="topbar-notifications-panel">
              <div className="topbar-notifications-header">
                <div>
                  <div className="topbar-notifications-title">Notifications</div>
                  <div className="topbar-notifications-subtitle">
                    {notificationCount ? `${notificationCount} active operational alert${notificationCount === 1 ? '' : 's'}` : 'No active alerts'}
                  </div>
                </div>
                <div className="topbar-notifications-actions">
                  {notificationCount > 0 ? (
                    <button className="btn btn-ghost btn-sm" type="button" onClick={() => clearNotifications()}>
                      Clear all
                    </button>
                  ) : null}
                    <button
                      className="topbar-icon-btn topbar-icon-btn-sm"
                      type="button"
                      aria-label="Close notifications"
                      onClick={() => setNotificationPanelPath(null)}
                    >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {notificationCount > 0 ? (
                <div className="topbar-notifications-list">
                  {state.notifications.map((notification) => {
                    const Icon = getNotificationIcon(notification);

                    return (
                      <div key={notification.key} className="notification-item">
                        <div className={`notification-item-icon ${notification.severity}`}>
                          <Icon size={16} />
                        </div>
                        <div className="notification-item-content">
                          <div className="notification-item-title">{notification.title}</div>
                          <div className="notification-item-description">{notification.description}</div>
                          <div className="notification-item-time">{formatRelativeTime(notification.timestamp)}</div>
                        </div>
                        <button
                          className="notification-item-dismiss"
                          type="button"
                          aria-label={`Dismiss ${notification.title}`}
                          onClick={() => dismissNotification(notification.key)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="topbar-notifications-empty">
                  <Bell size={24} />
                  <div className="topbar-notifications-empty-title">All clear</div>
                  <div className="topbar-notifications-empty-description">
                    Low stock, late orders, FIFO reminders, and new order intake alerts will appear here.
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {state.authConfigured ? (
          <div className="topbar-user-menu" ref={userMenuRef}>
            <button
              className="topbar-avatar-btn"
              type="button"
              aria-label="Open user menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((open) => !open)}
            >
              <span className="topbar-avatar">{currentUser.initials}</span>
            </button>
            {userMenuOpen ? (
              <div className="topbar-user-menu-panel" role="menu">
                <div className="topbar-user-menu-header">
                  <div className="topbar-user-menu-name">{currentUser.name}</div>
                  <div className="topbar-user-menu-role">{capitalize(currentUser.role)} account</div>
                </div>
                <button
                  className="topbar-user-menu-item topbar-user-menu-item-danger"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                >
                  <LogOut size={16} />
                  <span>Sign out</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="topbar-avatar">{currentUser.initials}</div>
        )}
      </div>
    </header>
  );
}
