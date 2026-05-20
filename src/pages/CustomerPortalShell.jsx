import { Link } from 'react-router-dom';
import { Building2, MapPin, ShoppingCart } from 'lucide-react';
import { useApp } from '../context/useApp';
import { useCart } from '../hooks/useCart';

function firstNameOf(fullName, fallbackEmail) {
  if (fullName && fullName.trim()) {
    return fullName.trim().split(/\s+/)[0];
  }
  if (fallbackEmail && fallbackEmail.includes('@')) {
    return fallbackEmail.split('@')[0];
  }
  return null;
}

function timeOfDayGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Working late';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
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

  const greeting = timeOfDayGreeting();

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

        {/* Persistent welcome banner: greets the user by name and surfaces the
            currently-active company + delivery location so they can spot at
            a glance whether they're ordering against the right account. */}
        {(firstName || companyLabel || locationLabel) ? (
          <div className="cp-welcome-strip">
            <div className="cp-nav-inner cp-welcome-strip-inner">
              <div className="cp-welcome-message">
                <span className="cp-welcome-wave" aria-hidden="true">👋</span>
                <div className="cp-welcome-text">
                  <span className="cp-welcome-eyebrow">{greeting}</span>
                  <span className="cp-welcome-name">
                    {firstName ? <>Welcome back, <strong>{firstName}</strong></> : 'Welcome back'}
                  </span>
                </div>
              </div>
              {(companyLabel || locationLabel) ? (
                <div className="cp-welcome-context">
                  {companyLabel ? (
                    <span className="cp-welcome-context-item">
                      <Building2 size={14} />
                      <span title="Active company">{companyLabel}</span>
                    </span>
                  ) : null}
                  {locationLabel ? (
                    <span className="cp-welcome-context-item">
                      <MapPin size={14} />
                      <span title="Delivery location">{locationLabel}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>
      <div className="customer-portal-content">{children}</div>
    </main>
  );
}
