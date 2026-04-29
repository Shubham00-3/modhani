import { useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ArrowLeft, ClipboardList, LogOut, PackagePlus, ShoppingCart } from 'lucide-react';
import { useApp } from '../context/useApp';
import {
  formatCurrency,
  formatDate,
  getClientName,
  getClientPricingForProduct,
  getLocationName,
  getOrderValue,
  getProduct,
  getProductDisplayName,
} from '../data/phaseOneData';

function PortalLayout({ children }) {
  const { state, logout } = useApp();
  const client = state.clients.find((entry) => entry.id === state.customerContact?.clientId);

  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div>
          <div className="portal-brand">ModhaniOS Portal</div>
          <div className="portal-subtitle">
            {client?.name ?? 'Customer'} ordering access for {state.customerContact?.name ?? 'buyer'}
          </div>
        </div>
        <div className="portal-header-actions">
          <NavLink className="btn btn-secondary" to="/portal">
            <ClipboardList size={16} /> Orders
          </NavLink>
          <NavLink className="btn btn-primary" to="/portal/orders/new">
            <PackagePlus size={16} /> New Order
          </NavLink>
          <button className="btn btn-ghost" type="button" onClick={logout}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </header>
      <main className="portal-main">{children}</main>
    </div>
  );
}

export function CustomerPortalDashboard() {
  const { state } = useApp();
  const orders = [...state.orders].sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  const openOrders = orders.filter((order) => ['pending', 'partial', 'fulfilled', 'invoiced'].includes(order.status));
  const shippedOrders = orders.filter((order) => order.status === 'shipped');

  return (
    <PortalLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="page-subtitle">Track submitted orders and place new replenishment requests.</p>
        </div>
        <Link className="btn btn-primary" to="/portal/orders/new">
          <ShoppingCart size={16} /> Place Order
        </Link>
      </div>

      <div className="grid-3">
        <PortalStat label="Open Orders" value={openOrders.length.toLocaleString()} />
        <PortalStat label="Shipped Orders" value={shippedOrders.length.toLocaleString()} />
        <PortalStat label="Locations" value={state.locations.length.toLocaleString()} />
      </div>

      <div className="card">
        {orders.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Location</th>
                <th>Items</th>
                <th>Total</th>
                <th>Requested</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="cell-monospace">#{order.orderNumber}</td>
                  <td>
                    <span className={`badge badge-${order.status}`}>{order.status}</span>
                  </td>
                  <td>{getLocationName(state.locations, order.locationId)}</td>
                  <td>{order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0).toLocaleString()} units</td>
                  <td className="cell-monospace">{formatCurrency(getOrderValue(order))}</td>
                  <td>{formatDate(order.requestedDeliveryDate)}</td>
                  <td>{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No orders yet</div>
            <div className="empty-state-description">Place the first portal order when your location needs product.</div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

export function CustomerPortalNewOrder() {
  const { state, dispatch, addToast } = useApp();
  const navigate = useNavigate();
  const [locationId, setLocationId] = useState(state.locations[0]?.id ?? '');
  const [requestedDeliveryDate, setRequestedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ id: 'line-1', productId: '', quantity: '' }]);

  const productOptions = useMemo(() => {
    const pricedProductIds = new Set(
      state.clientPricing
        .filter((price) => price.clientId === state.customerContact?.clientId)
        .map((price) => price.productId)
    );
    const scopedProducts = state.products.filter((product) => pricedProductIds.has(product.id));
    return scopedProducts.length ? scopedProducts : state.products;
  }, [state.clientPricing, state.customerContact?.clientId, state.products]);

  const orderTotal = lines.reduce((sum, line) => {
    const product = getProduct(state.products, line.productId);
    if (!product || !Number(line.quantity)) return sum;
    const price = getClientPricingForProduct(
      state.clientPricing,
      state.customerContact?.clientId,
      line.productId,
      product.baseCataloguePrice
    );
    return sum + price * Number(line.quantity);
  }, 0);

  function updateLine(lineId, updates) {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...updates } : line)));
  }

  function addLine() {
    setLines((current) => [...current, { id: `line-${Date.now()}`, productId: '', quantity: '' }]);
  }

  function removeLine(lineId) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.id !== lineId) : current));
  }

  async function submitOrder(event) {
    event.preventDefault();

    if (!locationId) {
      addToast('Select a delivery location.', 'warning');
      return;
    }

    const validLines = lines.filter((line) => line.productId && Number(line.quantity) > 0);
    if (!validLines.length) {
      addToast('Add at least one product line.', 'warning');
      return;
    }

    if (validLines.some((line) => !Number.isInteger(Number(line.quantity)))) {
      addToast('Order quantities must be whole numbers.', 'warning');
      return;
    }

    const productIds = new Set();
    for (const line of validLines) {
      if (productIds.has(line.productId)) {
        addToast('Combine duplicate products into a single line.', 'warning');
        return;
      }
      productIds.add(line.productId);
    }

    const result = await dispatch({
      type: 'ADD_PORTAL_ORDER',
      payload: {
        locationId,
        requestedDeliveryDate,
        notes,
        items: validLines.map((line) => ({
          productId: line.productId,
          quantity: Number(line.quantity),
        })),
      },
    });

    if (!result?.ok) return;

    addToast('Order submitted to Modhani operations.');
    navigate('/portal');
  }

  return (
    <PortalLayout>
      <div className="page-header">
        <div>
          <Link className="btn btn-ghost btn-sm" to="/portal">
            <ArrowLeft size={16} /> Back
          </Link>
          <h1 className="page-title" style={{ marginTop: 'var(--space-3)' }}>New Order</h1>
          <p className="page-subtitle">
            {getClientName(state.clients, state.customerContact?.clientId)} product request.
          </p>
        </div>
      </div>

      <form className="portal-order-layout" onSubmit={submitOrder}>
        <section className="card">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Delivery Location</label>
              <select className="form-select" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">Select location</option>
                {state.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Requested Delivery Date</label>
              <input
                className="form-input"
                type="date"
                value={requestedDeliveryDate}
                onChange={(event) => setRequestedDeliveryDate(event.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
            <label className="form-label">Notes</label>
            <textarea
              className="form-input"
              rows="3"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Delivery notes, PO reference, or special instructions"
            />
          </div>
        </section>

        <section className="card">
          <div className="card-title">Products</div>
          <div className="portal-lines">
            {lines.map((line) => {
              const product = getProduct(state.products, line.productId);
              const price = product
                ? getClientPricingForProduct(
                    state.clientPricing,
                    state.customerContact?.clientId,
                    line.productId,
                    product.baseCataloguePrice
                  )
                : 0;

              return (
                <div key={line.id} className="portal-line">
                  <div className="form-group">
                    <label className="form-label">Product</label>
                    <select
                      className="form-select"
                      value={line.productId}
                      onChange={(event) => updateLine(line.id, { productId: event.target.value })}
                    >
                      <option value="">Select product</option>
                      {productOptions.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {getProductDisplayName(entry)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Quantity</label>
                    <input
                      className="form-input"
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantity}
                      onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                    />
                  </div>
                  <div className="portal-line-total">
                    <span>{formatCurrency(price)}</span>
                    <strong>{formatCurrency(price * (Number(line.quantity) || 0))}</strong>
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={() => removeLine(line.id)}>
                    Remove
                  </button>
                </div>
              );
            })}
          </div>

          <div className="portal-order-footer">
            <button className="btn btn-secondary" type="button" onClick={addLine}>
              Add Product
            </button>
            <div className="portal-total">
              <span>Estimated Total</span>
              <strong>{formatCurrency(orderTotal)}</strong>
            </div>
            <button className="btn btn-primary" type="submit">
              Submit Order
            </button>
          </div>
        </section>
      </form>
    </PortalLayout>
  );
}

function PortalStat({ label, value }) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontWeight: 700, fontSize: 'var(--font-size-xl)' }}>{value}</div>
    </div>
  );
}
