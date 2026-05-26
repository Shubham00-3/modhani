import { useMemo, useState } from 'react';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/useApp';
import { useModalBehavior, handleOverlayClick } from '../hooks/useModalBehavior';
import {
  MAX_TIERS,
  formatCurrency,
  getActiveCatalogProducts,
  getClientDisplayName,
  getProductDisplayName,
  getProductImageUrl,
  hasProductImage,
} from '../data/phaseOneData';

export default function PhaseOneTiers() {
  const { state } = useApp();
  const canManage = state.currentUser.permissions.manageSettings;
  const tiers = useMemo(() => state.tiers ?? [], [state.tiers]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingTierId, setEditingTierId] = useState(null);
  const [assigningTierId, setAssigningTierId] = useState(null);
  const [confirmDeleteTierId, setConfirmDeleteTierId] = useState(null);
  const [expandedTierIds, setExpandedTierIds] = useState(() => new Set());
  const [tierSearch, setTierSearch] = useState('');

  const editingTier = tiers.find((tier) => tier.id === editingTierId) ?? null;
  const assigningTier = tiers.find((tier) => tier.id === assigningTierId) ?? null;
  const confirmDeleteTier = tiers.find((tier) => tier.id === confirmDeleteTierId) ?? null;

  const filteredTiers = useMemo(() => {
    const query = tierSearch.trim().toLowerCase();
    if (!query) return tiers;
    return tiers.filter((tier) => tier.name.toLowerCase().includes(query));
  }, [tiers, tierSearch]);

  const atCap = tiers.length >= MAX_TIERS;

  function toggleTier(tierId) {
    setExpandedTierIds((current) => {
      const next = new Set(current);
      if (next.has(tierId)) next.delete(tierId);
      else next.add(tierId);
      return next;
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tiers</h1>
          <p className="page-subtitle">
            Build named price tiers (e.g., Freshco) by picking products and prices, then assign tiers to clients.
            Customers only see products from their assigned tier.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={!canManage || atCap}
          title={atCap ? `Maximum of ${MAX_TIERS} tiers reached. Delete one first.` : undefined}
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={16} /> Add Tier
        </button>
      </div>

      {!canManage ? (
        <div className="alert alert-warning">
          <Settings2 size={18} />
          <div className="alert-content">
            <div className="alert-title">Read-only tier management</div>
            <div className="alert-description">
              This user can view tiers, but only settings admins can create, edit, or assign them.
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="client-directory-header">
          <div>
            <div className="card-title">
              <Layers size={18} /> Price Tiers
            </div>
            <div className="client-directory-count">
              Showing {filteredTiers.length.toLocaleString()} of {tiers.length.toLocaleString()} tiers · Max {MAX_TIERS}
            </div>
          </div>
          <label className="client-directory-search">
            <Search size={16} />
            <input
              type="search"
              value={tierSearch}
              onChange={(event) => setTierSearch(event.target.value)}
              placeholder="Search tiers..."
            />
          </label>
        </div>

        {filteredTiers.length ? (
          <div className="client-accordion">
            {filteredTiers.map((tier) => {
              const assignedClients = state.clients.filter((client) => client.tierId === tier.id);
              const open = expandedTierIds.has(tier.id);

              return (
                <div key={tier.id} className={`client-accordion-card ${open ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="client-accordion-header"
                    onClick={() => toggleTier(tier.id)}
                    aria-expanded={open}
                  >
                    <div className="client-accordion-title-wrap">
                      <div className="client-accordion-title">{tier.name}</div>
                    </div>
                    <div className="client-accordion-summary">
                      <span className="client-accordion-pill">
                        <Layers size={13} />
                        {tier.products.length} {tier.products.length === 1 ? 'product' : 'products'}
                      </span>
                      <span className="client-accordion-pill">
                        <Building2 size={13} />
                        {assignedClients.length} {assignedClients.length === 1 ? 'client' : 'clients'}
                      </span>
                      <span className="client-accordion-chev">
                        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </span>
                    </div>
                  </button>

                  {open ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-6)',
                        padding: 'var(--space-5) var(--space-6) var(--space-6)',
                      }}
                    >
                      <TierProductsSection
                        tier={tier}
                        products={state.products}
                        canManage={canManage}
                        onEdit={() => setEditingTierId(tier.id)}
                      />

                      <TierAssignedClientsSection
                        assignedClients={assignedClients}
                        canManage={canManage}
                        onEdit={() => setAssigningTierId(tier.id)}
                      />

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          paddingTop: 'var(--space-4)',
                          borderTop: '1px solid var(--color-border, #e5e7eb)',
                        }}
                      >
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          disabled={!canManage}
                          onClick={() => setConfirmDeleteTierId(tier.id)}
                          style={{ color: 'var(--color-danger, #c83030)' }}
                        >
                          <Trash2 size={14} /> Delete tier
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">
              {tiers.length ? 'No tiers match that search' : 'No tiers configured yet'}
            </div>
            <div className="empty-state-description">
              {tiers.length
                ? 'Clear the search to see all tiers.'
                : 'Create your first tier to start curating client-specific product lists.'}
            </div>
          </div>
        )}
      </div>

      {showCreateModal || editingTier ? (
        <TierEditorModal
          tier={editingTier}
          onClose={() => {
            setShowCreateModal(false);
            setEditingTierId(null);
          }}
        />
      ) : null}

      {assigningTier ? (
        <TierClientPickerModal
          tier={assigningTier}
          onClose={() => setAssigningTierId(null)}
        />
      ) : null}

      {confirmDeleteTier ? (
        <ConfirmDeleteTierModal
          tier={confirmDeleteTier}
          onClose={() => setConfirmDeleteTierId(null)}
        />
      ) : null}
    </div>
  );
}

function TierProductsSection({ tier, products, canManage, onEdit }) {
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const rows = useMemo(
    () =>
      tier.products
        .map((entry) => ({
          entry,
          product: productsById.get(entry.productId),
        }))
        .sort((left, right) => {
          const leftName = left.product ? getProductDisplayName(left.product) : left.entry.productId;
          const rightName = right.product ? getProductDisplayName(right.product) : right.entry.productId;
          return leftName.localeCompare(rightName);
        }),
    [tier.products, productsById]
  );

  return (
    <section>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-3)',
        }}
      >
        <h4 style={{ margin: 0, fontSize: 'var(--font-size-md, 15px)', fontWeight: 600 }}>
          Products{' '}
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>
            ({tier.products.length})
          </span>
        </h4>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          disabled={!canManage}
          onClick={onEdit}
        >
          <Pencil size={14} /> {tier.products.length === 0 ? 'Add products' : 'Edit products & price'}
        </button>
      </header>

      {tier.products.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-5) var(--space-4)',
            background: 'var(--color-surface-muted, #f6f7f6)',
            borderRadius: 'var(--radius-md, 8px)',
            color: 'var(--color-text-muted)',
            textAlign: 'center',
          }}
        >
          No products in this tier yet. Click <strong>Add products</strong> to pick the items and prices customers should see.
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--color-border, #e5e7eb)',
            borderRadius: 'var(--radius-md, 8px)',
            overflow: 'hidden',
            background: 'var(--color-surface, #fff)',
          }}
        >
          <table className="data-table" style={{ margin: 0, width: '100%' }}>
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ width: '30%' }}>Category</th>
                <th className="cell-align-right" style={{ width: 140 }}>
                  Tier price
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, product }) => (
                <tr key={entry.productId}>
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {product ? getProductDisplayName(product) : entry.productId}
                    </div>
                    {product?.itemNumber ? (
                      <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                        Item {product.itemNumber}
                      </div>
                    ) : null}
                  </td>
                  <td>{product?.category || '—'}</td>
                  <td className="cell-monospace cell-align-right" style={{ fontWeight: 600 }}>
                    {formatCurrency(entry.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TierAssignedClientsSection({ assignedClients, canManage, onEdit }) {
  return (
    <section>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-3)',
        }}
      >
        <h4 style={{ margin: 0, fontSize: 'var(--font-size-md, 15px)', fontWeight: 600 }}>
          Assigned clients{' '}
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>
            ({assignedClients.length})
          </span>
        </h4>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          disabled={!canManage}
          onClick={onEdit}
        >
          <Pencil size={14} /> {assignedClients.length === 0 ? 'Assign clients' : 'Edit assigned clients'}
        </button>
      </header>

      {assignedClients.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-5) var(--space-4)',
            background: 'var(--color-surface-muted, #f6f7f6)',
            borderRadius: 'var(--radius-md, 8px)',
            color: 'var(--color-text-muted)',
            textAlign: 'center',
          }}
        >
          No clients assigned. Click <strong>Assign clients</strong> to pick the companies that should use this tier.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
          }}
        >
          {assignedClients.map((client) => (
            <span
              key={client.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--color-surface-muted, #f6f7f6)',
                border: '1px solid var(--color-border, #e5e7eb)',
                borderRadius: 'var(--radius-pill, 999px)',
                fontSize: 'var(--font-size-sm, 13px)',
                fontWeight: 500,
              }}
            >
              <Building2 size={14} /> {getClientDisplayName(client)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Create / edit tier modal. Name + product-with-price picker in one save.
 */
function TierEditorModal({ tier, onClose }) {
  const { state, dispatch, addToast } = useApp();
  const [name, setName] = useState(tier?.name ?? '');
  const [productSearch, setProductSearch] = useState('');
  const [productPrices, setProductPrices] = useState(() => {
    const seed = new Map();
    (tier?.products ?? []).forEach((entry) => seed.set(entry.productId, String(entry.price ?? '')));
    return seed;
  });

  const activeProducts = useMemo(() => getActiveCatalogProducts(state.products), [state.products]);
  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return activeProducts;
    return activeProducts.filter((product) =>
      [getProductDisplayName(product), product.category, product.itemNumber]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [activeProducts, productSearch]);

  function toggleProduct(product) {
    setProductPrices((current) => {
      const next = new Map(current);
      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.set(product.id, String(product.baseCataloguePrice ?? 0));
      }
      return next;
    });
  }

  function setProductPrice(productId, value) {
    setProductPrices((current) => {
      const next = new Map(current);
      next.set(productId, value);
      return next;
    });
  }

  return (
    <SimpleModal
      title={tier ? `Edit Tier — ${tier.name}` : 'Add Tier'}
      onClose={onClose}
      onSave={async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
          addToast('Enter a tier name.', 'warning');
          return false;
        }

        // Enforce max-15 cap on the client too so the toast fires before the RPC.
        if (!tier && (state.tiers?.length ?? 0) >= MAX_TIERS) {
          addToast(`Maximum of ${MAX_TIERS} tiers reached.`, 'warning');
          return false;
        }

        const duplicate = (state.tiers ?? []).find(
          (entry) => entry.id !== tier?.id && entry.name.trim().toLowerCase() === trimmedName.toLowerCase()
        );
        if (duplicate) {
          addToast('A tier with that name already exists.', 'warning');
          return false;
        }

        const entries = Array.from(productPrices.entries());
        for (const [, rawPrice] of entries) {
          const numeric = Number(rawPrice);
          if (!Number.isFinite(numeric) || numeric < 0) {
            addToast('Every selected product needs a price of zero or greater.', 'warning');
            return false;
          }
        }

        const result = await dispatch({
          type: 'UPSERT_TIER',
          payload: {
            id: tier?.id ?? `tier-${Date.now()}`,
            name: trimmedName,
            products: entries.map(([productId, rawPrice]) => ({
              productId,
              price: Number(rawPrice) || 0,
            })),
          },
        });

        if (result.ok) onClose();
        return result.ok;
      }}
    >
      <div className="form-group">
        <label className="form-label">Tier Name</label>
        <input
          className="form-input"
          type="text"
          value={name}
          placeholder="e.g. Freshco"
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <label className="pricing-product-search" style={{ flex: 1 }}>
          <Search size={16} />
          <input
            type="search"
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            placeholder="Search products..."
          />
        </label>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm, 13px)', whiteSpace: 'nowrap' }}>
          {productPrices.size} selected
        </span>
      </div>

      <div className="pricing-product-list">
        {filteredProducts.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
            <div className="empty-state-title">No products match that search</div>
            <div className="empty-state-description">
              Add products in the Products page, or clear the search.
            </div>
          </div>
        ) : (
          filteredProducts.map((product) => {
            const checked = productPrices.has(product.id);
            const imageUrl = getProductImageUrl(product, { fallback: true });
            const usesFallback = !hasProductImage(product);

            return (
              <label key={product.id} className={`pricing-product-row ${checked ? 'is-enabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleProduct(product)}
                />
                <span className={`product-thumb product-thumb-sm ${usesFallback ? 'product-thumb-fallback' : ''}`}>
                  <img src={imageUrl} alt={usesFallback ? 'Modhani logo placeholder' : getProductDisplayName(product)} />
                </span>
                <span className="pricing-product-main">
                  <strong>{getProductDisplayName(product)}</strong>
                  <span className="pricing-product-meta">
                    {[product.category, product.itemNumber ? `Item ${product.itemNumber}` : '', product.packagingDetails]
                      .filter(Boolean)
                      .join(' · ') || 'Catalogue item'}
                  </span>
                </span>
                <span
                  className="pricing-product-price"
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
                >
                  {checked ? (
                    <>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>$</span>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        step="0.01"
                        style={{ width: 110, textAlign: 'right', fontWeight: 600 }}
                        value={productPrices.get(product.id) ?? ''}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setProductPrice(product.id, event.target.value)}
                      />
                    </>
                  ) : (
                    <span
                      className="cell-monospace"
                      style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm, 13px)' }}
                      title="Base catalogue price (used as default when you check this row)"
                    >
                      {formatCurrency(product.baseCataloguePrice)}
                    </span>
                  )}
                </span>
              </label>
            );
          })
        )}
      </div>
    </SimpleModal>
  );
}

/**
 * Multi-select clients to assign to this tier. Shows which other tier each
 * client is currently on, so admins know about implicit moves.
 */
function TierClientPickerModal({ tier, onClose }) {
  const { state, dispatch, addToast } = useApp();
  const [clientSearch, setClientSearch] = useState('');
  const [memberIds, setMemberIds] = useState(
    () => new Set(state.clients.filter((client) => client.tierId === tier.id).map((client) => client.id))
  );
  const tiersById = useMemo(() => new Map(state.tiers.map((entry) => [entry.id, entry])), [state.tiers]);

  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return state.clients;
    return state.clients.filter((client) =>
      [client.name, client.operatingAs].filter(Boolean).join(' ').toLowerCase().includes(query)
    );
  }, [state.clients, clientSearch]);

  function toggleClient(clientId) {
    setMemberIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  return (
    <SimpleModal
      title={`Assign clients to "${tier.name}"`}
      onClose={onClose}
      onSave={async () => {
        const result = await dispatch({
          type: 'SET_TIER_CLIENT_MEMBERSHIP',
          payload: {
            tierId: tier.id,
            clientIds: Array.from(memberIds),
          },
        });
        if (result.ok) {
          addToast(`Updated client assignments for "${tier.name}".`);
          onClose();
        }
        return result.ok;
      }}
    >
      <label className="pricing-product-search">
        <Search size={16} />
        <input
          type="search"
          value={clientSearch}
          onChange={(event) => setClientSearch(event.target.value)}
          placeholder="Search clients..."
        />
      </label>

      <div className="pricing-product-list">
        {filteredClients.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-6)' }}>
            <div className="empty-state-title">No clients match that search</div>
          </div>
        ) : (
          filteredClients.map((client) => {
            const checked = memberIds.has(client.id);
            const otherTier =
              client.tierId && client.tierId !== tier.id ? tiersById.get(client.tierId) : null;
            return (
              <label key={client.id} className={`pricing-product-row ${checked ? 'is-enabled' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => toggleClient(client.id)} />
                <span className="pricing-product-main">
                  <strong>{getClientDisplayName(client)}</strong>
                  <span className="pricing-product-meta">
                    {otherTier
                      ? `Currently on tier "${otherTier.name}" — checking this will move it`
                      : client.tierId === tier.id
                        ? `Currently on this tier`
                        : 'No tier assigned'}
                  </span>
                </span>
                <span className="pricing-product-price">
                  {checked ? <Check size={16} /> : null}
                </span>
              </label>
            );
          })
        )}
      </div>
    </SimpleModal>
  );
}

function ConfirmDeleteTierModal({ tier, onClose }) {
  const { state, dispatch, addToast } = useApp();
  const assignedCount = state.clients.filter((client) => client.tierId === tier.id).length;

  return (
    <SimpleModal
      title={`Delete tier "${tier.name}"?`}
      onClose={onClose}
      saveLabel="Delete tier"
      saveVariant="danger"
      onSave={async () => {
        const result = await dispatch({
          type: 'DELETE_TIER',
          payload: { tierId: tier.id },
        });
        if (result.ok) {
          addToast(`Deleted tier "${tier.name}".`);
          onClose();
        }
        return result.ok;
      }}
    >
      <p style={{ marginTop: 0 }}>
        This will remove the tier and unassign{' '}
        <strong>
          {assignedCount} client{assignedCount === 1 ? '' : 's'}
        </strong>
        . Those clients' customer portals will show no products until you assign a new tier.
      </p>
      <p>The tier's product list ({tier.products.length} item{tier.products.length === 1 ? '' : 's'}) will be discarded.</p>
    </SimpleModal>
  );
}

/**
 * Lightweight modal scaffold to keep this page self-contained.
 * Mirrors the SimpleModal in ManagementModals.jsx so styling stays consistent.
 */
function SimpleModal({ title, children, onClose, onSave, saveLabel = 'Save', saveVariant = 'primary' }) {
  const [saving, setSaving] = useState(false);
  useModalBehavior(onClose, { enabled: !saving });

  return (
    <div className="modal-overlay" onClick={saving ? undefined : handleOverlayClick(onClose)}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className={`btn ${saveVariant === 'danger' ? 'btn-danger' : 'btn-primary'}${saving ? ' btn-loading' : ''}`}
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave();
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving...' : saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
