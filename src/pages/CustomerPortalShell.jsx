import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { useApp } from '../context/useApp';
import { useCart } from '../hooks/useCart';

export default function CustomerPortalShell({ children }) {
  const { logout } = useApp();
  const { cartItemCount } = useCart();

  return (
    <main className="customer-portal-page">
      <header className="cp-nav">
        <div className="cp-nav-inner">
          <div className="cp-nav-brand">
            <img className="cp-brand-logo" src="/modhani-logo.svg" alt="Modhani" />
            <div>
              <strong className="cp-brand-name">Modhani</strong>
              <span className="cp-brand-sub">Customer ordering portal</span>
            </div>
          </div>

          <div className="cp-nav-right">
            <Link to="/" className="cp-nav-link">Catalogue</Link>
            <Link to="/cart" className="cp-nav-link">
              <ShoppingCart size={16} />
              Cart
              {cartItemCount > 0 && <span className="cp-cart-badge">{cartItemCount}</span>}
            </Link>
            <Link to="/recent-orders" className="cp-nav-link">Recent Orders</Link>
            <button className="cp-signout-btn" type="button" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <div className="customer-portal-content">{children}</div>
    </main>
  );
}
