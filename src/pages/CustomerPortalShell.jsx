import { Link } from 'react-router-dom';
import { Building2, MapPin, ShoppingCart, User } from 'lucide-react';
import { useApp } from '../context/useApp';
import { useCart } from '../hooks/useCart';

function firstNameOf(fullName, fallbackEmail) {
  if (fullName && fullName.trim()) {
    return fullName.trim().split(/\s+/)[0];
  }
  if (fallbackEmail && fallbackEmail.includes('@')) {
    return fallbackEmail.split('@')[0];
  }
  return 'Welcome';
}

export default function CustomerPortalShell({ children }) {
  const { state, logout } = useApp();
  const {
    cartItemCount,
    activeClientId,
    activeLocationId,
    portalClients,
    activeLocations,
  } = useCart();

  const contact = state.customerPortal?.contact ?? null;
  const firstName = firstNameOf(contact?.fullName, contact?.email);

  const activeCompany = portalClients.find((c) => c.id === activeClientId);
  const companyLabel = activeCompany
    ? (activeCompany.operatingAs?.trim() || activeCompany.name)
    : null;

  const activeLocation = activeLocations.find((l) => l.id === activeLocationId);
  const locationLabel = activeLocation?.name ?? null;

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

        {/* Persistent user / company / location strip */}
        {(contact || companyLabel || locationLabel) ? (
          <div className="cp-nav-context">
            <div className="cp-nav-inner cp-nav-context-inner">
              <span className="cp-nav-context-chip">
                <User size={13} />
                <span>Signed in as <strong>{firstName}</strong></span>
              </span>
              {companyLabel ? (
                <span className="cp-nav-context-chip">
                  <Building2 size={13} />
                  <span>{companyLabel}</span>
                </span>
              ) : null}
              {locationLabel ? (
                <span className="cp-nav-context-chip">
                  <MapPin size={13} />
                  <span>{locationLabel}</span>
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>
      <div className="customer-portal-content">{children}</div>
    </main>
  );
}
