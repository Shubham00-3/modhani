import { useMemo, useState } from 'react';
import { Download, ExternalLink, FileCheck, Printer, Search } from 'lucide-react';
import { useApp } from '../context/useApp';
import {
  formatDateTime,
  getClientName,
  getLocationName,
} from '../data/phaseOneData';
import { downloadProofOfDeliveryZip, printProofOfDelivery } from '../utils/printDocuments';

export default function PhaseOnePOD() {
  const { state, addToast } = useApp();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [downloading, setDownloading] = useState(false);

  // Every delivered order with a captured POD, newest first.
  const podOrders = useMemo(
    () =>
      state.orders
        .filter((order) => order.status === 'delivered' && order.podSignedAt)
        .sort((a, b) => new Date(b.podSignedAt).getTime() - new Date(a.podSignedAt).getTime()),
    [state.orders]
  );

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return podOrders;

    return podOrders.filter((order) =>
      [
        `#${order.orderNumber}`,
        order.orderNumber,
        order.invoiceNumber,
        getClientName(state.clients, order.clientId),
        getLocationName(state.locations, order.locationId),
        order.podSignedBy,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [podOrders, search, state.clients, state.locations]);

  const visibleIds = filteredOrders.map((order) => order.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectedOrders = podOrders.filter((order) => selectedIds.has(order.id));

  function toggleOne(orderId, checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  }

  function toggleAllVisible(checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => {
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  }

  async function downloadOrders(orders) {
    if (!orders.length) {
      addToast('Select at least one POD to download.', 'warning');
      return;
    }

    setDownloading(true);
    try {
      const downloaded = await downloadProofOfDeliveryZip({
        orders,
        clients: state.clients,
        locations: state.locations,
        products: state.products,
        batches: state.batches,
      });
      if (downloaded === false) {
        addToast('Could not prepare POD PDFs.', 'warning');
        return;
      }
      addToast(`Downloaded ${orders.length} POD PDF${orders.length === 1 ? '' : 's'} as a ZIP.`);
    } catch (error) {
      addToast(`Could not download POD PDFs: ${error.message}`, 'warning');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Proof of Delivery</h1>
          <p className="page-subtitle">
            Search delivered orders and download their signed PODs individually or in bulk.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={selectedOrders.length === 0 || downloading}
          onClick={() => downloadOrders(selectedOrders)}
        >
          <Download size={16} /> {downloading ? 'Preparing PDFs...' : `Download ZIP (${selectedOrders.length} PDFs)`}
        </button>
      </div>

      <div className="card">
        <div className="catalogue-header">
          <div>
            <div className="card-title">
              <FileCheck size={18} /> Proof of Delivery Records
            </div>
            <div className="catalogue-count">
              Showing {filteredOrders.length.toLocaleString()} of {podOrders.length.toLocaleString()} PODs
            </div>
          </div>
          <label className="catalogue-search">
            <Search size={16} />
            <input
              type="search"
              placeholder="Search by order #, client, location, receiver..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        {podOrders.length ? (
          <div className="table-scroll-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      aria-label="Select all visible PODs"
                      checked={allVisibleSelected}
                      onChange={(event) => toggleAllVisible(event.target.checked)}
                    />
                  </th>
                  <th>Order</th>
                  <th>Invoice #</th>
                  <th>Client</th>
                  <th>Location</th>
                  <th>Received By</th>
                  <th>Delivered</th>
                  <th>Drive</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length ? (
                  filteredOrders.map((order) => (
                    <tr key={order.id}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          aria-label={`Select POD for order ${order.orderNumber}`}
                          checked={selectedIds.has(order.id)}
                          onChange={(event) => toggleOne(order.id, event.target.checked)}
                        />
                      </td>
                      <td className="cell-monospace cell-align-left">#{order.orderNumber}</td>
                      <td className="cell-monospace cell-align-left">{order.invoiceNumber ?? '-'}</td>
                      <td style={{ fontWeight: 600 }}>{getClientName(state.clients, order.clientId)}</td>
                      <td>{getLocationName(state.locations, order.locationId)}</td>
                      <td>{order.podSignedBy ?? '-'}</td>
                      <td>{formatDateTime(order.podSignedAt)}</td>
                      <td>
                        {order.podDriveWebViewLink ? (
                          <a className="btn btn-ghost btn-sm" href={order.podDriveWebViewLink} target="_blank" rel="noreferrer">
                            <ExternalLink size={14} /> Open
                          </a>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>Pending</span>
                        )}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() =>
                            printProofOfDelivery({
                              order,
                              clients: state.clients,
                              locations: state.locations,
                              products: state.products,
                              batches: state.batches,
                            })
                          }
                        >
                          <Printer size={14} /> Print
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="9" style={{ padding: 0 }}>
                      <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                        <div className="empty-state-title">No matching PODs</div>
                        <div className="empty-state-description">
                          Try searching by order number, client, location, or receiver name.
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No PODs yet</div>
            <div className="empty-state-description">
              Proof of delivery records appear here once drivers complete deliveries.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
