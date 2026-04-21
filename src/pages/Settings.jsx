import { useState } from 'react';
import { useApp } from '../context/useApp';
import { getProductDisplayName, formatCurrency } from '../data/seedData';
import { ChevronDown, ChevronUp, Plus, X, Edit2, Package, DollarSign, Users, Link2, Mail } from 'lucide-react';

export default function Settings() {
  const { state, dispatch, addToast, addAudit } = useApp();
  const { clients, locations, products, clientPricing } = state;
  const [expandedSection, setExpandedSection] = useState('clients');
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingPricing, setEditingPricing] = useState(null);

  const toggle = (section) => setExpandedSection(expandedSection === section ? '' : section);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

      {/* Client Accounts & Locations */}
      <div className="card">
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => toggle('clients')}
        >
          <div className="card-title" style={{ marginBottom: 0 }}>Client Accounts & Locations</div>
          {expandedSection === 'clients' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>

        {expandedSection === 'clients' && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            {clients.map(client => {
              const clientLocs = locations.filter(l => l.clientId === client.id);
              const pricing = clientPricing.filter(cp => cp.clientId === client.id);
              const dahi500 = pricing.find(cp => cp.productId === 'prod-001');
              const brackets = dahi500?.volumeBrackets || [];
              return (
                <div key={client.id} className="settings-client-card">
                  <div className="settings-client-info">
                    <div className="settings-client-name">{client.name}</div>
                    <div className="settings-client-locations">
                      {client.locationCount >= 100 ? `~${client.locationCount} locations` : `${clientLocs.length} stores`}
                    </div>
                    <div className="settings-client-pricing">
                      <span>Dahi 500g Rate: <strong>{dahi500 ? formatCurrency(dahi500.price) : '—'}</strong> base</span>
                      <span>Brackets: {brackets.length > 0
                        ? brackets.map(b => `${b.minQty}+ @ ${formatCurrency(b.price)}`).join(', ')
                        : 'None'
                      }</span>
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditingPricing(client.id)}>
                    <Edit2 size={14} /> Edit
                  </button>
                </div>
              );
            })}
            <button className="btn btn-secondary" style={{ marginTop: 'var(--space-3)' }} onClick={() => setShowAddClient(true)}>
              <Plus size={16} /> Add Client Account
            </button>
          </div>
        )}
      </div>

      {/* Product Catalogue */}
      <div className="card">
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => toggle('products')}
        >
          <div className="card-title" style={{ marginBottom: 0 }}>
            <Package size={18} /> Product Catalogue
          </div>
          {expandedSection === 'products' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>

        {expandedSection === 'products' && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Unit Size</th>
                  <th>Category</th>
                  <th>Base Price</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>{p.unitSize}</td>
                    <td><span className="badge badge-pending">{p.category}</span></td>
                    <td className="cell-monospace">{formatCurrency(p.baseCataloguePrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn btn-secondary" style={{ marginTop: 'var(--space-4)' }} onClick={() => setShowAddProduct(true)}>
              <Plus size={16} /> Add Product
            </button>
          </div>
        )}
      </div>

      {/* Per-Client Pricing Matrix */}
      <div className="card">
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => toggle('pricing')}
        >
          <div className="card-title" style={{ marginBottom: 0 }}>
            <DollarSign size={18} /> Per-Client Pricing
          </div>
          {expandedSection === 'pricing' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>

        {expandedSection === 'pricing' && (
          <div style={{ marginTop: 'var(--space-5)', overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  {clients.map(c => <th key={c.id}>{c.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{getProductDisplayName(p)}</td>
                    {clients.map(c => {
                      const cp = clientPricing.find(x => x.clientId === c.id && x.productId === p.id);
                      return (
                        <td key={c.id} className="cell-monospace">
                          {cp ? formatCurrency(cp.price) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QuickBooks Connection */}
      <div className="card">
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => toggle('qb')}
        >
          <div className="card-title" style={{ marginBottom: 0 }}>
            <Link2 size={18} /> QuickBooks Connection
          </div>
          {expandedSection === 'qb' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
        {expandedSection === 'qb' && (
          <div style={{ marginTop: 'var(--space-5)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%', background: 'var(--color-success)',
              boxShadow: '0 0 6px var(--color-success)',
            }} />
            <div>
              <div style={{ fontWeight: 600 }}>QuickBooks Desktop — Connected</div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>Last sync: 2 mins ago • Company: Modhani Foods Inc.</div>
            </div>
          </div>
        )}
      </div>

      {/* Email Preferences */}
      <div className="card">
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => toggle('email')}
        >
          <div className="card-title" style={{ marginBottom: 0 }}>
            <Mail size={18} /> Email Preferences
          </div>
          {expandedSection === 'email' ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
        {expandedSection === 'email' && (
          <div style={{ marginTop: 'var(--space-5)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Packing Slip Email</th>
                  <th>Invoice Email</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{c.emailPackingSlip ? <span className="badge badge-shipped">Enabled</span> : <span className="badge badge-pending">Disabled</span>}</td>
                    <td>{c.emailInvoice ? <span className="badge badge-shipped">Enabled</span> : <span className="badge badge-pending">Disabled</span>}</td>
                    <td><span className="badge badge-invoiced">{c.deliveryMethod?.toUpperCase()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Client Modal */}
      {showAddClient && (
        <AddClientModal
          dispatch={dispatch}
          addToast={addToast}
          addAudit={addAudit}
          onClose={() => setShowAddClient(false)}
        />
      )}

      {/* Add Product Modal */}
      {showAddProduct && (
        <AddProductModal
          dispatch={dispatch}
          addToast={addToast}
          onClose={() => setShowAddProduct(false)}
        />
      )}

      {/* Edit Pricing Modal */}
      {editingPricing && (
        <EditPricingModal
          clientId={editingPricing}
          clients={clients}
          products={products}
          clientPricing={clientPricing}
          dispatch={dispatch}
          addToast={addToast}
          addAudit={addAudit}
          onClose={() => setEditingPricing(null)}
        />
      )}
    </div>
  );
}

function AddClientModal({ dispatch, addToast, addAudit, onClose }) {
  const [name, setName] = useState('');
  const [locationCount, setLocationCount] = useState('');
  const handleSubmit = () => {
    if (!name.trim()) { addToast('Enter client name', 'warning'); return; }
    const id = `client-${Date.now()}`;
    dispatch({
      type: 'ADD_CLIENT',
      payload: { id, name: name.trim(), locationCount: parseInt(locationCount) || 1, emailPackingSlip: true, emailInvoice: true, deliveryMethod: 'email' },
    });
    addAudit('client_added', null, `Client "${name.trim()}" added`, null, name.trim());
    addToast(`Client "${name.trim()}" added`);
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Add Client Account</h3>
          <button className="btn btn-ghost" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Client Name</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Metro" /></div>
          <div className="form-group"><label className="form-label">Number of Locations</label><input className="form-input" type="number" value={locationCount} onChange={e => setLocationCount(e.target.value)} placeholder="e.g., 50" min="1" /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit}>Add Client</button>
        </div>
      </div>
    </div>
  );
}

function AddProductModal({ dispatch, addToast, onClose }) {
  const [name, setName] = useState('');
  const [unitSize, setUnitSize] = useState('');
  const [category, setCategory] = useState('');
  const [basePrice, setBasePrice] = useState('');
  const handleSubmit = () => {
    if (!name.trim() || !unitSize.trim()) { addToast('Fill in all fields', 'warning'); return; }
    dispatch({
      type: 'ADD_PRODUCT',
      payload: { id: `prod-${Date.now()}`, name: name.trim(), unitSize: unitSize.trim(), category: category.trim() || 'General', baseCataloguePrice: parseFloat(basePrice) || 0 },
    });
    addToast(`Product "${name.trim()} ${unitSize.trim()}" added`);
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Add Product</h3>
          <button className="btn btn-ghost" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group"><label className="form-label">Product Name</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Lassi" /></div>
          <div className="form-group"><label className="form-label">Unit Size</label><input className="form-input" value={unitSize} onChange={e => setUnitSize(e.target.value)} placeholder="e.g., 500g, 1L" /></div>
          <div className="form-group"><label className="form-label">Category</label><input className="form-input" value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g., Yogurt, Lassi" /></div>
          <div className="form-group"><label className="form-label">Base Catalogue Price ($)</label><input className="form-input" type="number" step="0.01" value={basePrice} onChange={e => setBasePrice(e.target.value)} placeholder="e.g., 5.50" /></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit}>Add Product</button>
        </div>
      </div>
    </div>
  );
}

function EditPricingModal({ clientId, clients, products, clientPricing, dispatch, addToast, addAudit, onClose }) {
  const client = clients.find(c => c.id === clientId);
  const [prices, setPrices] = useState(() => {
    const p = {};
    products.forEach(prod => {
      const existing = clientPricing.find(cp => cp.clientId === clientId && cp.productId === prod.id);
      p[prod.id] = existing ? String(existing.price) : '';
    });
    return p;
  });

  const handleSave = () => {
    Object.entries(prices).forEach(([productId, price]) => {
      if (price && parseFloat(price) > 0) {
        dispatch({
          type: 'SET_CLIENT_PRICING',
          payload: { id: `cp-${Date.now()}-${productId}`, clientId, productId, price: parseFloat(price), volumeBrackets: [] },
        });
      }
    });
    addAudit('pricing_updated', null, `Pricing updated for ${client?.name}`, null, 'Updated');
    addToast(`Pricing updated for ${client?.name}`);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Edit Pricing — {client?.name}</h3>
          <button className="btn btn-ghost" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          {products.map(p => (
            <div key={p.id} className="form-group">
              <label className="form-label">{getProductDisplayName(p)}</label>
              <input
                className="form-input"
                type="number"
                step="0.01"
                value={prices[p.id]}
                onChange={e => setPrices(prev => ({ ...prev, [p.id]: e.target.value }))}
                placeholder={`Base: ${formatCurrency(p.baseCataloguePrice)}`}
              />
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Pricing</button>
        </div>
      </div>
    </div>
  );
}
