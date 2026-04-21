import { createElement } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  LayoutDashboard,
  Package,
  ScrollText,
  Settings,
  ShoppingCart,
} from 'lucide-react';
import { useApp } from '../../context/useApp';

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/orders', label: 'Orders & Invoicing', icon: ShoppingCart },
  { to: '/production', label: 'Production & Batches', icon: FlaskConical },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/audit', label: 'Audit Trail', icon: ScrollText },
  { to: '/clients-locations', label: 'Clients & Locations', icon: Building2 },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function PhaseOneSidebar() {
  const { state, dispatch } = useApp();
  const collapsed = state.sidebarCollapsed;
  const currentUser = state.currentUser ?? { initials: '?', name: 'Staff user', role: 'staff' };

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="22" fill="#1A3021" />
            <path
              d="M16 28c0-6 4-12 8-12s8 6 8 12"
              stroke="#D1A14E"
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="24" cy="30" r="4" fill="#D1A14E" />
            <path
              d="M20 18c2-4 6-4 8 0"
              stroke="#8FA899"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </div>
        {!collapsed && <span className="sidebar-brand-text">ModhaniOS</span>}
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            end={to === '/'}
          >
            {createElement(icon, { size: 20 })}
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          className="sidebar-collapse-btn"
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{currentUser.initials}</div>
          {!collapsed && (
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{currentUser.name}</div>
              <div className="sidebar-user-role">{currentUser.role}</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
