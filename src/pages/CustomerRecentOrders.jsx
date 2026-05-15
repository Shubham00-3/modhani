import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useApp } from '../context/useApp';
import {
  formatCurrency,
  formatDateTime,
  getProductDisplayName,
  getProductOrderUnitLabel,
} from '../data/phaseOneData';

export default function CustomerRecentOrders() {
  const { state } = useApp();
  const portal = state.customerPortal;
  const orders = portal?.recentOrders ?? [];
  const productsById = useMemo(
    () => new Map((portal?.products ?? []).map((p) => [p.id, p])),
    [portal?.products]
  );

  return (
    <section className="cp-recent-orders-page">
      <Link to="/" className="cp-nav-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
        <ArrowLeft size={16} /> Back to Catalogue
      </Link>
      <h1>Recent Orders</h1>

      {orders.length === 0 ? (
        <div className="customer-portal-panel customer-pending-panel">
          <p>No recent orders yet.</p>
        </div>
      ) : (
        <div className="cp-recent-orders-list">
          {orders.map((order) => (
            <div key={order.id} className="cp-recent-order-card">
              <div className="cp-recent-order-card-header">
                <strong>Order #{order.orderNumber}</strong>
                <div className="cp-recent-order-meta">
                  <span>{formatDateTime(order.createdAt)}</span>
                  <span className={`cp-recent-pill-status status-${order.status.toLowerCase().replace(/\s+/g, '-')}`}>
                    {order.status}
                  </span>
                </div>
              </div>
              {(order.items ?? []).length ? (
                <div className="cp-recent-detail-lines">
                  {order.items.map((item) => {
                    const product = productsById.get(item.productId);
                    const unitPrice = item.clientPrice ?? product?.clientPrice ?? 0;
                    return (
                      <div className="cp-recent-detail-line" key={item.id}>
                        <span>{product ? getProductDisplayName(product) : item.productId}</span>
                        <span className="cp-detail-qty">
                          {Number(item.quantity).toLocaleString()} x {product ? getProductOrderUnitLabel(product) : 'Order unit'}
                        </span>
                        <span className="cp-detail-price">{formatCurrency(Number(item.quantity) * unitPrice)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="customer-empty-cart">No line details available</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
