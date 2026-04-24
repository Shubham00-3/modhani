import { useState } from 'react';
import { Package, Plus, Settings2 } from 'lucide-react';
import { useApp } from '../context/useApp';
import { formatCurrency, getProductDisplayName } from '../data/phaseOneData';
import { ProductModal } from '../components/settings/ManagementModals';

export default function PhaseOneProducts() {
  const { state } = useApp();
  const canManage = state.currentUser.permissions.manageSettings;
  const [editingProduct, setEditingProduct] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Products</h1>
          <p className="page-subtitle">
            Maintain the master catalogue for production, pricing, and ordering.
          </p>
        </div>
        <button className="btn btn-primary" type="button" disabled={!canManage} onClick={() => setShowProductModal(true)}>
          <Plus size={16} /> Add Product
        </button>
      </div>

      {!canManage ? (
        <div className="alert alert-warning">
          <Settings2 size={18} />
          <div className="alert-content">
            <div className="alert-title">Read-only catalogue</div>
            <div className="alert-description">
              Only settings admins can change the master product catalogue.
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-title">
          <Package size={18} /> Product Catalogue
        </div>
        {state.products.length ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>QuickBooks Item</th>
                <th>Base Catalogue Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.products.map((product) => (
                <tr key={product.id}>
                  <td style={{ fontWeight: 600 }}>{getProductDisplayName(product)}</td>
                  <td>{product.category || '-'}</td>
                  <td>{product.qbItemName || getProductDisplayName(product)}</td>
                  <td className="cell-monospace">{formatCurrency(product.baseCataloguePrice)}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" type="button" disabled={!canManage} onClick={() => setEditingProduct(product)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">No products yet</div>
            <div className="empty-state-description">
              Add products to make ordering, pricing, and production available across the app.
            </div>
          </div>
        )}
      </div>

      {showProductModal || editingProduct ? (
        <ProductModal
          product={editingProduct}
          onClose={() => {
            setShowProductModal(false);
            setEditingProduct(null);
          }}
        />
      ) : null}
    </div>
  );
}
