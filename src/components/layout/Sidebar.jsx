import { NavLink } from 'react-router-dom';
import { useApp } from '../../context/useApp';
import {
  LayoutDashboard, ShoppingCart, FlaskConical, BarChart3, Settings, ChevronLeft, ChevronRight, ScrollText
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/orders', label: 'Orders & Invoicing', icon: ShoppingCart },
  { to: '/production', label: 'Production & Batches', icon: FlaskConical },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const { state, dispatch } = useApp();
  const collapsed = state.sidebarCollapsed;
  const location = useLocation();

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-brand">
        <img className="sidebar-brand-logo" src="/modhani-logo.svg" alt="Modhani" />
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            end={to === '/'}
          >
            <Icon size={20} />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          className="sidebar-collapse-btn"
          onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{state.currentUser.initials}</div>
          {!collapsed && (
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{state.currentUser.name}</div>
              <div className="sidebar-user-role">
                {state.currentUser.role === 'admin' ? 'Admin' : 'Staff'}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
