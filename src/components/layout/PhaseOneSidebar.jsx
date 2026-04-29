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
        <img className="sidebar-brand-logo" src="/modhani-logo.svg" alt="Modhani" />
        {!collapsed && <span className="sidebar-brand-text">OS</span>}
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
