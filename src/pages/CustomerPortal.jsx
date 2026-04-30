import { useMemo, useState } from 'react';
import { Building2, CheckCircle2, LogOut, Package, Send, ShoppingCart } from 'lucide-react';
import { useApp } from '../context/useApp';
import { formatCurrency, formatDateTime, getProductDisplayName, getProductImageUrl } from '../data/phaseOneData';

export default function CustomerPortal() {
  const { state, logout, completeCustomerProfile, submitPortalOrder } = useApp();
  const portal = state.customerPortal;
  const [fullName, setFullName] = useState('');
  const [locationId, setLocationId] = useState('');
  const [quantities, setQuantities] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const activeLocationId = locationId || portal?.locations?.[0]?.id || '';
  const selectedLines = useMemo(
    () =>
      (portal?.products ?? [])
        .map((product) => ({
          product,
          quantity: Number(quantities[product.id] ?? 0),
        }))
        .filter((line) => line.quantity > 0),
    [portal?.products, quantities]
  );
  const orderTotal = selectedLines.reduce((total, line) => total + line.quantity * line.product.clientPrice, 0);

  async function handleCompleteProfile(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    const result = await completeCustomerProfile(fullName);

    if (!result.ok) {
      setError(result.error ?? 'Unable to create customer profile.');
    } else {
      setMessage('Profile submitted. Staff will link your company before ordering is available.');
      setFullName('');
    }

    setSubmitting(false);
  }

  async function handleSubmitOrder(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    if (!activeLocationId) {
      setError('Select a delivery location.');
      setSubmitting(false);
      return;
    }

    if (!selectedLines.length) {
      setError('Enter a quantity for at least one product.');
      setSubmitting(false);
      return;
    }

    const result = await submitPortalOrder({
      clientId: portal.client.id,
      locationId: activeLocationId,
      items: selectedLines.map((line) => ({
        productId: line.product.id,
        quantity: line.quantity,
      })),
    });

    if (!result.ok) {
      setError(result.error ?? 'Unable to submit order.');
    } else {
      setMessage('Order submitted. Modhani staff can now see it in Orders & Invoicing.');
      setQuantities({});
    }

    setSubmitting(false);
  }

  if (!portal) {
    return <PortalShell onLogout={logout}>Loading customer portal...</PortalShell>;
  }

  if (!portal.contact) {
    return (
      <PortalShell onLogout={logout}>
        <section className="customer-portal-panel">
          <div className="portal-section-heading">
            <Building2 size={20} />
            <div>
              <h1>Complete Customer Profile</h1>
              <p>Submit your name so Modhani staff can link your login to the right company.</p>
            </div>
          </div>
          <form className="customer-profile-form" onSubmit={handleCompleteProfile}>
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input className="form-input" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Profile'}
            </button>
          </form>
          <PortalMessages error={error} message={message} />
        </section>
      </PortalShell>
    );
  }

  if (portal.contact.status !== 'active' || !portal.client) {
    return (
      <PortalShell onLogout={logout}>
        <section className="customer-portal-panel customer-pending-panel">
          <CheckCircle2 size={34} />
          <h1>Pending Staff Approval</h1>
          <p>
            Your customer account is created. Modhani staff still needs to link {portal.contact.email} to a company
            before you can place orders.
          </p>
        </section>
      </PortalShell>
    );
  }

  return (
    <PortalShell onLogout={logout}>
      <section className="customer-portal-header">
        <div>
          <p className="eyebrow">Customer Portal</p>
          <h1>{portal.client.name}</h1>
          <p>Choose your delivery location, enter quantities, and submit your order to Modhani.</p>
        </div>
        <div className="customer-total-card">
          <span>Order Total</span>
          <strong>{formatCurrency(orderTotal)}</strong>
        </div>
      </section>

      <form className="customer-order-layout" onSubmit={handleSubmitOrder}>
        <section className="customer-portal-panel">
          <div className="portal-section-heading">
            <ShoppingCart size={20} />
            <div>
              <h2>Order Details</h2>
              <p>Submitted orders appear as pending portal orders for staff.</p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Location</label>
            <select className="form-select" value={activeLocationId} onChange={(event) => setLocationId(event.target.value)}>
              {portal.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <PortalMessages error={error} message={message} />

          <button className="btn btn-primary" type="submit" disabled={submitting || !portal.products.length}>
            <Send size={16} /> {submitting ? 'Submitting...' : 'Submit Order'}
          </button>
        </section>

        <section className="customer-products-list">
          {portal.products.length ? (
            portal.products.map((product) => {
              const imageUrl = getProductImageUrl(product);
              const quantity = quantities[product.id] ?? '';
              const lineTotal = Number(quantity || 0) * product.clientPrice;

              return (
                <article className="customer-product-row" key={product.id}>
                  <div className="customer-product-image">
                    {imageUrl ? <img src={imageUrl} alt={getProductDisplayName(product)} /> : <Package size={22} />}
                  </div>
                  <div className="customer-product-info">
                    <h3>{getProductDisplayName(product)}</h3>
                    <p>{product.category || 'Product'}</p>
                    <strong>{formatCurrency(product.clientPrice)}</strong>
                  </div>
                  <div className="customer-product-qty">
                    <label className="form-label">Qty</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="1"
                      value={quantity}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [product.id]: event.target.value,
                        }))
                      }
                    />
                    <span>{formatCurrency(lineTotal)}</span>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="customer-portal-panel customer-pending-panel">
              <Package size={34} />
              <h2>No Products Available</h2>
              <p>Modhani staff has not enabled products for this company catalogue yet.</p>
            </div>
          )}
        </section>
      </form>

      {portal.recentOrders.length ? (
        <section className="customer-portal-panel">
          <div className="portal-section-heading">
            <CheckCircle2 size={20} />
            <div>
              <h2>Recent Portal Orders</h2>
              <p>Your latest submitted portal orders.</p>
            </div>
          </div>
          <div className="customer-order-history">
            {portal.recentOrders.map((order) => (
              <div key={order.id}>
                <strong>Order #{order.orderNumber}</strong>
                <span>{order.status}</span>
                <span>{formatDateTime(order.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </PortalShell>
  );
}

function PortalShell({ children, onLogout }) {
  return (
    <main className="customer-portal-page">
      <header className="customer-portal-nav">
        <img className="sidebar-brand-logo" src="/modhani-logo.svg" alt="Modhani" />
        <button className="btn btn-ghost" type="button" onClick={onLogout}>
          <LogOut size={16} /> Sign Out
        </button>
      </header>
      <div className="customer-portal-content">{children}</div>
    </main>
  );
}

function PortalMessages({ error, message }) {
  return (
    <>
      {error ? (
        <div className="alert alert-warning">
          <div className="alert-content">
            <div className="alert-title">Action needed</div>
            <div className="alert-description">{error}</div>
          </div>
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success">
          <div className="alert-content">
            <div className="alert-title">Saved</div>
            <div className="alert-description">{message}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
