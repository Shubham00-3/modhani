import { createElement, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  FlaskConical,
  GitBranch,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../context/useApp';
import { ProductModal } from '../components/settings/ManagementModals';
import { useModalBehavior, handleOverlayClick } from '../hooks/useModalBehavior';
import { formatDate, getProduct, getProductDisplayName } from '../data/phaseOneData';
import { ALL_FACILITIES, FACILITIES, getFacilityName, resolveFacilityId } from '../lib/facilities';

const MATERIAL_TYPES = [
  { value: 'raw', label: 'Raw material' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'consumable', label: 'Consumable' },
];
const MATERIAL_UNITS = ['kg', 'L', 'each', 'lb', 'ft', 'Pail'];
const EXPIRY_WARN_DAYS = 14;

const TABS = [
  { id: 'stock', label: 'Stock', icon: Boxes },
  { id: 'receiving', label: 'Receiving', icon: PackagePlus },
  { id: 'raw-milk', label: 'Raw Milk QA', icon: FlaskConical },
  { id: 'traceability', label: 'Traceability', icon: GitBranch },
  { id: 'recipes', label: 'Recipes', icon: ClipboardList },
];

function getMaterialTypeLabel(type) {
  return MATERIAL_TYPES.find((t) => t.value === type)?.label ?? type;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target - today) / 86400000);
}

function isRawMilkMaterial(material) {
  const haystack = `${material?.id ?? ''} ${material?.name ?? ''}`.toLowerCase();
  return material?.type === 'raw' && haystack.includes('milk');
}

function includesText(values, query) {
  if (!query) return true;
  const haystack = values.filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function formatQty(value, unit = '') {
  const number = Number(value ?? 0);
  return `${number.toLocaleString(undefined, { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ''}`;
}

function EmptyState({ icon = Boxes, title, description }) {
  return (
    <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
      {createElement(icon, { size: 32 })}
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-description">{description}</div>
    </div>
  );
}

export default function PhaseOneMaterials() {
  const { state, dispatch, addToast } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFacility = state.selectedFacility ?? ALL_FACILITIES;
  const showAllFacilities = selectedFacility === ALL_FACILITIES;
  const canManageCatalog = Boolean(state.currentUser?.permissions?.manageSettings);

  const materials = useMemo(() => state.materials ?? [], [state.materials]);
  const materialLots = useMemo(() => state.materialLots ?? [], [state.materialLots]);
  const consumptions = useMemo(() => state.materialConsumptions ?? [], [state.materialConsumptions]);
  const rawMilkRecords = useMemo(() => state.rawMilkReceivingRecords ?? [], [state.rawMilkReceivingRecords]);
  const shortfalls = useMemo(() => state.materialShortfalls ?? [], [state.materialShortfalls]);

  const traceBatchParam = searchParams.get('traceBatch');
  const traceLotParam = searchParams.get('traceLot');
  const initialTab = TABS.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') : 'stock';
  const [activeTab, setActiveTab] = useState(initialTab);
  const currentTab = traceBatchParam || traceLotParam ? 'traceability' : activeTab;
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [recipeProduct, setRecipeProduct] = useState(null);
  const [trashingLot, setTrashingLot] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [traceMode, setTraceMode] = useState(searchParams.get('traceLot') ? 'lot' : 'batch');
  const [traceQuery, setTraceQuery] = useState(searchParams.get('traceBatch') ?? searchParams.get('traceLot') ?? '');

  const rawMilkRecordByLotId = useMemo(
    () => Object.fromEntries(rawMilkRecords.map((record) => [record.materialLotId, record])),
    [rawMilkRecords]
  );
  const materialById = useMemo(() => Object.fromEntries(materials.map((material) => [material.id, material])), [materials]);
  const lotById = useMemo(() => Object.fromEntries(materialLots.map((lot) => [lot.id, lot])), [materialLots]);
  const batchById = useMemo(() => Object.fromEntries(state.batches.map((batch) => [batch.id, batch])), [state.batches]);

  function setTab(tabId) {
    setActiveTab(tabId);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tabId);
    if (tabId !== 'traceability') {
      next.delete('traceBatch');
      next.delete('traceLot');
    }
    setSearchParams(next, { replace: true });
  }

  function openLotTrace(lot) {
    setTraceMode('lot');
    setTraceQuery(lot.supplierLotCode);
    setActiveTab('traceability');
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'traceability');
    next.set('traceLot', lot.supplierLotCode);
    next.delete('traceBatch');
    setSearchParams(next, { replace: true });
  }

  const materialRows = useMemo(() => {
    return materials
      .map((material) => {
        const lots = materialLots.filter(
          (lot) =>
            lot.materialId === material.id &&
            !lot.deletedAt &&
            (showAllFacilities || resolveFacilityId(lot.facilityId) === selectedFacility)
        );
        const activeLots = lots.filter((lot) => lot.status === 'active' && Number(lot.qtyRemaining) > 0);
        const onHand = lots.reduce((sum, lot) => sum + Number(lot.qtyRemaining ?? 0), 0);
        const isLow = material.lowStockThreshold != null && onHand <= Number(material.lowStockThreshold);
        const nextExpiry = lots
          .filter((lot) => lot.expiryDate)
          .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))[0]?.expiryDate ?? null;
        return { material, lots, activeLots, onHand, isLow, nextExpiry };
      })
      .filter(({ material, onHand, activeLots, isLow, nextExpiry }) => {
        if (typeFilter && material.type !== typeFilter) return false;
        if (stockFilter === 'low' && !isLow) return false;
        if (stockFilter === 'in-stock' && onHand <= 0) return false;
        if (stockFilter === 'out' && onHand > 0) return false;
        if (stockFilter === 'expiry' && daysUntil(nextExpiry) > EXPIRY_WARN_DAYS) return false;
        return includesText([material.id, material.name, material.supplier, material.type, activeLots.length], search);
      })
      .sort((a, b) => a.material.name.localeCompare(b.material.name));
  }, [materials, materialLots, selectedFacility, showAllFacilities, typeFilter, stockFilter, search]);

  const lotRows = useMemo(() => {
    return materialLots
      .filter((lot) => !lot.deletedAt)
      .filter((lot) => (showAllFacilities ? true : resolveFacilityId(lot.facilityId) === selectedFacility))
      .map((lot) => ({
        ...lot,
        material: materialById[lot.materialId] ?? null,
        rawMilkRecord: rawMilkRecordByLotId[lot.id] ?? null,
        expiryDays: daysUntil(lot.expiryDate),
      }))
      .filter((lot) =>
        includesText(
          [
            lot.supplierLotCode,
            lot.supplier,
            lot.description,
            lot.invoiceNo,
            lot.billOfLadingNo,
            lot.receiverInitials,
            lot.material?.name,
            lot.material?.id,
          ],
          search
        )
      )
      .sort((a, b) => new Date(b.receivedDate) - new Date(a.receivedDate));
  }, [materialLots, materialById, rawMilkRecordByLotId, selectedFacility, showAllFacilities, search]);

  const rawMilkRows = useMemo(
    () => lotRows.filter((lot) => isRawMilkMaterial(lot.material) || lot.rawMilkRecord),
    [lotRows]
  );

  const lowStockCount = materialRows.filter((row) => row.isLow && row.onHand >= 0).length;
  const expiringLots = lotRows.filter((lot) => lot.expiryDays != null && lot.expiryDays <= EXPIRY_WARN_DAYS);
  const canReceive = materials.some((m) => m.isActive);

  const traceData = useMemo(() => {
    const query = traceQuery.trim().toLowerCase();
    if (!query) return { batches: [], lots: [], consumptionRows: [], shortfallRows: [] };

    if (traceMode === 'lot') {
      const lots = lotRows.filter((lot) =>
        includesText([lot.supplierLotCode, lot.material?.name, lot.material?.id, lot.invoiceNo, lot.billOfLadingNo], query)
      );
      const lotIds = new Set(lots.map((lot) => lot.id));
      const consumptionRows = consumptions.filter((row) => lotIds.has(row.materialLotId));
      const batchIds = new Set(consumptionRows.map((row) => row.batchId));
      const batches = state.batches.filter((batch) => batchIds.has(batch.id));
      return { batches, lots, consumptionRows, shortfallRows: [] };
    }

    const batches = state.batches.filter((batch) => {
      const product = getProduct(state.products, batch.productId);
      return includesText([batch.batchNumber, product?.name, product?.unitSize, product?.itemNumber], query);
    });
    const batchIds = new Set(batches.map((batch) => batch.id));
    const consumptionRows = consumptions.filter((row) => batchIds.has(row.batchId));
    const lotIds = new Set(consumptionRows.map((row) => row.materialLotId));
    const lots = lotRows.filter((lot) => lotIds.has(lot.id));
    const shortfallRows = shortfalls.filter((row) => batchIds.has(row.batchId));
    return { batches, lots, consumptionRows, shortfallRows };
  }, [traceMode, traceQuery, lotRows, consumptions, shortfalls, state.batches, state.products]);

  const recipeCoverage = useMemo(() => {
    const activeProducts = state.products.filter((product) => product.isCatalogActive !== false);
    return activeProducts
      .map((product) => {
        const lines = state.recipeLines.filter((line) => line.productId === product.id);
        return { product, lines };
      })
      .sort((a, b) => {
        if (!a.lines.length && b.lines.length) return -1;
        if (a.lines.length && !b.lines.length) return 1;
        return getProductDisplayName(a.product).localeCompare(getProductDisplayName(b.product));
      });
  }, [state.products, state.recipeLines]);

  const missingRecipeCount = recipeCoverage.filter((entry) => !entry.lines.length).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Boxes size={26} /> Materials
          </h1>
          <p className="page-subtitle">
            Raw materials, packaging, receiving, QA records, recipes, and traceability.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {canManageCatalog ? (
            <button className="btn btn-secondary" type="button" onClick={() => { setEditingMaterial(null); setShowMaterialForm(true); }}>
              <Plus size={16} /> Add Material
            </button>
          ) : null}
          <button className="btn btn-primary" type="button" disabled={!canReceive} onClick={() => setShowReceive(true)}>
            <PackagePlus size={16} /> Add Receiving
          </button>
        </div>
      </div>

      {!materials.length ? (
        <div className="alert alert-warning section">
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">No materials yet</div>
            <div className="alert-description">
              Add raw materials and packaging from the client's item list, then receive supplier lots to start tracking stock.
            </div>
          </div>
        </div>
      ) : null}

      {(lowStockCount > 0 || expiringLots.length > 0 || missingRecipeCount > 0) ? (
        <div className="alert alert-warning section">
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">
              {lowStockCount > 0 ? `${lowStockCount} low-stock material${lowStockCount === 1 ? '' : 's'}` : ''}
              {lowStockCount > 0 && (expiringLots.length > 0 || missingRecipeCount > 0) ? ' - ' : ''}
              {expiringLots.length > 0 ? `${expiringLots.length} lot${expiringLots.length === 1 ? '' : 's'} near/at expiry` : ''}
              {expiringLots.length > 0 && missingRecipeCount > 0 ? ' - ' : ''}
              {missingRecipeCount > 0 ? `${missingRecipeCount} product${missingRecipeCount === 1 ? '' : 's'} missing recipes` : ''}
            </div>
            <div className="alert-description">
              These are the highest-risk items before a client demo or production run.
            </div>
          </div>
        </div>
      ) : null}

      <div className="card section" style={{ padding: 'var(--space-3)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn ${currentTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTab(tab.id)}
            >
              {createElement(tab.icon, { size: 16 })} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-bar">
        <label className="topbar-search" style={{ minWidth: 260 }}>
          <Search size={16} />
          <input
            type="search"
            placeholder="Search materials, lots, suppliers..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <select aria-label="Filter by type" className="form-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="">All Types</option>
          {MATERIAL_TYPES.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
        <select aria-label="Filter by stock" className="form-select" value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
          <option value="">All Stock States</option>
          <option value="in-stock">In stock</option>
          <option value="low">Running low</option>
          <option value="out">Out of stock</option>
          <option value="expiry">Near expiry</option>
        </select>
        <button className="btn btn-ghost" type="button" onClick={() => { setSearch(''); setTypeFilter(''); setStockFilter(''); }}>
          <RotateCcw size={14} /> Reset
        </button>
      </div>

      {currentTab === 'stock' ? (
        <StockTab
          rows={materialRows}
          showAllFacilities={showAllFacilities}
          selectedFacility={selectedFacility}
          canManageCatalog={canManageCatalog}
          onEdit={(material) => { setEditingMaterial(material); setShowMaterialForm(true); }}
        />
      ) : null}

      {currentTab === 'receiving' ? (
        <ReceivingTab rows={lotRows} onTrace={openLotTrace} onTrash={setTrashingLot} />
      ) : null}

      {currentTab === 'raw-milk' ? (
        <RawMilkTab rows={rawMilkRows} onTrace={openLotTrace} />
      ) : null}

      {currentTab === 'traceability' ? (
        <TraceabilityTab
          mode={traceMode}
          setMode={setTraceMode}
          query={traceQuery}
          setQuery={setTraceQuery}
          data={traceData}
          materialById={materialById}
          lotById={lotById}
          batchById={batchById}
          rawMilkRecordByLotId={rawMilkRecordByLotId}
          products={state.products}
        />
      ) : null}

      {currentTab === 'recipes' ? (
        <RecipesTab
          coverage={recipeCoverage}
          materialById={materialById}
          canManage={canManageCatalog}
          onEditRecipe={setRecipeProduct}
        />
      ) : null}

      {showMaterialForm ? (
        <MaterialFormModal
          material={editingMaterial}
          onClose={() => { setShowMaterialForm(false); setEditingMaterial(null); }}
          onSave={async (payload) => {
            const result = await dispatch({ type: 'UPSERT_MATERIAL', payload });
            if (result?.ok) {
              addToast(`Material ${payload.name} saved.`);
              setShowMaterialForm(false);
              setEditingMaterial(null);
            }
          }}
        />
      ) : null}

      {showReceive ? (
        <ReceiveMaterialModal
          materials={materials.filter((m) => m.isActive)}
          defaultFacility={!showAllFacilities ? selectedFacility : FACILITIES[0].id}
          onClose={() => setShowReceive(false)}
          onSave={async (payload) => {
            const result = await dispatch({ type: 'RECEIVE_MATERIAL', payload });
            if (result?.ok) {
              addToast(`Received ${formatQty(payload.qty)} into lot ${payload.supplierLotCode}.`);
              setShowReceive(false);
            }
          }}
        />
      ) : null}

      {recipeProduct ? (
        <ProductModal product={recipeProduct} onClose={() => setRecipeProduct(null)} />
      ) : null}

      {trashingLot ? (
        <TrashLotModal
          lot={trashingLot}
          onClose={() => setTrashingLot(null)}
          onConfirm={async ({ reason }) => {
            const result = await dispatch({ type: 'SOFT_DELETE_MATERIAL_LOT', payload: { id: trashingLot.id, reason } });
            if (result?.ok) {
              addToast(`Lot ${trashingLot.supplierLotCode} trashed.`);
              setTrashingLot(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function StockTab({ rows, showAllFacilities, selectedFacility, canManageCatalog, onEdit }) {
  return (
    <div className="card section">
      <div className="card-title">Stock on Hand</div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>
        Remaining quantity per material{showAllFacilities ? ' across all factories' : ` at ${getFacilityName(selectedFacility)}`}.
      </div>
      {rows.length ? (
        <div className="table-scroll-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Type</th>
                <th>Preferred Vendor</th>
                <th>On Hand</th>
                <th>Lots</th>
                <th>Next Expiry</th>
                <th>Status</th>
                {canManageCatalog ? <th style={{ width: 70 }}>Edit</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ material, onHand, activeLots, isLow, nextExpiry }) => (
                <tr key={material.id}>
                  <td className="cell-truncate">
                    <span className="text-truncate" title={`${material.id} - ${material.name}`}>{material.name}</span>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{material.id}</div>
                  </td>
                  <td>{getMaterialTypeLabel(material.type)}</td>
                  <td className="cell-truncate"><span className="text-truncate" title={material.supplier}>{material.supplier || '-'}</span></td>
                  <td className="cell-monospace cell-align-left">{formatQty(onHand, material.unit)}</td>
                  <td className="cell-monospace cell-align-left">{activeLots.length}</td>
                  <td>{nextExpiry ? formatDate(nextExpiry) : '-'}</td>
                  <td>
                    {!material.isActive ? (
                      <span className="badge badge-cleared">Inactive</span>
                    ) : isLow ? (
                      <span className="badge badge-partial">Running low</span>
                    ) : onHand <= 0 ? (
                      <span className="badge badge-declined">Out</span>
                    ) : (
                      <span className="badge badge-fulfilled">In stock</span>
                    )}
                  </td>
                  {canManageCatalog ? (
                    <td>
                      <button className="um-icon-btn" type="button" title="Edit material" aria-label={`Edit ${material.name}`} onClick={() => onEdit(material)}>
                        <Pencil size={14} />
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="No materials match this view" description="Adjust filters or add materials from the client item list." />
      )}
    </div>
  );
}

function ReceivingTab({ rows, onTrace, onTrash }) {
  return (
    <div className="card section">
      <div className="card-title">Receiving Log</div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>
        General receiving fields match the client's receiving log: supplier, bill/lading, invoice, lot, best-before, temperature, COA, and initials.
      </div>
      {rows.length ? (
        <div className="table-scroll-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier Lot</th>
                <th>Material / Description</th>
                <th>Supplier</th>
                <th>Factory</th>
                <th>Received</th>
                <th>Qty</th>
                <th>Best Before</th>
                <th>COA</th>
                <th>Temp</th>
                <th>Invoice</th>
                <th style={{ width: 98 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lot) => (
                <tr key={lot.id}>
                  <td className="cell-monospace cell-align-left">{lot.supplierLotCode}</td>
                  <td className="cell-truncate">
                    <span className="text-truncate" title={lot.description || lot.material?.name}>{lot.description || lot.material?.name || 'Unknown'}</span>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{lot.material?.id ?? lot.materialId}</div>
                  </td>
                  <td className="cell-truncate"><span className="text-truncate" title={lot.supplier || lot.material?.supplier}>{lot.supplier || lot.material?.supplier || '-'}</span></td>
                  <td>{getFacilityName(resolveFacilityId(lot.facilityId))}</td>
                  <td>{formatDate(lot.receivedDate)}</td>
                  <td className="cell-monospace cell-align-left">{formatQty(lot.qtyRemaining, lot.material?.unit)}</td>
                  <td>
                    {lot.expiryDate ? (
                      <span className={lot.expiryDays != null && lot.expiryDays <= EXPIRY_WARN_DAYS ? 'badge badge-declined' : ''}>
                        {formatDate(lot.expiryDate)}
                        {lot.expiryDays != null && lot.expiryDays < 0 ? ' (expired)' : ''}
                      </span>
                    ) : '-'}
                  </td>
                  <td>{lot.coaReceived == null ? '-' : lot.coaReceived ? 'Y' : 'N'}</td>
                  <td>{lot.temperature || '-'}</td>
                  <td>{lot.invoiceNo || lot.billOfLadingNo || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="um-icon-btn" type="button" title="Trace lot" aria-label={`Trace lot ${lot.supplierLotCode}`} onClick={() => onTrace(lot)}>
                        <GitBranch size={14} />
                      </button>
                      <button className="um-icon-btn um-icon-btn-danger" type="button" title="Trash lot" aria-label={`Trash lot ${lot.supplierLotCode}`} onClick={() => onTrash(lot)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={PackagePlus} title="No received lots yet" description="Use Add Receiving to log incoming supplier deliveries." />
      )}
    </div>
  );
}

function RawMilkTab({ rows, onTrace }) {
  return (
    <div className="card section">
      <div className="card-title">Raw Milk QA Receiving</div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>
        Milk-specific receiving fields from the raw milk record: silo, appearance/odour, temperature, pH, antibiotic result, fat %, seal, tanker, and verification.
      </div>
      {rows.length ? (
        <div className="table-scroll-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier Lot</th>
                <th>Material</th>
                <th>Factory</th>
                <th>Date / Time</th>
                <th>Volume</th>
                <th>Silo</th>
                <th>Temp</th>
                <th>pH</th>
                <th>Antibiotic</th>
                <th>% Fat</th>
                <th>Seal / Tanker</th>
                <th>Verified</th>
                <th style={{ width: 70 }}>Trace</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lot) => {
                const qa = lot.rawMilkRecord ?? {};
                return (
                  <tr key={lot.id}>
                    <td className="cell-monospace cell-align-left">{lot.supplierLotCode}</td>
                    <td className="cell-truncate"><span className="text-truncate" title={lot.material?.name}>{lot.material?.name ?? 'Raw milk'}</span></td>
                    <td>{getFacilityName(resolveFacilityId(lot.facilityId))}</td>
                    <td>{formatDate(lot.receivedDate)}{qa.receivedTime ? ` ${qa.receivedTime}` : ''}</td>
                    <td className="cell-monospace cell-align-left">{formatQty(qa.volumeLtr ?? lot.qtyReceived, 'L')}</td>
                    <td>{qa.siloNo || '-'}</td>
                    <td>{qa.milkTemperature || lot.temperature || '-'}</td>
                    <td>{qa.ph ?? '-'}</td>
                    <td>{qa.antibioticResult || '-'}</td>
                    <td>{qa.fatPercent ?? '-'}</td>
                    <td>{[qa.sealNo, qa.tankerNo].filter(Boolean).join(' / ') || '-'}</td>
                    <td>{qa.verifiedBy || '-'}</td>
                    <td>
                      <button className="um-icon-btn" type="button" title="Trace raw milk lot" onClick={() => onTrace(lot)}>
                        <GitBranch size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={FlaskConical} title="No raw milk QA records yet" description="Receive a raw milk material to capture silo, tanker, and QA details." />
      )}
    </div>
  );
}

function TraceabilityTab({ mode, setMode, query, setQuery, data, materialById, lotById, batchById, rawMilkRecordByLotId, products }) {
  const { batches, lots, consumptionRows, shortfallRows } = data;

  return (
    <div className="card section">
      <div className="card-title">Traceability</div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
        Trace backward from a finished batch to supplier material lots, or forward from a supplier lot to affected finished batches.
      </div>
      <div className="filter-bar">
        <select className="form-select" value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="batch">Finished batch - materials used</option>
          <option value="lot">Supplier material lot - finished batches affected</option>
        </select>
        <input
          className="form-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={mode === 'batch' ? 'Search production lot, product, or item #' : 'Search supplier lot, material, invoice, or bill/lading'}
          style={{ minWidth: 320 }}
        />
      </div>

      {!query.trim() ? (
        <EmptyState icon={GitBranch} title="Enter a trace search" description="Use a production lot for backward trace or a supplier lot code for forward trace." />
      ) : mode === 'batch' ? (
        <BackwardTrace batches={batches} consumptionRows={consumptionRows} shortfallRows={shortfallRows} materialById={materialById} lotById={lotById} rawMilkRecordByLotId={rawMilkRecordByLotId} products={products} />
      ) : (
        <ForwardTrace lots={lots} batches={batches} consumptionRows={consumptionRows} materialById={materialById} batchById={batchById} products={products} rawMilkRecordByLotId={rawMilkRecordByLotId} />
      )}
    </div>
  );
}

function BackwardTrace({ batches, consumptionRows, shortfallRows, materialById, lotById, rawMilkRecordByLotId, products }) {
  if (!batches.length) {
    return <EmptyState icon={GitBranch} title="No production batch found" description="Try the exact lot code or product name." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {batches.map((batch) => {
        const product = getProduct(products, batch.productId);
        const batchConsumptions = consumptionRows.filter((row) => row.batchId === batch.id);
        const batchShortfalls = shortfallRows.filter((row) => row.batchId === batch.id);
        return (
          <div key={batch.id} className="section" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
              <div>
                <div style={{ fontWeight: 800 }}>Lot {batch.batchNumber} - {getProductDisplayName(product)}</div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  {getFacilityName(resolveFacilityId(batch.facilityId))} - produced {formatDate(batch.productionDate)} - {formatQty(batch.qtyProduced, 'units')}
                </div>
              </div>
              {batchShortfalls.length ? <span className="badge badge-declined">Shortfall recorded</span> : <span className="badge badge-fulfilled">Trace complete</span>}
            </div>
            {batchConsumptions.length ? (
              <ConsumptionTable rows={batchConsumptions} materialById={materialById} lotById={lotById} rawMilkRecordByLotId={rawMilkRecordByLotId} showBatch={false} products={products} />
            ) : (
              <div className="alert alert-warning">
                <AlertTriangle size={18} />
                <div className="alert-content">
                  <div className="alert-title">No material consumption rows</div>
                  <div className="alert-description">This batch may have been produced before recipes were configured, or the product has no recipe.</div>
                </div>
              </div>
            )}
            {batchShortfalls.length ? (
              <ShortfallTable rows={batchShortfalls} materialById={materialById} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ForwardTrace({ lots, batches, consumptionRows, materialById, batchById, products, rawMilkRecordByLotId }) {
  if (!lots.length) {
    return <EmptyState icon={GitBranch} title="No supplier lot found" description="Try the exact supplier lot code from the receiving log." />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {lots.map((lot) => {
        const lotConsumptions = consumptionRows.filter((row) => row.materialLotId === lot.id);
        const material = materialById[lot.materialId];
        const qa = rawMilkRecordByLotId[lot.id];
        return (
          <div key={lot.id} className="section" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
              <div>
                <div style={{ fontWeight: 800 }}>Supplier Lot {lot.supplierLotCode} - {material?.name ?? lot.materialId}</div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                  Received {formatDate(lot.receivedDate)} at {getFacilityName(resolveFacilityId(lot.facilityId))}
                  {lot.expiryDate ? ` - best before ${formatDate(lot.expiryDate)}` : ''}
                  {qa ? ' - raw milk QA captured' : ''}
                </div>
              </div>
              <span className={lotConsumptions.length ? 'badge badge-fulfilled' : 'badge badge-partial'}>
                {lotConsumptions.length ? `${lotConsumptions.length} production use${lotConsumptions.length === 1 ? '' : 's'}` : 'Not consumed yet'}
              </span>
            </div>
            {lotConsumptions.length ? (
              <div className="table-scroll-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Finished Lot</th>
                      <th>Product</th>
                      <th>Factory</th>
                      <th>Produced</th>
                      <th>Qty Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotConsumptions.map((row) => {
                      const batch = batchById[row.batchId];
                      const product = getProduct(products, batch?.productId);
                      return (
                        <tr key={row.id}>
                          <td className="cell-monospace cell-align-left">{batch?.batchNumber ?? row.batchId}</td>
                          <td>{getProductDisplayName(product)}</td>
                          <td>{getFacilityName(resolveFacilityId(batch?.facilityId ?? row.facilityId))}</td>
                          <td>{batch?.productionDate ? formatDate(batch.productionDate) : '-'}</td>
                          <td className="cell-monospace cell-align-left">{formatQty(row.qty, material?.unit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                This supplier lot is on hand or unused; no finished batches are linked to it yet.
              </div>
            )}
          </div>
        );
      })}
      {!batches.length && lots.some((lot) => consumptionRows.some((row) => row.materialLotId === lot.id)) ? (
        <div className="alert alert-warning">
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">Consumption rows found without visible batches</div>
            <div className="alert-description">The batch may be deleted or unavailable in the current filtered data.</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConsumptionTable({ rows, materialById, lotById, rawMilkRecordByLotId, showBatch, products }) {
  return (
    <div className="table-scroll-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            {showBatch ? <th>Finished Batch</th> : null}
            <th>Material</th>
            <th>Supplier Lot</th>
            <th>Factory</th>
            <th>Received</th>
            <th>Best Before</th>
            <th>Qty Used</th>
            <th>QA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const material = materialById[row.materialId];
            const lot = lotById[row.materialLotId];
            const qa = rawMilkRecordByLotId[row.materialLotId];
            return (
              <tr key={row.id}>
                {showBatch ? <td>{getProductDisplayName(getProduct(products, row.productId))}</td> : null}
                <td>{material?.name ?? row.materialId}</td>
                <td className="cell-monospace cell-align-left">{lot?.supplierLotCode ?? row.materialLotId}</td>
                <td>{getFacilityName(resolveFacilityId(row.facilityId))}</td>
                <td>{lot?.receivedDate ? formatDate(lot.receivedDate) : '-'}</td>
                <td>{lot?.expiryDate ? formatDate(lot.expiryDate) : '-'}</td>
                <td className="cell-monospace cell-align-left">{formatQty(row.qty, material?.unit)}</td>
                <td>{qa ? 'Raw milk QA' : lot?.coaReceived == null ? '-' : lot.coaReceived ? 'COA Y' : 'COA N'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ShortfallTable({ rows, materialById }) {
  return (
    <div className="alert alert-warning" style={{ marginTop: 'var(--space-3)' }}>
      <AlertTriangle size={18} />
      <div className="alert-content">
        <div className="alert-title">Material shortfall recorded</div>
        <div className="table-scroll-wrapper" style={{ marginTop: 'var(--space-2)' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Required</th>
                <th>Consumed</th>
                <th>Short</th>
                <th>Recorded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const material = materialById[row.materialId];
                return (
                  <tr key={row.id}>
                    <td>{material?.name ?? row.materialId}</td>
                    <td className="cell-monospace cell-align-left">{formatQty(row.requiredQty, row.unit || material?.unit)}</td>
                    <td className="cell-monospace cell-align-left">{formatQty(row.consumedQty, row.unit || material?.unit)}</td>
                    <td className="cell-monospace cell-align-left">{formatQty(row.shortQty, row.unit || material?.unit)}</td>
                    <td>{formatDate(row.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RecipesTab({ coverage, materialById, canManage, onEditRecipe }) {
  const missing = coverage.filter((entry) => !entry.lines.length);
  return (
    <div className="card section">
      <div className="card-title">Recipe Coverage</div>
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>
        Every product should have a recipe/BOM so production automatically deducts raw material and packaging stock.
      </div>
      {missing.length ? (
        <div className="alert alert-warning" style={{ marginBottom: 'var(--space-4)' }}>
          <AlertTriangle size={18} />
          <div className="alert-content">
            <div className="alert-title">{missing.length} product{missing.length === 1 ? '' : 's'} missing recipes</div>
            <div className="alert-description">Edit each product recipe before production so raw material and packaging deduct automatically.</div>
          </div>
        </div>
      ) : null}
      {coverage.length ? (
        <div className="table-scroll-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Recipe Status</th>
                <th>Materials per unit</th>
                <th style={{ width: 130 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map(({ product, lines }) => (
                <tr key={product.id}>
                  <td className="cell-truncate">
                    <span className="text-truncate" title={getProductDisplayName(product)}>{getProductDisplayName(product)}</span>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>{product.itemNumber || product.id}</div>
                  </td>
                  <td>{lines.length ? <span className="badge badge-fulfilled">Configured</span> : <span className="badge badge-declined">Missing</span>}</td>
                  <td>
                    {lines.length
                      ? lines.map((line) => `${materialById[line.materialId]?.name ?? line.materialId}: ${formatQty(line.qtyPerUnit, materialById[line.materialId]?.unit)}`).join(', ')
                      : 'No materials will auto-deduct yet'}
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" type="button" disabled={!canManage} onClick={() => onEditRecipe(product)}>
                      Edit Recipe
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={ClipboardList} title="No products available" description="Products must exist before recipes can be configured." />
      )}
    </div>
  );
}

function MaterialFormModal({ material, onClose, onSave }) {
  useModalBehavior(onClose);
  const [name, setName] = useState(material?.name ?? '');
  const [type, setType] = useState(material?.type ?? 'raw');
  const [unit, setUnit] = useState(material?.unit ?? 'kg');
  const [supplier, setSupplier] = useState(material?.supplier ?? '');
  const [lowStock, setLowStock] = useState(material?.lowStockThreshold ?? '');
  const [isActive, setIsActive] = useState(material?.isActive !== false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim()) { window.alert('Material name is required.'); return; }
    setSaving(true);
    await onSave({
      id: material?.id ?? `material-${Date.now()}`,
      name: name.trim(),
      type,
      unit,
      supplier: supplier.trim() || null,
      lowStockThreshold: lowStock === '' ? null : Number(lowStock),
      isActive,
    });
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{material ? 'Edit Material' : 'Add Material'}</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Name</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Raw milk - DFO, 3.2% Dahi Cups" required autoFocus />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
                {MATERIAL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Unit</label>
              <select className="form-select" value={unit} onChange={(e) => setUnit(e.target.value)}>
                {MATERIAL_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Preferred Vendor</label>
              <input className="form-input" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Supplier name" />
            </div>
            <div className="form-group">
              <label className="form-label">Low-stock threshold</label>
              <input className="form-input" type="number" min="0" step="0.01" value={lowStock} onChange={(e) => setLowStock(e.target.value)} placeholder="Alert when at/below" />
            </div>
          </div>
          {material ? (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active (available for receiving)
              </label>
            </div>
          ) : null}
          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Material'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReceiveMaterialModal({ materials, defaultFacility, onClose, onSave }) {
  useModalBehavior(onClose);
  const sortedMaterials = useMemo(
    () => [...materials].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
    [materials]
  );
  const initialMaterial = sortedMaterials[0] ?? null;
  const [materialId, setMaterialId] = useState(initialMaterial?.id ?? '');
  const [materialSearch, setMaterialSearch] = useState(initialMaterial?.name ?? '');
  const [supplierLotCode, setSupplierLotCode] = useState('');
  const [facilityId, setFacilityId] = useState(defaultFacility);
  const [qty, setQty] = useState('');
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [supplier, setSupplier] = useState(initialMaterial?.supplier ?? '');
  const [description, setDescription] = useState(initialMaterial?.name ?? '');
  const [billOfLadingNo, setBillOfLadingNo] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [temperature, setTemperature] = useState('');
  const [coaReceived, setCoaReceived] = useState('');
  const [receiverInitials, setReceiverInitials] = useState('');
  const [rawMilk, setRawMilk] = useState({
    receivedTime: '',
    volumeLtr: '',
    siloNo: '',
    appearanceOdour: '',
    milkTemperature: '',
    ph: '',
    antibioticResult: '',
    fatPercent: '',
    sealNo: '',
    tankerNo: '',
    driverSignature: '',
    setupPreparedBy: '',
    verifiedBy: '',
  });
  const [saving, setSaving] = useState(false);
  const material = sortedMaterials.find((m) => m.id === materialId);
  const showRawMilk = isRawMilkMaterial(material);
  const visibleMaterials = useMemo(() => {
    const query = materialSearch.trim().toLowerCase();
    if (!query) return sortedMaterials;
    return sortedMaterials.filter((m) =>
      [m.name, m.id, m.supplier, m.type, m.unit]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [materialSearch, sortedMaterials]);

  function handleMaterialChange(nextMaterialId) {
    const nextMaterial = sortedMaterials.find((m) => m.id === nextMaterialId);
    setMaterialId(nextMaterialId);
    setMaterialSearch(nextMaterial?.name ?? '');
    setSupplier(nextMaterial?.supplier ?? '');
    setDescription(nextMaterial?.name ?? '');
  }

  function updateRawMilk(patch) {
    setRawMilk((current) => ({ ...current, ...patch }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!materialId) { window.alert('Choose a material.'); return; }
    if (!supplierLotCode.trim()) { window.alert('Supplier lot code is required.'); return; }
    const numericQty = Number(qty);
    if (!Number.isFinite(numericQty) || numericQty <= 0) { window.alert('Enter a quantity greater than zero.'); return; }
    if (receivedDate > new Date().toISOString().slice(0, 10)) { window.alert('Received date cannot be in the future.'); return; }
    setSaving(true);
    await onSave({
      id: `mlot-${Date.now()}`,
      materialId,
      supplierLotCode: supplierLotCode.trim(),
      facilityId,
      qty: numericQty,
      receivedDate,
      expiryDate: expiryDate || null,
      unitCost: unitCost === '' ? null : Number(unitCost),
      supplier: supplier.trim() || null,
      description: description.trim() || null,
      billOfLadingNo: billOfLadingNo.trim() || null,
      invoiceNo: invoiceNo.trim() || null,
      temperature: temperature.trim() || null,
      coaReceived: coaReceived === '' ? null : coaReceived === 'yes',
      receiverInitials: receiverInitials.trim() || null,
      rawMilk: showRawMilk
        ? {
            ...rawMilk,
            volumeLtr: rawMilk.volumeLtr === '' ? numericQty : Number(rawMilk.volumeLtr),
            ph: rawMilk.ph === '' ? null : Number(rawMilk.ph),
            fatPercent: rawMilk.fatPercent === '' ? null : Number(rawMilk.fatPercent),
          }
        : null,
    });
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">
            <PackagePlus size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            Add Receiving
          </h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Material</label>
            <label className="topbar-search" style={{ marginBottom: 'var(--space-2)' }}>
              <Search size={16} />
              <input
                type="search"
                placeholder="Search material by name, ID, vendor, type..."
                value={materialSearch}
                onChange={(e) => setMaterialSearch(e.target.value)}
              />
            </label>
            <select className="form-select" value={materialId} onChange={(e) => handleMaterialChange(e.target.value)}>
              {visibleMaterials.map((m) => <option key={m.id} value={m.id}>{m.name} - {m.id} ({m.unit})</option>)}
            </select>
            {!visibleMaterials.length ? (
              <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)', marginTop: 'var(--space-1)' }}>
                No active material matches this search.
              </div>
            ) : null}
          </div>
          <div className="grid-2">
            <FormInput label="Supplier" value={supplier} onChange={setSupplier} placeholder="Supplier name" />
            <FormInput label="Description" value={description} onChange={setDescription} placeholder="Material description from receiving log" />
          </div>
          <div className="grid-2">
            <FormInput label="Supplier Lot Code" value={supplierLotCode} onChange={setSupplierLotCode} placeholder="e.g. milk 5579 / truck lot 001" required autoFocus />
            <div className="form-group">
              <label className="form-label">Factory</label>
              <select className="form-select" value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
                {FACILITIES.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.code})</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <FormInput label="Challan / Bill of Lading No." value={billOfLadingNo} onChange={setBillOfLadingNo} />
            <FormInput label="Invoice No." value={invoiceNo} onChange={setInvoiceNo} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Quantity {material ? `(${material.unit})` : ''}</label>
              <input className="form-input" type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Received Date</label>
              <input className="form-input" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Best Before / Expiry Date</label>
              <input className="form-input" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
            </div>
            <FormInput label="Temperature" value={temperature} onChange={setTemperature} placeholder="e.g. 4 C" />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">COA Received</label>
              <select className="form-select" value={coaReceived} onChange={(e) => setCoaReceived(e.target.value)}>
                <option value="">Not recorded</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <FormInput label="Receiver Initials" value={receiverInitials} onChange={setReceiverInitials} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Unit Cost (optional)</label>
              <input className="form-input" type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} placeholder="Per unit" />
            </div>
          </div>

          {showRawMilk ? (
            <div className="section" style={{ margin: 'var(--space-4) 0 0' }}>
              <div className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Raw Milk QA</div>
              <div className="grid-2">
                <FormInput label="Time" type="time" value={rawMilk.receivedTime} onChange={(value) => updateRawMilk({ receivedTime: value })} />
                <FormInput label="Volume (Ltr)" type="number" value={rawMilk.volumeLtr} onChange={(value) => updateRawMilk({ volumeLtr: value })} placeholder={qty || 'Defaults to quantity'} />
              </div>
              <div className="grid-2">
                <FormInput label="Silo #" value={rawMilk.siloNo} onChange={(value) => updateRawMilk({ siloNo: value })} placeholder="1 / 2 / 3" />
                <FormInput label="Appearance & Odour" value={rawMilk.appearanceOdour} onChange={(value) => updateRawMilk({ appearanceOdour: value })} placeholder="Normal / acceptable" />
              </div>
              <div className="grid-2">
                <FormInput label="Milk Temperature" value={rawMilk.milkTemperature} onChange={(value) => updateRawMilk({ milkTemperature: value })} placeholder="e.g. 4 C" />
                <FormInput label="pH" type="number" step="0.01" value={rawMilk.ph} onChange={(value) => updateRawMilk({ ph: value })} />
              </div>
              <div className="grid-2">
                <FormInput label="Antibiotic Test Result (+/-)" value={rawMilk.antibioticResult} onChange={(value) => updateRawMilk({ antibioticResult: value })} placeholder="+ / -" />
                <FormInput label="% Fat" type="number" step="0.01" value={rawMilk.fatPercent} onChange={(value) => updateRawMilk({ fatPercent: value })} />
              </div>
              <div className="grid-2">
                <FormInput label="Seal #" value={rawMilk.sealNo} onChange={(value) => updateRawMilk({ sealNo: value })} />
                <FormInput label="Tanker #" value={rawMilk.tankerNo} onChange={(value) => updateRawMilk({ tankerNo: value })} />
              </div>
              <div className="grid-2">
                <FormInput label="Driver Sign / Name" value={rawMilk.driverSignature} onChange={(value) => updateRawMilk({ driverSignature: value })} />
                <FormInput label="Set up Prepared By" value={rawMilk.setupPreparedBy} onChange={(value) => updateRawMilk({ setupPreparedBy: value })} />
              </div>
              <FormInput label="Verified By" value={rawMilk.verifiedBy} onChange={(value) => updateRawMilk({ verifiedBy: value })} />
            </div>
          ) : null}

          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Receiving...' : 'Log Receiving'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormInput({ label, value, onChange, type = 'text', placeholder = '', required = false, autoFocus = false, step }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={type}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
      />
    </div>
  );
}

function TrashLotModal({ lot, onClose, onConfirm }) {
  useModalBehavior(onClose);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!reason.trim()) { window.alert('Enter a reason for trashing this lot.'); return; }
    setSaving(true);
    await onConfirm({ reason: reason.trim() });
    setSaving(false);
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick(onClose)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Trash Lot {lot.supplierLotCode}?</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}><X size={18} /></button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <p style={{ marginTop: 0, color: 'var(--color-text-secondary)', fontSize: 14 }}>
            This removes the lot from stock but keeps it on record for audit and traceability. A reason is required.
          </p>
          <div className="form-group">
            <label className="form-label">Reason (required)</label>
            <input className="form-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Spoiled, mis-entered, recalled" required autoFocus />
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving || !reason.trim()}>{saving ? 'Trashing...' : 'Trash Lot'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
