import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  FileText,
  Lock,
  Mail,
  Package,
  Plus,
  Printer,
  RotateCcw,
  Trash2,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../context/useApp';
import { useModalBehavior, handleOverlayClick } from '../hooks/useModalBehavior';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatTorontoDateTime,
  getBatchLabel,
  getActiveCatalogProducts,
  getClientName,
  getDriverName,
  getClientPricingForProduct,
  getInvoiceableTotal,
  getItemDiscountReason,
  getItemOutstandingQty,
  getLocationName,
  getQuickBooksSyncLabel,
  getOrderOutstandingQty,
  getOrderShipToSnapshot,
  getOrderValue,
  getProduct,
  getProductDisplayName,
  getProductImageUrl,
  formatCaseQuantityBreakdown,
  formatOrderStatus,
  hasProductImage,
  isLocationShipToReady,
  isProductHstApplicable,
  isValidCaseQuantityStep,
  HST_RATE,
} from '../data/phaseOneData';
import { printInvoice, printPackingSlip, printProofOfDelivery } from '../utils/printDocuments';

function buildAutoFifoAssignments(order, batches) {
  const remainingByBatchId = new Map(
    batches.map((batch) => [batch.id, Math.max(Number(batch.qtyRemaining) || 0, 0)])
  );
  const nextAssignments = {};

  order.items.forEach((item) => {
    let remainingNeeded = getItemOutstandingQty(item);
    if (remainingNeeded <= 0) return;

    const availableBatches = batches
      .filter((batch) =>
        batch.productId === item.productId
        && batch.status === 'active'
        && !batch.deletedAt
        && (remainingByBatchId.get(batch.id) ?? 0) > 0
      )
      .sort((left, right) => {
        const dateDiff = new Date(left.productionDate) - new Date(right.productionDate);
        if (dateDiff !== 0) return dateDiff;
        return String(left.batchNumber ?? '').localeCompare(String(right.batchNumber ?? ''));
      });

    availableBatches.forEach((batch) => {
      if (remainingNeeded <= 0) return;
      const batchRemaining = remainingByBatchId.get(batch.id) ?? 0;
      const assignedQty = Number(Math.min(remainingNeeded, batchRemaining).toFixed(2));
      if (assignedQty <= 0) return;

      nextAssignments[item.id] = {
        ...(nextAssignments[item.id] ?? {}),
        [batch.id]: assignedQty,
      };
      remainingByBatchId.set(batch.id, Number((batchRemaining - assignedQty).toFixed(2)));
      remainingNeeded = Number((remainingNeeded - assignedQty).toFixed(2));
    });
  });

  return nextAssignments;
}

export default function PhaseOneOrdersInvoicing() {
  const { state, dispatch, addToast } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const dashboardView = searchParams.get('view') ?? '';
  const dashboardSearch = (searchParams.get('q') ?? '').trim().toLowerCase();
  const activeProducts = useMemo(() => getActiveCatalogProducts(state.products), [state.products]);
  const canCreateOrders = state.clients.length > 0 && state.locations.length > 0 && activeProducts.length > 0;
  const [filters, setFilters] = useState({
    clientId: '',
    locationId: '',
    status: '',
    source: '',
    driverUserId: '',
  });
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showFulfilment, setShowFulfilment] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showEditInvoiceModal, setShowEditInvoiceModal] = useState(false);
  const [showAddOrderModal, setShowAddOrderModal] = useState(false);
  const [showBulkInvoiceModal, setShowBulkInvoiceModal] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState(() => new Set());
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const hasActiveFilters = Boolean(filters.clientId || filters.locationId || filters.status || filters.source || filters.driverUserId || dashboardView || dashboardSearch);

  const selectedOrder = state.orders.find((order) => order.id === selectedOrderId) ?? null;

  const filteredOrders = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);

    return [...state.orders]
      .filter((order) => {
        if (dashboardView === 'open') {
          return ['pending', 'partial', 'fulfilled', 'invoiced'].includes(order.status);
        }

        if (dashboardView === 'outstanding') {
          return getOrderOutstandingQty(order) > 0;
        }

        if (dashboardView === 'qb-pending') {
          return Boolean(order.invoiceNumber && !order.qbInvoiceNumber);
        }

        if (dashboardView === 'shipments-today') {
          return order.shippedAt?.slice(0, 10) === todayKey;
        }

        return true;
      })
      .filter((order) => (filters.clientId ? order.clientId === filters.clientId : true))
      .filter((order) => (filters.locationId ? order.locationId === filters.locationId : true))
      .filter((order) => (filters.status ? order.status === filters.status : true))
      .filter((order) => (filters.source ? order.source === filters.source : true))
      .filter((order) => {
        if (!filters.driverUserId) return true;
        if (filters.driverUserId === '__unassigned__') return !order.driverUserId;
        return order.driverUserId === filters.driverUserId;
      })
      .filter((order) => {
        if (!dashboardSearch) return true;
        const itemText = order.items
          .map((item) => {
            const product = getProduct(state.products, item.productId);
            return [product ? getProductDisplayName(product) : '', product?.qbItemName, item.quantity, item.fulfilledQty]
              .filter(Boolean)
              .join(' ');
          })
          .join(' ');
        return [
          order.orderNumber,
          order.status,
          order.source,
          order.invoiceNumber,
          order.qbInvoiceNumber,
          getClientName(state.clients, order.clientId),
          getLocationName(state.locations, order.locationId),
          getDriverName(state.users, order.driverUserId),
          itemText,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(dashboardSearch);
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [dashboardSearch, dashboardView, filters, state.clients, state.locations, state.orders, state.products, state.users]);

  const dashboardViewLabel = {
    open: 'Open Orders',
    outstanding: 'Outstanding Units',
    'qb-pending': 'Pending QuickBooks Push',
    'shipments-today': 'Shipments Today',
  }[dashboardView];

  const locationOptions = filters.clientId
    ? state.locations.filter((location) => location.clientId === filters.clientId)
    : state.locations;

  const driverOptions = useMemo(
    () =>
      state.users
        .filter((user) => user.role === 'driver' && !user.disabledAt)
        .sort((left, right) => String(left.name ?? '').localeCompare(String(right.name ?? ''))),
    [state.users]
  );

  function openOrder(orderId) {
    setSelectedOrderId(orderId);
    setShowFulfilment(false);
    setShowInvoiceModal(false);
    setShowEditInvoiceModal(false);
  }

  function updateFilters(updater) {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('view');
    setSearchParams(nextSearchParams);
    setFilters(updater);
  }

  function resetFilters() {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('view');
    nextSearchParams.delete('q');
    setSearchParams(nextSearchParams);
    setFilters({ clientId: '', locationId: '', status: '', source: '', driverUserId: '' });
  }

  async function closePanel() {
    if (showFulfilment && selectedOrder?.lockedBy === state.currentUser.id) {
      await dispatch({
        type: 'UNLOCK_ORDER',
        payload: { orderId: selectedOrder.id, userId: state.currentUser.id },
      });
    }

    setShowFulfilment(false);
    setShowInvoiceModal(false);
    setShowEditInvoiceModal(false);
    setSelectedOrderId(null);
  }

  // Wire up Escape-to-close + body-scroll-lock whenever the order detail
  // modal is open. The hook is a no-op when the order isn't open.
  useModalBehavior(closePanel, { enabled: Boolean(selectedOrder) });

  async function beginFulfilment(order) {
    if (!state.currentUser.permissions.fulfilOrders) {
      addToast('This user cannot fulfil orders.', 'warning');
      return;
    }

    if (order.lockedBy && order.lockedBy !== state.currentUser.id) {
      const lockingUser = state.users.find((user) => user.id === order.lockedBy);
      addToast(`Order locked by ${lockingUser?.name ?? 'another user'}.`, 'warning');
      return;
    }

    if (!order.lockedBy) {
      const result = await dispatch({
        type: 'LOCK_ORDER',
        payload: {
          orderId: order.id,
          userId: state.currentUser.id,
          lockedAt: new Date().toISOString(),
        },
      });

      if (!result?.ok) return;
    }

    openOrder(order.id);
    setShowFulfilment(true);
  }

  async function handleQueueQuickBooks(order) {
    const location = state.locations.find((entry) => entry.id === order.locationId);

    if (!order.invoiceNumber) {
      addToast('Create the ModhaniOS invoice before queueing QuickBooks sync.', 'warning');
      return;
    }

    if (!isLocationShipToReady(location)) {
      addToast('Add the QuickBooks customer/store name on the location before syncing.', 'warning');
      return;
    }

    const result = await dispatch({
      type: 'QUEUE_QB_INVOICE',
      payload: {
        orderId: order.id,
        jobType: order.qbTxnId ? 'invoice_update' : 'invoice',
        timestamp: new Date().toISOString(),
      },
    });

    if (!result?.ok) return;

    addToast(`Invoice ${order.invoiceNumber} queued for QuickBooks Desktop ${order.qbTxnId ? 'update' : 'sync'}.`);
  }

  async function handleConfirmShipment(order) {
    const client = state.clients.find((entry) => entry.id === order.clientId);
    const timestamp = new Date().toISOString();
    const packingSlipNumber = order.packingSlipNumber ?? `PS-${order.orderNumber}`;
    const emailedPackingSlip = Boolean(client?.emailPackingSlip);
    // No driver required: with a driver the order goes out for delivery
    // (shipped); without one it waits as "packed" until a driver is assigned.
    const nextStatus = order.driverUserId ? 'shipped' : 'packed';

    const result = await dispatch({
      type: 'CONFIRM_SHIPMENT',
      payload: {
        orderId: order.id,
        packingSlipNumber,
        packingSlipSentAt: emailedPackingSlip ? timestamp : null,
      },
    });

    if (!result?.ok) return;

    const updatedOrder = {
      ...order,
      status: nextStatus,
      shippedAt: nextStatus === 'shipped' ? new Date().toISOString() : order.shippedAt,
      packingSlipNumber,
      packingSlipSentAt: emailedPackingSlip ? new Date().toISOString() : null,
    };

    printPackingSlip({
      order: updatedOrder,
      clients: state.clients,
      locations: state.locations,
      products: state.products,
      batches: state.batches,
    });

    addToast(
      order.driverUserId
        ? `Shipment confirmed for Order #${order.orderNumber}.`
        : `Order #${order.orderNumber} packed. Assign a driver to send it out for delivery.`
    );
  }

  async function handleSendInvoice(order) {
    if (!order.invoiceNumber) {
      addToast('Create the invoice before sending it.', 'warning');
      return;
    }
    if (order.invoiceEmailSentAt) {
      addToast(`Invoice for Order #${order.orderNumber} was already sent.`, 'warning');
      return;
    }

    const result = await dispatch({
      type: 'SEND_INVOICE_EMAIL',
      payload: { orderId: order.id, timestamp: new Date().toISOString() },
    });

    if (!result?.ok) return;

    addToast(`Invoice for Order #${order.orderNumber} sent.`);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Orders & Invoicing</h1>
          <p className="page-subtitle">
            Manual fulfilment, invoicing, QuickBooks sync, and packing slip control.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" type="button" onClick={() => setShowBulkInvoiceModal(true)}>
            <Mail size={16} /> Send Invoices
          </button>
          <button className="btn btn-primary" type="button" disabled={!canCreateOrders} onClick={() => setShowAddOrderModal(true)}>
            <Plus size={16} /> Add Incoming Order
          </button>
        </div>
      </div>

      {!canCreateOrders ? (
        <div className="alert alert-warning section">
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">Set up master data before receiving orders</div>
            <div className="alert-description">
              Add at least one client, location, and product before creating incoming orders.
            </div>
          </div>
        </div>
      ) : null}

      <div className="filter-bar">
        {dashboardViewLabel ? (
          <div className="alert alert-info" style={{ flex: '1 1 100%' }}>
            <FileText size={18} />
            <div className="alert-content">
              <div className="alert-title">Showing {dashboardViewLabel}</div>
              <div className="alert-description">
                This view was opened from the dashboard. Use Reset Filters to return to all orders.
              </div>
            </div>
          </div>
        ) : null}

        <select
          aria-label="Filter by client"
          title="Filter by client"
          className="form-select"
          value={filters.clientId}
          onChange={(event) => updateFilters((current) => ({ ...current, clientId: event.target.value, locationId: '' }))}
        >
          <option value="">All Clients</option>
          {state.clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by location"
          title="Filter by location"
          className="form-select"
          value={filters.locationId}
          onChange={(event) => updateFilters((current) => ({ ...current, locationId: event.target.value }))}
        >
          <option value="">All Locations</option>
          {locationOptions.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by status"
          title="Filter by status"
          className="form-select"
          value={filters.status}
          onChange={(event) => updateFilters((current) => ({ ...current, status: event.target.value }))}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="invoiced">Invoiced</option>
          <option value="packed">Packed</option>
          <option value="shipped">Shipped</option>
          <option value="delivered">Delivered</option>
          <option value="declined">Declined</option>
        </select>

        <select
          aria-label="Filter by source"
          title="Filter by source"
          className="form-select"
          value={filters.source}
          onChange={(event) => updateFilters((current) => ({ ...current, source: event.target.value }))}
        >
          <option value="">All Sources</option>
          <option value="edi">EDI</option>
          <option value="portal">Portal</option>
        </select>

        <select
          aria-label="Filter by driver"
          title="Filter by driver"
          className="form-select"
          value={filters.driverUserId}
          onChange={(event) => updateFilters((current) => ({ ...current, driverUserId: event.target.value }))}
        >
          <option value="">All Drivers</option>
          <option value="__unassigned__">Unassigned</option>
          {driverOptions.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.name}
            </option>
          ))}
        </select>
        <button
          className="btn btn-secondary"
          type="button"
          disabled={!hasActiveFilters}
          onClick={resetFilters}
        >
          Reset Filters
        </button>
      </div>

      {bulkSelectedIds.size > 0 ? (
        <div className="card section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', padding: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Users size={18} />
            <strong>{bulkSelectedIds.size} shipped order{bulkSelectedIds.size === 1 ? '' : 's'} selected</strong>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-ghost" type="button" onClick={() => setBulkSelectedIds(new Set())}>
              Clear selection
            </button>
            <button className="btn btn-primary" type="button" onClick={() => setShowBulkAssignModal(true)}>
              <Users size={16} /> Assign Driver to Selected
            </button>
          </div>
        </div>
      ) : null}

      <div className="card">
        {filteredOrders.length ? (
          <div className="table-scroll-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 36, textAlign: 'center' }}>
                    <BulkSelectAllCheckbox
                      eligibleIds={filteredOrders
                        .filter((order) => ['packed', 'shipped'].includes(order.status) && !order.podSignedAt)
                        .map((order) => order.id)}
                      selectedIds={bulkSelectedIds}
                      onChange={setBulkSelectedIds}
                    />
                  </th>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Client</th>
                  <th>Location</th>
                  <th>Driver</th>
                  <th>Source</th>
                  <th className="cell-align-right">Total Value</th>
                  <th>QB Invoice</th>
                  <th>Packing Slip</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const canBulkSelect = ['packed', 'shipped'].includes(order.status) && !order.podSignedAt;
                  const isSelected = bulkSelectedIds.has(order.id);
                  return (
                  <tr
                    key={order.id}
                    onClick={() => openOrder(order.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openOrder(order.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    style={{ cursor: 'pointer' }}
                  >
                    <td onClick={(event) => event.stopPropagation()} style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label={`Select order ${order.orderNumber} for bulk driver assignment`}
                        disabled={!canBulkSelect}
                        title={canBulkSelect ? undefined : 'Bulk assignment is only available for packed or shipped orders that have not been delivered yet.'}
                        checked={isSelected}
                        onChange={(event) => {
                          setBulkSelectedIds((current) => {
                            const next = new Set(current);
                            if (event.target.checked) next.add(order.id);
                            else next.delete(order.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="cell-monospace cell-align-left">#{order.orderNumber}</td>
                    <td>
                      <span className={`badge badge-${order.status}`}>{formatOrderStatus(order.status)}</span>
                      {order.lockedBy && order.lockedBy !== state.currentUser.id ? (
                        <span style={{ marginLeft: 8, color: 'var(--color-warning)' }}>
                          <Lock size={14} style={{ verticalAlign: 'middle' }} />
                        </span>
                      ) : null}
                    </td>
                    <td style={{ fontWeight: 600 }}>{getClientName(state.clients, order.clientId)}</td>
                    <td>{getLocationName(state.locations, order.locationId)}</td>
                    <td>
                      {getDriverName(state.users, order.driverUserId) ?? (
                        <span style={{ color: 'var(--color-text-muted)' }}>Unassigned</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${order.source}`}>{order.source.toUpperCase()}</span>
                    </td>
                    <td className="cell-monospace">{formatCurrency(getOrderValue(order))}</td>
                    <td className="cell-monospace cell-align-left">{getQuickBooksSyncLabel(order)}</td>
                    <td className="cell-monospace cell-align-left">{order.packingSlipNumber ?? '-'}</td>
                    <td>{formatDate(order.createdAt)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No orders match these filters</div>
            <div className="empty-state-description">
              Reset the filters or add a new incoming order to continue the workflow.
            </div>
          </div>
        )}
      </div>

      {showBulkAssignModal ? (
        <BulkAssignDriverModal
          orderIds={[...bulkSelectedIds]}
          onClose={() => setShowBulkAssignModal(false)}
          onAssigned={() => {
            setShowBulkAssignModal(false);
            setBulkSelectedIds(new Set());
          }}
        />
      ) : null}

      {selectedOrder ? (
        <div className="modal-overlay" onClick={handleOverlayClick(closePanel)}>
          <div
            className="modal modal-order-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2 id="order-detail-title" className="modal-title">Order #{selectedOrder.orderNumber}</h2>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 2 }}>
                  {getClientName(state.clients, selectedOrder.clientId)} - {getLocationName(state.locations, selectedOrder.locationId)}
                </div>
              </div>
              <button className="btn btn-ghost" type="button" onClick={closePanel} aria-label="Close order details">
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {showFulfilment ? (
                <FulfilmentPanel order={selectedOrder} onBack={async () => {
                  // Await the unlock so we surface server errors as toasts
                  // (dispatch already does that on failure) instead of
                  // silently leaving the order locked.
                  const result = await dispatch({
                    type: 'UNLOCK_ORDER',
                    payload: { orderId: selectedOrder.id, userId: state.currentUser.id },
                  });
                  // Even if unlock failed, drop out of the fulfilment view so
                  // the user isn't stuck; the toast tells them what happened.
                  setShowFulfilment(false);
                  return result;
                }} />
              ) : (
                <OrderDetailPanel
                  order={selectedOrder}
                  onStartFulfilment={beginFulfilment}
                  onCreateInvoice={() => setShowInvoiceModal(true)}
                  onEditInvoice={() => setShowEditInvoiceModal(true)}
                  onPushToQuickBooks={handleQueueQuickBooks}
                  onConfirmShipment={handleConfirmShipment}
                  onSendInvoice={handleSendInvoice}
                  onPrintPackingSlip={(currentOrder) =>
                    printPackingSlip({
                      order: currentOrder,
                      clients: state.clients,
                      locations: state.locations,
                      products: state.products,
                      batches: state.batches,
                    })
                  }
                  onPrintProofOfDelivery={(currentOrder) =>
                    printProofOfDelivery({
                      order: currentOrder,
                      clients: state.clients,
                      locations: state.locations,
                      products: state.products,
                      batches: state.batches,
                    })
                  }
                  onPrintInvoice={(currentOrder) =>
                    printInvoice({
                      order: currentOrder,
                      clients: state.clients,
                      locations: state.locations,
                      products: state.products,
                      batches: state.batches,
                    })
                  }
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {showInvoiceModal && selectedOrder ? <InvoiceModal order={selectedOrder} onClose={() => setShowInvoiceModal(false)} /> : null}
      {showEditInvoiceModal && selectedOrder ? <EditInvoiceModal order={selectedOrder} onClose={() => setShowEditInvoiceModal(false)} /> : null}
      {showAddOrderModal ? <AddOrderModal onClose={() => setShowAddOrderModal(false)} /> : null}
      {showBulkInvoiceModal ? (
        <BulkInvoiceModal
          onClose={() => setShowBulkInvoiceModal(false)}
          onReviewOrder={(order) => {
            setSelectedOrderId(order.id);
            setShowBulkInvoiceModal(false);
            setShowEditInvoiceModal(true);
          }}
        />
      ) : null}
    </div>
  );
}

// Yesterday's local-day window [start, end) for the "Previous day" quick filter.
function getPreviousDayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 1);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

function isInvoiceBlockedByQuickBooks(order) {
  return ['pending', 'syncing', 'failed'].includes(order.qbSyncStatus);
}

function BulkInvoiceModal({ onClose, onReviewOrder }) {
  const { state, dispatch, addToast, notifyOrderEvent } = useApp();
  useModalBehavior(onClose);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [onlyPreviousDay, setOnlyPreviousDay] = useState(false);
  const [busy, setBusy] = useState(false);

  // Every order with an invoice that has not been emailed yet, newest first.
  const unsentInvoices = useMemo(
    () =>
      state.orders
        .filter((order) => order.invoiceNumber && !order.invoiceEmailSentAt)
        .sort((a, b) => new Date(b.invoicedAt ?? 0).getTime() - new Date(a.invoicedAt ?? 0).getTime()),
    [state.orders]
  );

  const visibleInvoices = useMemo(() => {
    if (!onlyPreviousDay) return unsentInvoices;
    const { start, end } = getPreviousDayRange();
    return unsentInvoices.filter((order) => {
      const invoicedMs = new Date(order.invoicedAt ?? 0).getTime();
      return invoicedMs >= start && invoicedMs < end;
    });
  }, [unsentInvoices, onlyPreviousDay]);

  const visibleIds = visibleInvoices.map((order) => order.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectedOrders = visibleInvoices.filter((order) => selectedIds.has(order.id));

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
      visibleIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function selectPreviousDayInvoices() {
    const { start, end } = getPreviousDayRange();
    const previousDayIds = unsentInvoices
      .filter((order) => {
        const invoicedMs = new Date(order.invoicedAt ?? 0).getTime();
        return invoicedMs >= start && invoicedMs < end;
      })
      .map((order) => order.id);

    setOnlyPreviousDay(true);
    setSelectedIds(new Set(previousDayIds));
  }

  async function handleSend() {
    const orderIds = selectedOrders.map((order) => order.id);
    if (!orderIds.length) {
      addToast('Select at least one invoice to send.', 'warning');
      return;
    }

    const blockedByQuickBooks = selectedOrders.filter(isInvoiceBlockedByQuickBooks);
    if (blockedByQuickBooks.length) {
      const orderList = blockedByQuickBooks.map((order) => `#${order.orderNumber}`).join(', ');
      addToast(`Resolve QuickBooks sync before sending: ${orderList}`, 'warning');
      return;
    }

    setBusy(true);
    try {
      const result = await dispatch({
        type: 'BULK_SEND_INVOICE_EMAIL',
        payload: { orderIds, timestamp: new Date().toISOString() },
      });

      if (result?.ok) {
        // Fire the customer email per invoice (the bulk RPC only stamps them sent).
        const emailResults = await Promise.all(
          orderIds.map((orderId) =>
            notifyOrderEvent(orderId, 'invoice_ready').catch((error) => ({ ok: false, error }))
          )
        );
        const failedEmails = emailResults.filter((entry) => entry?.ok === false).length;
        addToast(
          failedEmails
            ? `Marked ${orderIds.length} invoice${orderIds.length === 1 ? '' : 's'} sent; ${failedEmails} email notification${failedEmails === 1 ? '' : 's'} failed.`
            : `Sent ${orderIds.length} invoice${orderIds.length === 1 ? '' : 's'}.`
        );
        setSelectedIds(new Set());
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleQueueQuickBooks() {
    const queueable = selectedOrders.filter((order) => {
      const location = state.locations.find((entry) => entry.id === order.locationId);
      return isLocationShipToReady(location) && order.qbSyncStatus !== 'syncing';
    });
    if (!queueable.length) {
      addToast('No selected invoices are ready for QuickBooks sync.', 'warning');
      return;
    }

    setBusy(true);
    let queued = 0;
    for (const order of queueable) {
      const result = await dispatch({
        type: 'QUEUE_QB_INVOICE',
        payload: {
          orderId: order.id,
          jobType: order.qbTxnId ? 'invoice_update' : 'invoice',
          timestamp: new Date().toISOString(),
        },
      });
      if (result?.ok) queued += 1;
    }
    setBusy(false);
    addToast(`Queued ${queued} invoice${queued === 1 ? '' : 's'} for QuickBooks.`);
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="bulk-invoice-title" onClick={(event) => event.stopPropagation()} style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <h3 id="bulk-invoice-title" className="modal-title">Send Invoices</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} aria-label="Close bulk invoice">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button
                className={`btn btn-sm ${onlyPreviousDay ? 'btn-ghost' : 'btn-secondary'}`}
                type="button"
                onClick={() => setOnlyPreviousDay(false)}
              >
                All unsent ({unsentInvoices.length})
              </button>
              <button
                className="btn btn-sm btn-secondary"
                type="button"
                onClick={selectPreviousDayInvoices}
              >
                Previous day
              </button>
            </div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
              {selectedOrders.length} selected
            </div>
          </div>

          {visibleInvoices.length ? (
            <div className="table-scroll-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 36, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        aria-label="Select all visible invoices"
                        checked={allVisibleSelected}
                        onChange={(event) => toggleAllVisible(event.target.checked)}
                      />
                    </th>
                    <th>Order</th>
                    <th>Client</th>
                    <th>Invoiced</th>
                    <th>QuickBooks</th>
                    <th className="cell-align-right">Total</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleInvoices.map((order) => (
                    <tr key={order.id}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          aria-label={`Select invoice for order ${order.orderNumber}`}
                          checked={selectedIds.has(order.id)}
                          onChange={(event) => toggleOne(order.id, event.target.checked)}
                        />
                      </td>
                      <td className="cell-monospace cell-align-left">#{order.orderNumber}</td>
                      <td style={{ fontWeight: 600 }}>{getClientName(state.clients, order.clientId)}</td>
                      <td>{order.invoicedAt ? formatDate(order.invoicedAt) : '-'}</td>
                      <td className="cell-align-left">{getQuickBooksSyncLabel(order)}</td>
                      <td className="cell-monospace">{formatCurrency(getOrderValue(order))}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" type="button" onClick={() => onReviewOrder(order)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <div className="empty-state-title">No unsent invoices</div>
              <div className="empty-state-description">
                {onlyPreviousDay ? 'No invoices were created yesterday.' : 'Every invoice has already been sent.'}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-secondary" type="button" onClick={handleQueueQuickBooks} disabled={busy || selectedOrders.length === 0}>
            <FileText size={16} /> Queue for QuickBooks
          </button>
          <button className="btn btn-primary" type="button" onClick={handleSend} disabled={busy || selectedOrders.length === 0}>
            <Mail size={16} /> Send Selected ({selectedOrders.length})
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

/**
 * Driver assignment row for the order detail panel. Lets admin pick which
 * registered driver should deliver this order. Assigning a driver to a "packed"
 * order advances it to "shipped" (out for delivery) and surfaces it in that
 * driver's queue; clearing the driver returns it to "packed".
 */
function DriverAssignmentRow({ order }) {
  const { state, dispatch, addToast } = useApp();
  const drivers = state.users.filter((u) => u.role === 'driver' && !u.disabledAt);
  const currentDriver = drivers.find((d) => d.id === order.driverUserId);
  const canAssign =
    state.currentUser?.permissions?.fulfilOrders
    || state.currentUser?.permissions?.manageSettings;
  const isDelivered = order.status === 'delivered';
  const [saving, setSaving] = useState(false);

  async function handleChange(event) {
    if (isDelivered) {
      addToast('Delivered orders cannot have their driver changed.', 'warning');
      return;
    }
    const next = event.target.value || null;
    if ((order.driverUserId ?? null) === next) return;

    const nextDriver = next ? drivers.find((driver) => driver.id === next) : null;
    const confirmed = window.confirm(
      next
        ? `Assign ${nextDriver?.name ?? 'this driver'} to order #${order.orderNumber}?`
        : `Remove the assigned driver from order #${order.orderNumber}?`
    );
    if (!confirmed) return;

    setSaving(true);
    const result = await dispatch({
      type: 'ASSIGN_DRIVER',
      payload: { orderId: order.id, driverUserId: next },
    });
    setSaving(false);
    if (result?.ok) {
      addToast(next
        ? `Driver assigned to order #${order.orderNumber}.`
        : `Driver removed from order #${order.orderNumber}.`);
    }
  }

  return (
    <div className="card" style={{ padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
            Assigned driver
          </div>
          <div style={{ marginTop: 4, fontWeight: 600 }}>
            {currentDriver ? currentDriver.name : <span style={{ color: 'var(--color-text-muted)' }}>Unassigned</span>}
          </div>
          {currentDriver && order.driverAssignedAt ? (
            <div style={{ marginTop: 2, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Assigned {formatDateTime(order.driverAssignedAt)}
            </div>
          ) : null}
        </div>
        <div style={{ minWidth: 220 }}>
          <select
            className="form-select"
            value={order.driverUserId ?? ''}
            onChange={handleChange}
            disabled={!canAssign || saving || drivers.length === 0 || isDelivered}
            title={
              isDelivered
                ? 'Delivered orders cannot have their driver changed'
                : !canAssign
                  ? 'Requires fulfilment or settings permission'
                  : undefined
            }
          >
            <option value="">- Unassigned -</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {drivers.length === 0 ? (
            <div style={{ marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              No active drivers registered. Invite a driver from Settings → User Management.
            </div>
          ) : null}
          {isDelivered ? (
            <div style={{ marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
              Driver is locked after delivery.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FormTextInput({ label, value, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="form-input" value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function OrderDetailPanel({
  order,
  onStartFulfilment,
  onCreateInvoice,
  onEditInvoice,
  onPushToQuickBooks,
  onConfirmShipment,
  onSendInvoice,
  onPrintPackingSlip,
  onPrintProofOfDelivery,
  onPrintInvoice,
}) {
  const { state } = useApp();
  const orderAudit = state.auditLog.filter((entry) => entry.orderId === order.id);
  const lockedBy = order.lockedBy ? state.users.find((user) => user.id === order.lockedBy) : null;
  const invoiceableTotal = getInvoiceableTotal(order);
  const quickBooksJob = state.quickBooksJobs.find(
    (job) => order.id && job.orderId === order.id && ['invoice', 'invoice_update'].includes(job.jobType) && job.status !== 'pushed'
  );
  const quickBooksStatus = getQuickBooksSyncLabel(order);
  const canEditInvoice =
    order.invoiceNumber &&
    state.currentUser.permissions.editInvoices &&
    ['invoiced', 'packed', 'shipped', 'delivered'].includes(order.status) &&
    order.qbSyncStatus !== 'pending' &&
    order.qbSyncStatus !== 'syncing' &&
    !quickBooksJob;
  const canQueueQuickBooks =
    order.invoiceNumber &&
    ['invoiced', 'packed', 'shipped', 'delivered'].includes(order.status) &&
    order.qbSyncStatus !== 'pushed' &&
    order.qbSyncStatus !== 'syncing' &&
    order.qbSyncStatus !== 'failed' &&
    !quickBooksJob;
  // A driver is no longer required to confirm a shipment. When an invoiced
  // order has no driver it simply becomes "packed" and waits for one.
  const isPackedAwaitingDriver = order.status === 'packed' && !order.driverUserId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {lockedBy && lockedBy.id !== state.currentUser.id ? (
        <div className="alert alert-warning">
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">Order currently locked</div>
            <div className="alert-description">
              {lockedBy.name} started fulfilment at {formatDateTime(order.lockedAt)}.
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid-2">
        <InfoCard label="Status" value={<span className={`badge badge-${order.status}`}>{formatOrderStatus(order.status)}</span>} />
        <InfoCard label="Source" value={<span className={`badge badge-${order.source}`}>{order.source.toUpperCase()}</span>} />
        <InfoCard label="Created" value={formatDateTime(order.createdAt)} />
        <InfoCard label="Outstanding" value={`${getOrderOutstandingQty(order).toLocaleString()} units`} />
        <InfoCard label="Invoice" value={order.invoiceNumber ?? '-'} />
        <InfoCard label="QuickBooks" value={quickBooksStatus} />
        <InfoCard
          label="POD"
          value={
            order.podSignedAt ? (
              <span className="badge badge-success">Signed by {order.podSignedBy}</span>
            ) : (
              '-'
            )
          }
        />
      </div>

      <DriverAssignmentRow order={order} />


      {quickBooksJob ? (
        <div className={`alert ${quickBooksJob.status === 'failed' ? 'alert-warning' : 'alert-info'}`}>
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">QuickBooks sync {quickBooksJob.status}</div>
            <div className="alert-description">
              {quickBooksJob.status === 'failed'
                ? quickBooksJob.errorMessage || 'The connector returned an error. Review the mapping and retry.'
                : 'QuickBooks Web Connector will pick up this invoice on its next run.'}
            </div>
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Line Items</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {order.items.map((item) => {
            const product = getProduct(state.products, item.productId);
            const assignedLotCodes = [
              ...new Set(item.assignedBatches.map((assigned) => getBatchLabel(state.batches, assigned.batchId)).filter(Boolean)),
            ];
            return (
              <div
                key={item.id}
                style={{
                  padding: 'var(--space-4)',
                  background: 'var(--color-bg)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                    <ProductThumbnail product={product} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{getProductDisplayName(product)}</div>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        Ordered {item.quantity.toLocaleString()} cases | Fulfilled {item.fulfilledQty.toLocaleString()} cases | Outstanding{' '}
                        {getItemOutstandingQty(item).toLocaleString()} cases
                        {(item.declinedQty ?? 0) > 0 ? ` | Declined ${item.declinedQty.toLocaleString()} cases` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="cell-monospace">{formatCurrency(item.overridePrice ?? item.clientPrice)}</div>
                </div>

                <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                  <span>Base: {formatCurrency(item.basePrice)}</span>
                  <span>Client: {formatCurrency(item.clientPrice)}</span>
                  {item.overridePrice != null ? (
                    <span style={{ color: 'var(--color-warning)' }}>
                      Override: {formatCurrency(item.overridePrice)} ({item.overrideReason})
                    </span>
                  ) : null}
                </div>

                {item.assignedBatches.length > 0 ? (
                  <div style={{ marginTop: 'var(--space-3)', paddingLeft: 'var(--space-4)', borderLeft: '2px solid var(--color-border)' }}>
                    {assignedLotCodes.map((lotCode) => (
                      <div key={lotCode} style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                        Lot Code {lotCode}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {(order.status === 'pending' || order.status === 'partial') && state.currentUser.permissions.fulfilOrders ? (
          <button className="btn btn-primary" type="button" onClick={() => onStartFulfilment(order)}>
            <Package size={16} /> {order.lockedBy === state.currentUser.id ? 'Resume Fulfilment' : 'Start Fulfilment'}
          </button>
        ) : null}

        {(order.status === 'fulfilled' || (order.status === 'partial' && invoiceableTotal > 0)) && !order.invoiceNumber ? (
          <button className="btn btn-secondary" type="button" onClick={onCreateInvoice}>
            <FileText size={16} /> Create Invoice
          </button>
        ) : null}

        {canQueueQuickBooks ? (
          <button className="btn btn-secondary" type="button" onClick={() => onPushToQuickBooks(order)}>
            <FileText size={16} /> Queue for QuickBooks Sync
          </button>
        ) : null}

        {canEditInvoice ? (
          <button className="btn btn-secondary" type="button" onClick={() => onEditInvoice(order)}>
            <FileText size={16} /> Edit Invoice
          </button>
        ) : null}

        {['invoiced', 'packed', 'shipped', 'delivered'].includes(order.status) && order.qbSyncStatus === 'failed' ? (
          <button className="btn btn-secondary" type="button" onClick={() => onPushToQuickBooks(order)}>
            <FileText size={16} /> Retry QuickBooks Sync
          </button>
        ) : null}

        {order.status === 'invoiced' ? (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => onConfirmShipment(order)}
          >
            <Truck size={16} /> Confirm Shipment
          </button>
        ) : null}

        {order.invoiceNumber ? (
          <button className="btn btn-ghost" type="button" onClick={() => onPrintInvoice(order)}>
            <Printer size={16} /> Print Invoice
          </button>
        ) : null}

        {order.invoiceNumber && !order.invoiceEmailSentAt ? (
          <button className="btn btn-secondary" type="button" onClick={() => onSendInvoice(order)}>
            <Mail size={16} /> Send Invoice
          </button>
        ) : null}

        {order.packingSlipNumber ? (
          <button className="btn btn-ghost" type="button" onClick={() => onPrintPackingSlip(order)}>
            <Printer size={16} /> Print Packing Slip
          </button>
        ) : null}

        {order.podSignedAt ? (
          <button className="btn btn-ghost" type="button" onClick={() => onPrintProofOfDelivery(order)}>
            <Printer size={16} /> Print POD
          </button>
        ) : null}
      </div>

      {order.invoiceNumber ? (
        <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          {order.invoiceEmailSentAt
            ? `Invoice sent ${formatDateTime(order.invoiceEmailSentAt)}`
            : 'Invoice not yet sent — review for transit damage, then use Send Invoice.'}
        </div>
      ) : null}

      {isPackedAwaitingDriver ? (
        <div className="alert alert-info" style={{ marginTop: 'var(--space-4)' }}>
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">Packed — awaiting driver</div>
            <div className="alert-description">Assign a driver to send this order out for delivery (it will move to Shipped).</div>
          </div>
        </div>
      ) : null}

      {order.podSignedAt ? (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h3 className="card-title">Proof of Delivery</h3>
          <div className="pod-staff-summary">
            <div>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                Signed by
              </div>
              <strong>{order.podSignedBy}</strong>
              <div style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
                {formatDateTime(order.podSignedAt)}
              </div>
              <div style={{ display: 'grid', gap: 3, color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', marginTop: 8 }}>
                <span>Local timestamp: {order.podSignedAtLocal ?? formatTorontoDateTime(order.podSignedAt)}</span>
                <span>Timezone: {order.podSignedTimezone ?? 'America/Toronto'}</span>
              </div>
              {order.podNotes ? <p style={{ marginTop: 10 }}>{order.podNotes}</p> : null}
            </div>
            {order.podSignatureDataUrl ? (
              <img src={order.podSignatureDataUrl} alt="Proof of delivery signature" />
            ) : null}
          </div>
          {Array.isArray(order.podPhotoUrls) && order.podPhotoUrls.length > 0 ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                Delivery Photos
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {order.podPhotoUrls.map((url, index) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: 96, height: 96, borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                    <img src={url} alt={`Delivery photo ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {order.declineReason && order.status !== 'declined' ? (
        <div className="alert alert-warning">
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">Remaining balance was closed</div>
            <div className="alert-description">{order.declineReason}</div>
          </div>
        </div>
      ) : null}

      <div>
        <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Audit Trail</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {orderAudit.map((entry) => (
            <div
              key={entry.id}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                borderLeft: '2px solid var(--color-secondary)',
                background: 'var(--color-bg)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div style={{ fontWeight: 600 }}>{entry.details}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                {entry.userName} | {formatDateTime(entry.timestamp)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FulfilmentPanel({ order, onBack }) {
  const { state, dispatch, addToast } = useApp();
  const [assignments, setAssignments] = useState(() => buildAutoFifoAssignments(order, state.batches));
  const [declineReason, setDeclineReason] = useState('');

  const totalOutstanding = getOrderOutstandingQty(order);
  const canDecline = order.items.every((item) => item.fulfilledQty === 0);
  const pendingAssignedQty = Object.values(assignments).reduce(
    (sum, batchMap) => sum + Object.values(batchMap).reduce((batchSum, qty) => batchSum + (Number(qty) || 0), 0),
    0
  );
  const canCloseRemaining =
    totalOutstanding > 0 && (order.items.some((item) => item.fulfilledQty > 0) || pendingAssignedQty > 0);

  function updateAssignment(itemId, batchId, rawValue, remainingNeeded) {
    const currentForItem = assignments[itemId] ?? {};
    const nextValue = Number(rawValue) || 0;
    const assignedElsewhere = Object.entries(currentForItem).reduce((sum, [key, value]) => {
      return key === batchId ? sum : sum + (Number(value) || 0);
    }, 0);

    const batch = state.batches.find((entry) => entry.id === batchId);
    const allowed = Math.max(0, remainingNeeded - assignedElsewhere);
    const cappedValue = Math.min(nextValue, batch?.qtyRemaining ?? 0, allowed);

    setAssignments((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? {}),
        [batchId]: cappedValue,
      },
    }));
  }

  async function confirmAssignments() {
    const flattened = Object.entries(assignments).flatMap(([orderItemId, batchMap]) =>
      Object.entries(batchMap)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([batchId, qty]) => ({ orderItemId, batchId, qty: Number(qty) }))
    );

    if (!flattened.length) {
      addToast('Enter at least one batch assignment.', 'warning');
      return;
    }
    if (flattened.some((entry) => !isValidCaseQuantityStep(entry.qty))) {
      addToast('Enter assignment quantities with up to 2 decimal places.', 'warning');
      return;
    }

    const result = await dispatch({
      type: 'APPLY_FULFILMENT',
      payload: {
        orderId: order.id,
        assignments: flattened,
        userId: state.currentUser.id,
      },
    });

    if (!result?.ok) return;

    const totalAssigned = flattened.reduce((sum, entry) => sum + entry.qty, 0);
    const remainingAfter = Math.max(totalOutstanding - totalAssigned, 0);

    addToast(
      remainingAfter > 0
        ? `Partial fulfilment saved. ${remainingAfter.toLocaleString()} cases remain outstanding.`
        : `Order #${order.orderNumber} fulfilled and ready for invoicing.`
    );

    onBack();
  }

  async function declineOrder() {
    if (!declineReason.trim()) {
      addToast('Provide a decline reason.', 'warning');
      return;
    }

    const result = await dispatch({
      type: 'DECLINE_ORDER',
      payload: {
        orderId: order.id,
        reason: declineReason.trim(),
      },
    });

    if (!result?.ok) return;

    addToast(`Order #${order.orderNumber} declined.`);
    onBack();
  }

  async function closeRemainingBalance() {
    if (!declineReason.trim()) {
      addToast('Provide a reason for declining the remaining balance.', 'warning');
      return;
    }

    const flattened = Object.entries(assignments).flatMap(([orderItemId, batchMap]) =>
      Object.entries(batchMap)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([batchId, qty]) => ({ orderItemId, batchId, qty: Number(qty) }))
    );

    const alreadyFulfilled = order.items.some((item) => item.fulfilledQty > 0);
    if (!flattened.length && !alreadyFulfilled) {
      addToast('Assign some quantity first, or use Decline Order for a full decline.', 'warning');
      return;
    }
    if (flattened.some((entry) => !isValidCaseQuantityStep(entry.qty))) {
      addToast('Enter assignment quantities with up to 2 decimal places.', 'warning');
      return;
    }

    const result = await dispatch({
      type: 'APPLY_FULFILMENT_AND_DECLINE_REMAINING',
      payload: {
        orderId: order.id,
        assignments: flattened,
        reason: declineReason.trim(),
        userId: state.currentUser.id,
        timestamp: new Date().toISOString(),
      },
    });

    if (!result?.ok) return;

    addToast(`Remaining balance closed for Order #${order.orderNumber}. The fulfilled quantity is ready for invoicing.`);
    onBack();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="card-title" style={{ marginBottom: 2 }}>FIFO Lot Assignment</div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            Auto-filled from oldest active lots. Staff can edit any quantity before saving.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => setAssignments(buildAutoFifoAssignments(order, state.batches))}
          >
            <RotateCcw size={14} /> Re-run FIFO
          </button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onBack}>
            Back
          </button>
        </div>
      </div>

      {order.items.map((item) => {
        const product = getProduct(state.products, item.productId);
        const outstanding = getItemOutstandingQty(item);
        const availableBatches = state.batches
          .filter((batch) => batch.productId === item.productId && batch.status === 'active' && !batch.deletedAt && batch.qtyRemaining > 0)
          .sort((left, right) => {
            const dateDiff = new Date(left.productionDate) - new Date(right.productionDate);
            if (dateDiff !== 0) return dateDiff;
            return String(left.batchNumber ?? '').localeCompare(String(right.batchNumber ?? ''));
          });

        const itemAssignments = assignments[item.id] ?? {};
        const assignedQty = Object.values(itemAssignments).reduce((sum, qty) => sum + (Number(qty) || 0), 0);

        return (
          <div key={item.id} className="card" style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{getProductDisplayName(product)}</div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  Need {outstanding.toLocaleString()} cases
                  {(item.declinedQty ?? 0) > 0 ? ` | Declined ${item.declinedQty.toLocaleString()}` : ''}
                </div>
              </div>
              <div className="cell-monospace">
                Assigned {assignedQty.toLocaleString()} / {outstanding.toLocaleString()}
              </div>
            </div>

            {availableBatches.length ? (
              <div className="table-scroll-wrapper">
              <table className="data-table" style={{ marginTop: 'var(--space-4)' }}>
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Production Date</th>
                    <th>Remaining</th>
                    <th>Assign Cases</th>
                  </tr>
                </thead>
                <tbody>
                  {availableBatches.map((batch) => (
                    <tr key={batch.id}>
                      <td className="cell-monospace cell-align-left">{batch.batchNumber}</td>
                      <td>{formatDate(batch.productionDate)}</td>
                      <td className="cell-monospace cell-align-left">{batch.qtyRemaining.toLocaleString()}</td>
                      <td>
                        <input
                          className="form-input"
                          style={{ width: 96 }}
                          type="number"
                          min="0"
                          step="0.01"
                          value={itemAssignments[batch.id] ?? ''}
                          onChange={(event) => updateAssignment(item.id, batch.id, event.target.value, outstanding)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            ) : (
              <div className="alert alert-warning" style={{ marginTop: 'var(--space-4)' }}>
                <AlertTriangle size={18} />
                <div className="alert-content">
                  <div className="alert-title">No inventory available</div>
                  <div className="alert-description">Log a production batch to fulfil this line item.</div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {canDecline ? (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div className="card-title">{totalOutstanding > 0 && order.items.some((item) => item.fulfilledQty > 0) ? 'Decline Remaining Balance' : 'Decline Instead'}</div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <textarea
              className="form-input"
              rows="3"
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value)}
              placeholder="Why is the order being declined?"
            />
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <button className="btn btn-secondary" type="button" onClick={declineOrder}>
              Decline Order
            </button>
          </div>
        </div>
      ) : null}

      {canCloseRemaining ? (
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <div className="card-title">Close Remaining / Decline Balance</div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
            Use this when you want to fulfil what is available now and permanently cancel the remaining outstanding quantity.
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <textarea
              className="form-input"
              rows="3"
              value={declineReason}
              onChange={(event) => setDeclineReason(event.target.value)}
              placeholder="Why is the remaining balance being declined?"
            />
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <button className="btn btn-secondary" type="button" onClick={closeRemainingBalance}>
              Close Remaining / Decline Balance
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <button className="btn btn-primary" type="button" onClick={confirmAssignments}>
          Save Lot Assignment
        </button>
        <button className="btn btn-ghost" type="button" onClick={onBack}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function InvoiceModal({ order, onClose }) {
  useModalBehavior(onClose);
  const { state, dispatch, addToast } = useApp();
  const location = state.locations.find((entry) => entry.id === order.locationId);
  const invoiceLines = order.items.filter((item) => item.fulfilledQty > 0);
  const [lineOverrides, setLineOverrides] = useState(() =>
    Object.fromEntries(
      invoiceLines.map((item) => [
        item.id,
        {
          price: String(item.overridePrice ?? item.clientPrice ?? item.basePrice),
          reason: item.overrideReason ?? '',
          discount: String(item.discountAmount ?? 0),
          discountReason: getItemDiscountReason(item),
        },
      ])
    )
  );

  async function saveInvoice() {
    try {
      const overrides = invoiceLines.map((item) => {
        const nextLine = lineOverrides[item.id];
        const nextPrice = Number(nextLine.price);
        const defaultPrice = item.clientPrice ?? item.basePrice;
        const hasOverride = Number(nextPrice.toFixed(2)) !== Number(defaultPrice.toFixed(2));
        const discountValue = Number(nextLine.discount);
        const nextDiscount = Number.isFinite(discountValue) && discountValue > 0 ? discountValue : 0;
        const nextDiscountReason = (nextLine.discountReason ?? '').trim();
        const lineSubtotal = item.fulfilledQty * nextPrice;

        if (hasOverride && !state.currentUser.permissions.overridePrices) {
          throw new Error('This user cannot override prices.');
        }

        if (hasOverride && !nextLine.reason.trim()) {
          throw new Error(`Provide an override reason for ${getProductDisplayName(getProduct(state.products, item.productId))}.`);
        }

        if (nextDiscount > lineSubtotal) {
          throw new Error(`Discount cannot exceed the line subtotal for ${getProductDisplayName(getProduct(state.products, item.productId))}.`);
        }

        if (nextDiscount > 0 && !nextDiscountReason) {
          throw new Error(`Provide a discount reason for ${getProductDisplayName(getProduct(state.products, item.productId))}.`);
        }

        return {
          orderItemId: item.id,
          overridePrice: hasOverride ? nextPrice : null,
          overrideReason: hasOverride ? nextLine.reason.trim() : null,
          discount: nextDiscount,
          discountReason: nextDiscount > 0 ? nextDiscountReason : null,
        };
      });

      const timestamp = new Date().toISOString();
      const invoiceNumber = `DRAFT-${order.orderNumber}`;
      const shipTo = getOrderShipToSnapshot(order, location);

      const result = await dispatch({
        type: 'CREATE_INVOICE',
        payload: {
          orderId: order.id,
          invoiceNumber,
          timestamp,
          overrides,
          shipTo,
          // Invoices are no longer emailed automatically — admins review and
          // dispatch them manually with the "Send Invoice" action.
          invoiceEmailSentAt: null,
        },
      });

      if (!result?.ok) return;

      addToast(`Invoice ${invoiceNumber} created. Review, then use Send Invoice to email it.`);
      onClose();
    } catch (error) {
      addToast(error.message, 'warning');
    }
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-invoice-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="create-invoice-title" className="modal-title">Create Invoice</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} aria-label="Close create invoice">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {invoiceLines.map((item) => {
            const product = getProduct(state.products, item.productId);
            const defaultPrice = item.clientPrice ?? item.basePrice;
            const lineValue = lineOverrides[item.id];
            const effectivePrice = Number(lineValue.price) || defaultPrice;
            const discountValue = Number(lineValue.discount);
            const lineDiscount = Number.isFinite(discountValue) && discountValue > 0 ? discountValue : 0;
            const lineSubtotal = item.fulfilledQty * effectivePrice;
            const lineTotal = Math.max(lineSubtotal - lineDiscount, 0);

            return (
              <div key={item.id} className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                    <ProductThumbnail product={product} />
                    <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{getProductDisplayName(product)}</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      Bill {item.fulfilledQty.toLocaleString()} cases
                    </div>
                    </div>
                  </div>
                  <div className="cell-monospace" style={{ textAlign: 'right' }}>
                    <div>{formatCurrency(lineTotal)}</div>
                    {lineDiscount > 0 ? (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        Subtotal {formatCurrency(lineSubtotal)} − Discount {formatCurrency(lineDiscount)}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid-2" style={{ marginTop: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Client Rate</label>
                    <input className="form-input" value={formatCurrency(defaultPrice)} disabled />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Invoice Price</label>
                    <input
                      className="form-input"
                      type="number"
                      step="0.01"
                      disabled={!state.currentUser.permissions.overridePrices}
                      value={lineValue.price}
                      onChange={(event) =>
                        setLineOverrides((current) => ({
                          ...current,
                          [item.id]: { ...current[item.id], price: event.target.value },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Discount (Flat $)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={lineValue.discount}
                    onChange={(event) =>
                      setLineOverrides((current) => ({
                        ...current,
                        [item.id]: { ...current[item.id], discount: event.target.value },
                      }))
                    }
                    placeholder="0.00"
                  />
                  <div style={{ marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    Subtracted from the line total before tax. Capped at the line subtotal.
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Discount Reason{lineDiscount > 0 ? ' *' : ''}</label>
                  <input
                    className="form-input"
                    value={lineValue.discountReason ?? ''}
                    onChange={(event) =>
                      setLineOverrides((current) => ({
                        ...current,
                        [item.id]: { ...current[item.id], discountReason: event.target.value },
                      }))
                    }
                    placeholder="Required when discount is greater than $0"
                  />
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Override Reason</label>
                  <input
                    className="form-input"
                    disabled={!state.currentUser.permissions.overridePrices}
                    value={lineValue.reason}
                    onChange={(event) =>
                      setLineOverrides((current) => ({
                        ...current,
                        [item.id]: { ...current[item.id], reason: event.target.value },
                      }))
                    }
                    placeholder="Required if invoice price differs from client rate"
                  />
                </div>
              </div>
            );
          })}
          {(() => {
            const summary = invoiceLines.reduce(
              (acc, item) => {
                const product = getProduct(state.products, item.productId);
                const lineValue = lineOverrides[item.id];
                const defaultPrice = item.clientPrice ?? item.basePrice;
                const effectivePrice = Number(lineValue.price) || defaultPrice;
                const discountValue = Number(lineValue.discount);
                const lineDiscount = Number.isFinite(discountValue) && discountValue > 0 ? discountValue : 0;
                const lineTotal = Math.max(item.fulfilledQty * effectivePrice - lineDiscount, 0);
                acc.subtotal += lineTotal;
                acc.hst += isProductHstApplicable(product) ? lineTotal * HST_RATE : 0;
                return acc;
              },
              { subtotal: 0, hst: 0 }
            );
            return (
              <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span>
                  <span className="cell-monospace">{formatCurrency(summary.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                  <span>HST (13%)</span>
                  <span className="cell-monospace">{formatCurrency(summary.hst)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
                  <span>Total</span>
                  <span className="cell-monospace">{formatCurrency(summary.subtotal + summary.hst)}</span>
                </div>
              </div>
            );
          })()}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={saveInvoice}>
            Create Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

function EditInvoiceModal({ order, onClose }) {
  useModalBehavior(onClose);
  const { state, dispatch, addToast } = useApp();
  const location = state.locations.find((entry) => entry.id === order.locationId);
  const invoiceLines = order.items.filter((item) => item.fulfilledQty > 0);
  const [revisionReason, setRevisionReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [shipToDraft, setShipToDraft] = useState(() => getOrderShipToSnapshot(order, location));
  const [lineDrafts, setLineDrafts] = useState(() =>
    Object.fromEntries(
      invoiceLines.map((item) => [
        item.id,
        {
          quantity: String(item.invoiceQty ?? item.fulfilledQty),
          price: String(item.overridePrice ?? item.clientPrice ?? item.basePrice),
          reason: item.overrideReason ?? '',
          discount: String(item.discountAmount ?? 0),
          discountReason: getItemDiscountReason(item),
        },
      ])
    )
  );

  async function saveInvoiceRevision() {
    try {
      if (isSaving) return;

      if (!revisionReason.trim()) {
        throw new Error('Provide a reason for editing this invoice.');
      }

      if (!state.currentUser.permissions.editInvoices) {
        throw new Error('This user cannot edit invoices.');
      }

      if (!shipToDraft.name.trim() || !shipToDraft.addressLine1.trim() || !shipToDraft.city.trim() || !shipToDraft.province.trim() || !shipToDraft.postalCode.trim()) {
        throw new Error('Complete the Ship To name, street, city, province, and postal code.');
      }

      const lines = invoiceLines.map((item) => {
        const draft = lineDrafts[item.id];
        const nextQuantity = Number(draft.quantity);
        const nextPrice = Number(draft.price);
        const defaultPrice = item.clientPrice ?? item.basePrice;
        const maxQuantity = Math.max(0, Number(item.fulfilledQty));
        const hasPriceOverride = Number(nextPrice.toFixed(2)) !== Number(defaultPrice.toFixed(2));
        const discountValue = Number(draft.discount);
        const nextDiscount = Number.isFinite(discountValue) && discountValue > 0 ? discountValue : 0;
        const nextDiscountReason = (draft.discountReason ?? '').trim();
        const lineSubtotal = nextQuantity * nextPrice;

        if (!Number.isFinite(nextQuantity) || nextQuantity < 0 || nextQuantity > maxQuantity) {
          throw new Error(`${getProductDisplayName(getProduct(state.products, item.productId))} quantity must be between 0 and ${maxQuantity}.`);
        }
        if (nextQuantity > 0 && !isValidCaseQuantityStep(nextQuantity)) {
          throw new Error(`${getProductDisplayName(getProduct(state.products, item.productId))} invoice quantity can use up to 2 decimal places.`);
        }

        if (!Number.isFinite(nextPrice) || nextPrice < 0) {
          throw new Error(`${getProductDisplayName(getProduct(state.products, item.productId))} price is invalid.`);
        }

        if (hasPriceOverride && !state.currentUser.permissions.overridePrices) {
          throw new Error('This user cannot override prices.');
        }

        if (hasPriceOverride && !draft.reason.trim()) {
          throw new Error(`Provide a price override reason for ${getProductDisplayName(getProduct(state.products, item.productId))}.`);
        }

        if (nextDiscount > lineSubtotal) {
          throw new Error(`Discount cannot exceed the line subtotal for ${getProductDisplayName(getProduct(state.products, item.productId))}.`);
        }

        if (nextDiscount > 0 && !nextDiscountReason) {
          throw new Error(`Provide a discount reason for ${getProductDisplayName(getProduct(state.products, item.productId))}.`);
        }

        return {
          orderItemId: item.id,
          invoiceQty: nextQuantity,
          overridePrice: hasPriceOverride ? nextPrice : null,
          overrideReason: hasPriceOverride ? draft.reason.trim() : null,
          discount: nextDiscount,
          discountReason: nextDiscount > 0 ? nextDiscountReason : null,
        };
      });

      if (!lines.some((line) => line.invoiceQty > 0)) {
        throw new Error('Invoice must keep at least one billed quantity.');
      }

      setIsSaving(true);
      const result = await dispatch({
        type: 'EDIT_INVOICE',
        payload: {
          orderId: order.id,
          lines,
          reason: revisionReason.trim(),
          shipTo: {
            name: shipToDraft.name.trim(),
            addressLine1: shipToDraft.addressLine1.trim(),
            addressLine2: shipToDraft.addressLine2.trim(),
            city: shipToDraft.city.trim(),
            province: shipToDraft.province.trim(),
            postalCode: shipToDraft.postalCode.trim(),
            country: shipToDraft.country.trim() || 'Canada',
          },
          timestamp: new Date().toISOString(),
        },
      });

      if (!result?.ok) return;

      addToast(`Invoice ${order.invoiceNumber} updated.`);
      onClose();
    } catch (error) {
      addToast(error.message, 'warning');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div className="modal modal-order" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Edit Invoice {order.invoiceNumber}</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="alert alert-info">
            <FileText size={18} />
            <div className="alert-content">
              <div className="alert-title">Editable invoice details</div>
              <div className="alert-description">
                Address changes stay on this invoice. Quantity reductions also update lot inventory and packing slips; if already synced, the next Web Connector run updates the same QuickBooks invoice.
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Revision Reason</label>
            <textarea
              className="form-input"
              rows="3"
              value={revisionReason}
              onChange={(event) => setRevisionReason(event.target.value)}
              placeholder="Example: customer changed quantity before pickup"
            />
          </div>

          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <div className="card-title">Ship To</div>
            <div className="grid-2" style={{ marginTop: 'var(--space-4)' }}>
              <FormTextInput label="Name" value={shipToDraft.name} onChange={(value) => setShipToDraft((current) => ({ ...current, name: value }))} />
              <FormTextInput label="Address Line 1" value={shipToDraft.addressLine1} onChange={(value) => setShipToDraft((current) => ({ ...current, addressLine1: value }))} />
              <FormTextInput label="Address Line 2" value={shipToDraft.addressLine2} onChange={(value) => setShipToDraft((current) => ({ ...current, addressLine2: value }))} />
              <FormTextInput label="City" value={shipToDraft.city} onChange={(value) => setShipToDraft((current) => ({ ...current, city: value }))} />
              <FormTextInput label="Province" value={shipToDraft.province} onChange={(value) => setShipToDraft((current) => ({ ...current, province: value }))} />
              <FormTextInput label="Postal Code" value={shipToDraft.postalCode} onChange={(value) => setShipToDraft((current) => ({ ...current, postalCode: value }))} />
              <FormTextInput label="Country" value={shipToDraft.country} onChange={(value) => setShipToDraft((current) => ({ ...current, country: value }))} />
            </div>
          </div>

          {invoiceLines.map((item) => {
            const product = getProduct(state.products, item.productId);
            const defaultPrice = item.clientPrice ?? item.basePrice;
            const draft = lineDrafts[item.id];
            const quantity = Number(draft.quantity) || 0;
            const draftPrice = Number(draft.price);
            const price = Number.isFinite(draftPrice) ? draftPrice : defaultPrice;
            const draftDiscount = Number(draft.discount);
            const lineDiscount = Number.isFinite(draftDiscount) && draftDiscount > 0 ? draftDiscount : 0;
            const lineSubtotal = quantity * price;
            const lineTotal = Math.max(lineSubtotal - lineDiscount, 0);
            const maxQuantity = Math.max(0, Number(item.fulfilledQty));

            return (
              <div key={item.id} className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                    <ProductThumbnail product={product} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{getProductDisplayName(product)}</div>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                        Fulfilled {item.fulfilledQty.toLocaleString()} cases | Max invoice qty {maxQuantity.toLocaleString()} cases
                      </div>
                    </div>
                  </div>
                  <div className="cell-monospace" style={{ textAlign: 'right' }}>
                    <div>{formatCurrency(lineTotal)}</div>
                    {lineDiscount > 0 ? (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        Subtotal {formatCurrency(lineSubtotal)} − Discount {formatCurrency(lineDiscount)}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid-2" style={{ marginTop: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Invoice Quantity (Cases)</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      max={maxQuantity}
                      step="0.01"
                      value={draft.quantity}
                      onChange={(event) =>
                        setLineDrafts((current) => ({
                          ...current,
                          [item.id]: { ...current[item.id], quantity: event.target.value },
                        }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Invoice Price</label>
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!state.currentUser.permissions.overridePrices}
                      value={draft.price}
                      onChange={(event) =>
                        setLineDrafts((current) => ({
                          ...current,
                          [item.id]: { ...current[item.id], price: event.target.value },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Discount (Flat $)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.discount}
                    onChange={(event) =>
                      setLineDrafts((current) => ({
                        ...current,
                        [item.id]: { ...current[item.id], discount: event.target.value },
                      }))
                    }
                    placeholder="0.00"
                  />
                  <div style={{ marginTop: 4, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    Subtracted from the line total. Capped at the line subtotal.
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Discount Reason{lineDiscount > 0 ? ' *' : ''}</label>
                  <input
                    className="form-input"
                    value={draft.discountReason ?? ''}
                    onChange={(event) =>
                      setLineDrafts((current) => ({
                        ...current,
                        [item.id]: { ...current[item.id], discountReason: event.target.value },
                      }))
                    }
                    placeholder="Required when discount is greater than $0"
                  />
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Price Override Reason</label>
                  <input
                    className="form-input"
                    disabled={!state.currentUser.permissions.overridePrices}
                    value={draft.reason}
                    onChange={(event) =>
                      setLineDrafts((current) => ({
                        ...current,
                        [item.id]: { ...current[item.id], reason: event.target.value },
                      }))
                    }
                    placeholder="Required only if invoice price differs from client rate"
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" disabled={isSaving} onClick={saveInvoiceRevision}>
            {isSaving ? 'Saving...' : 'Save Invoice Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddOrderModal({ onClose }) {
  const { state, dispatch, addToast, addAudit } = useApp();
  const activeProducts = useMemo(() => getActiveCatalogProducts(state.products), [state.products]);
  const [clientId, setClientId] = useState(state.clients[0]?.id ?? '');
  const [locationId, setLocationId] = useState(
    () => state.locations.find((location) => location.clientId === (state.clients[0]?.id ?? ''))?.id ?? ''
  );
  const [source, setSource] = useState('portal');
  // Skip Escape-close while a save is in flight so a stray keypress can't
  // dismiss the modal mid-save (overlay click is already gated by `saving`).
  // The `saving` ref is read below — we wire it after the state is declared.
  const [lines, setLines] = useState([{ id: 'line-1', productId: '', quantity: '' }]);
  const [saving, setSaving] = useState(false);
  useModalBehavior(onClose, { enabled: !saving });

  const locationOptions = state.locations.filter((location) => location.clientId === clientId);

  function selectClient(nextClientId) {
    const nextClient = state.clients.find((client) => client.id === nextClientId);
    const nextLocationId = state.locations.find((location) => location.clientId === nextClientId)?.id ?? '';
    setClientId(nextClient?.id ?? '');
    setLocationId(nextLocationId);
  }

  function addLine() {
    setLines((current) => [...current, { id: `line-${Date.now()}`, productId: '', quantity: '' }]);
  }

  function removeLine(lineId) {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.id !== lineId) : current));
  }

  async function saveOrder() {
    if (saving) return;
    if (!clientId || !locationId) {
      addToast('Select a client and location.', 'warning');
      return;
    }

    const validLines = lines.filter((line) => line.productId && Number(line.quantity) > 0);

    if (!validLines.length) {
      addToast('Add at least one product line.', 'warning');
      return;
    }

    const duplicateProductIds = new Set();
    for (const line of validLines) {
      if (!isValidCaseQuantityStep(line.quantity)) {
        addToast('Enter positive case quantities with up to 2 decimal places.', 'warning');
        return;
      }
      if (duplicateProductIds.has(line.productId)) {
        addToast('Combine duplicate products into a single line item.', 'warning');
        return;
      }
      duplicateProductIds.add(line.productId);
    }

    setSaving(true);
    const nextOrderNumber = Math.max(1049, ...state.orders.map((order) => Number(order.orderNumber) || 0)) + 1;
    const timestamp = new Date().toISOString();

    const items = validLines.map((line, index) => {
      const product = getProduct(state.products, line.productId);
      const basePrice = Number(product?.baseCataloguePrice ?? 0);
      const clientPrice = getClientPricingForProduct(
        state.clientPricing,
        clientId,
        line.productId,
        basePrice
      );

      return {
        id: `oi-${nextOrderNumber}-${index + 1}`,
        productId: line.productId,
        quantity: Number(line.quantity),
        fulfilledQty: 0,
        declinedQty: 0,
        basePrice,
        clientPrice,
        overridePrice: null,
        overrideReason: null,
        assignedBatches: [],
      };
    });

    const order = {
      id: `order-${Date.now()}`,
      orderNumber: nextOrderNumber,
      clientId,
      locationId,
      source,
      status: 'pending',
      lockedBy: null,
      lockedAt: null,
      invoiceNumber: null,
      invoiceTotal: null,
      qbInvoiceNumber: null,
      qbTxnId: null,
      qbEditSequence: null,
      qbSyncStatus: null,
      invoiceShipToName: null,
      invoiceAddressLine1: null,
      invoiceAddressLine2: null,
      invoiceCity: null,
      invoiceProvince: null,
      invoicePostalCode: null,
      invoiceCountry: null,
      packingSlipNumber: null,
      createdAt: timestamp,
      fulfilledAt: null,
      invoicedAt: null,
      qbSyncedAt: null,
      shippedAt: null,
      declinedAt: null,
      declineReason: null,
      packingSlipSentAt: null,
      invoiceEmailSentAt: null,
      items,
    };

    const result = await dispatch({ type: 'ADD_ORDER', payload: order });
    if (!result?.ok) {
      setSaving(false);
      return;
    }

    addAudit({
      action: 'order_received',
      orderId: order.id,
      clientId,
      details: `${source.toUpperCase()} order created for ${getClientName(state.clients, clientId)} ${getLocationName(state.locations, locationId)}`,
      newValue: `Order #${nextOrderNumber}`,
    });
    addToast(`Order #${nextOrderNumber} added.`);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={saving ? undefined : handleOverlayClick(onClose)}>
      <div className="modal modal-order" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Add Incoming Order</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Client</label>
              <SearchableSelect
                value={clientId}
                options={state.clients}
                placeholder="Search or select client"
                emptyMessage="No clients match this search."
                getOptionValue={(client) => client.id}
                getOptionLabel={(client) => client.name}
                getOptionMeta={(client) => `${client.locationCount ?? 0} loc`}
                onChange={selectClient}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Location</label>
              <select className="form-select form-select-no-caret" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                <option value="">Select location</option>
                {locationOptions.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!locationOptions.length ? (
            <div className="alert alert-warning">
              <AlertTriangle size={18} />
              <div className="alert-content">
                <div className="alert-title">No locations available for this client</div>
                <div className="alert-description">
                  Add a client location first before creating an incoming order.
                </div>
              </div>
            </div>
          ) : null}

          <div className="form-group">
            <label className="form-label">Source</label>
            <select className="form-select form-select-no-caret" value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="portal">Portal</option>
              <option value="edi">EDI</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {lines.map((line) => (
              <OrderLineEditor
                key={line.id}
                line={line}
                lines={lines}
                products={activeProducts}
                onUpdateLine={(nextLine) =>
                  setLines((current) => current.map((entry) => (entry.id === line.id ? { ...entry, ...nextLine } : entry)))
                }
                onRemoveLine={() => removeLine(line.id)}
              />
            ))}
          </div>

          <button className="add-line-item-btn" type="button" onClick={addLine}>
            <Plus size={16} /> Add Line Item
          </button>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className={`btn btn-primary${saving ? ' btn-loading' : ''}`} type="button" onClick={saveOrder} disabled={saving}>
            {saving ? 'Saving...' : 'Save Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkSelectAllCheckbox({ eligibleIds, selectedIds, onChange }) {
  const checkboxRef = useRef(null);
  const eligibleCount = eligibleIds.length;
  const selectedEligibleCount = eligibleIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = eligibleCount > 0 && selectedEligibleCount === eligibleCount;
  const someSelected = selectedEligibleCount > 0 && !allSelected;

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      disabled={eligibleCount === 0}
      checked={allSelected}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        const next = new Set(selectedIds);
        if (event.target.checked) {
          eligibleIds.forEach((id) => next.add(id));
        } else {
          eligibleIds.forEach((id) => next.delete(id));
        }
        onChange(next);
      }}
      aria-label={allSelected ? 'Deselect all eligible orders' : 'Select all eligible orders'}
      title={
        eligibleCount === 0
          ? 'No eligible shipped orders in the current view'
          : allSelected
            ? `Deselect ${eligibleCount} eligible order${eligibleCount === 1 ? '' : 's'}`
            : `Select ${eligibleCount} eligible order${eligibleCount === 1 ? '' : 's'}`
      }
    />
  );
}

function BulkAssignDriverModal({ orderIds, onClose, onAssigned }) {
  const { state, dispatch, addToast } = useApp();
  useModalBehavior(onClose);
  const drivers = state.users.filter((user) => user.role === 'driver' && !user.disabledAt);
  const selectedOrders = orderIds
    .map((id) => state.orders.find((order) => order.id === id))
    .filter(Boolean);
  const [driverUserId, setDriverUserId] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAssign() {
    if (saving) return;
    if (!driverUserId) {
      addToast('Select a driver before assigning.', 'warning');
      return;
    }
    setSaving(true);
    const result = await dispatch({
      type: 'BULK_ASSIGN_DRIVER',
      payload: { orderIds, driverUserId },
    });
    setSaving(false);
    if (!result?.ok) return;
    const driverName = drivers.find((driver) => driver.id === driverUserId)?.name ?? 'driver';
    addToast(`${driverName} assigned to ${orderIds.length} order${orderIds.length === 1 ? '' : 's'}.`);
    onAssigned();
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(saving ? () => {} : onClose)}>
      <div className="modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="bulk-assign-title">
        <div className="modal-header">
          <h3 id="bulk-assign-title" className="modal-title">Bulk Assign Driver</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving} aria-label="Close bulk assign">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 'var(--space-4)', color: 'var(--color-text-secondary)' }}>
            Assigning {selectedOrders.length} shipped order{selectedOrders.length === 1 ? '' : 's'} to a single driver. This replaces any existing assignment on each order.
          </div>

          <div className="form-group">
            <label className="form-label">Driver</label>
            <select
              className="form-select"
              value={driverUserId}
              onChange={(event) => setDriverUserId(event.target.value)}
              disabled={saving || drivers.length === 0}
            >
              <option value="">- Select driver -</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name}</option>
              ))}
            </select>
            {drivers.length === 0 ? (
              <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                No active drivers registered. Invite a driver from Settings → User Management.
              </div>
            ) : null}
          </div>

          <div className="card" style={{ padding: 'var(--space-3)', maxHeight: 240, overflowY: 'auto' }}>
            <div className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Selected orders</div>
            {selectedOrders.map((order) => (
              <div
                key={order.id}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', padding: '6px 0', borderBottom: '1px solid var(--color-border-light)' }}
              >
                <span style={{ fontWeight: 600 }}>#{order.orderNumber}</span>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  {getClientName(state.clients, order.clientId)} · {getLocationName(state.locations, order.locationId)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={handleAssign} disabled={saving || !driverUserId || drivers.length === 0}>
            {saving ? 'Assigning...' : `Assign to ${selectedOrders.length} order${selectedOrders.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderLineEditor({ line, lines, products, onUpdateLine, onRemoveLine }) {
  const selectedProduct = getProduct(products, line.productId);
  const quantityBreakdown = selectedProduct ? formatCaseQuantityBreakdown(selectedProduct, line.quantity) : '';
  return (
    <div className="order-line-editor">
      <div className="form-group order-line-product-field">
        <label className="form-label">Product</label>
        <div className="product-select-with-thumb">
          <ProductThumbnail product={selectedProduct} />
          <SearchableSelect
            value={line.productId}
            options={products}
            placeholder="Search or select product"
            emptyMessage="No products match this search."
            getOptionValue={(product) => product.id}
            getOptionLabel={getProductDisplayName}
            getOptionMeta={(product) =>
              [
                product.itemNumber ? `Item #${product.itemNumber}` : '',
                product.orderUnitLabel || product.packagingDetails || product.category || '',
              ].filter(Boolean).join(' - ')
            }
            getSearchText={(product) =>
              [
                product.name,
                product.unitSize,
                product.category,
                product.itemNumber,
                product.orderUnitLabel,
                product.packagingDetails,
                getProductDisplayName(product),
              ]
                .filter(Boolean)
                .join(' ')
            }
            onChange={(productId) => onUpdateLine({ productId })}
          />
        </div>
        {selectedProduct ? (
          <div className="order-line-selected-product" title={getProductDisplayName(selectedProduct)}>
            {getProductDisplayName(selectedProduct)}
          </div>
        ) : null}
      </div>

      <div className="form-group order-line-quantity-field">
        <label className="form-label">Case Quantity</label>
        <input
          className="form-input"
          type="number"
          min="0.01"
          step="0.01"
          value={line.quantity}
          onChange={(event) => onUpdateLine({ quantity: event.target.value })}
        />
        {quantityBreakdown ? <div className="form-hint">{quantityBreakdown}</div> : null}
      </div>
      <div className="order-line-remove-wrap">
        <button
          className="order-line-remove"
          type="button"
          disabled={lines.length === 1}
          onClick={onRemoveLine}
          aria-label="Remove line item"
          title="Remove line item"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

function SearchableSelect({
  value,
  options,
  placeholder,
  emptyMessage,
  getOptionValue,
  getOptionLabel,
  getOptionMeta,
  getSearchText,
  onChange,
}) {
  const selectedOption = options.find((option) => getOptionValue(option) === value);
  const selectedLabel = selectedOption ? getOptionLabel(selectedOption) : '';
  const [query, setQuery] = useState(selectedLabel);
  const [isOpen, setIsOpen] = useState(false);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const selectedQuery = selectedLabel.trim().toLowerCase();
    const showAll = !normalizedQuery || (selectedOption && normalizedQuery === selectedQuery);

    if (showAll) return options;

    return options.filter((option) => {
      const searchableText = (getSearchText ? getSearchText(option) : getOptionLabel(option)).toLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [getOptionLabel, getSearchText, options, query, selectedLabel, selectedOption]);
  function handleQueryChange(nextQuery) {
    setQuery(nextQuery);
    if (selectedOption && nextQuery !== selectedLabel) {
      onChange('');
    }
  }

  function selectOption(option) {
    const nextValue = getOptionValue(option);
    onChange(nextValue);
    setQuery(getOptionLabel(option));
    setIsOpen(false);
  }

  return (
    <div className="searchable-select">
      <input
        className="form-input searchable-select-input"
        value={query}
        placeholder={placeholder}
        onChange={(event) => handleQueryChange(event.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 150)}
      />
      {isOpen ? (
        <div className="searchable-select-menu">
          {filteredOptions.length ? (
            filteredOptions.map((option) => (
              <button
                key={getOptionValue(option)}
                className="searchable-select-option"
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectOption(option);
                }}
              >
                <span>{getOptionLabel(option)}</span>
                {getOptionMeta ? <span className="cell-monospace">{getOptionMeta(option)}</span> : null}
              </button>
            ))
          ) : (
            <div className="searchable-select-empty">{emptyMessage}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ProductThumbnail({ product }) {
  // When no product is selected, render a neutral package icon instead of
  // a stranded image — keeps the row visually balanced.
  if (!product) {
    return (
      <div className="product-thumb product-thumb-sm product-thumb-empty" title="Select a product">
        <Package size={18} />
      </div>
    );
  }

  const imageUrl = getProductImageUrl(product, { fallback: true });
  const usesFallback = !hasProductImage(product);

  return (
    <div
      className={`product-thumb product-thumb-sm ${usesFallback ? 'product-thumb-fallback' : ''}`}
      title={usesFallback ? 'No product image yet. Showing Modhani logo.' : getProductDisplayName(product)}
    >
      <img src={imageUrl} alt={usesFallback ? 'Modhani logo placeholder' : getProductDisplayName(product)} />
    </div>
  );
}
