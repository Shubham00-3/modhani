import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronUp,
  Layers,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Settings2,
  User,
  Users,
} from 'lucide-react';
import { useApp } from '../context/useApp';
import { getClientTier } from '../data/phaseOneData';
import { ClientModal, LocationModal } from '../components/settings/ManagementModals';

export default function PhaseOneClientsLocations() {
  const { state } = useApp();
  const [searchParams] = useSearchParams();
  const canManage = state.currentUser.permissions.manageSettings;
  const [editingClient, setEditingClient] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [clientSearch, setClientSearch] = useState('');
  const dashboardSearch = searchParams.get('q') ?? '';
  const [showClientModal, setShowClientModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  // Set of clientIds that the user has manually expanded.
  const [expandedClientIds, setExpandedClientIds] = useState(() => new Set());
  // When a new location is being added, pre-select this client in the form.
  const [addLocationClientId, setAddLocationClientId] = useState(null);

  const query = (clientSearch || dashboardSearch).trim().toLowerCase();
  const searching = Boolean(query);

  const filteredClients = useMemo(() => {
    if (!query) return state.clients;
    return state.clients.filter((client) => {
      const clientLocations = state.locations.filter((location) => location.clientId === client.id);
      const searchableText = [
        client.name,
        client.operatingAs,
        client.qbCustomerName,
        ...clientLocations.flatMap((location) => [
          location.name,
          location.city,
          location.addressLine1,
          location.addressLine2,
          location.postalCode,
          location.repName,
          location.repEmail,
          location.repPhone,
        ]),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchableText.includes(query);
    });
  }, [query, state.clients, state.locations]);

  function toggleClient(clientId) {
    setExpandedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  function isExpanded(clientId) {
    // Auto-expand search matches so results stay visible.
    if (searching) return true;
    return expandedClientIds.has(clientId);
  }

  function handleAddLocationForClient(clientId) {
    setAddLocationClientId(clientId);
    setShowLocationModal(true);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clients & Locations</h1>
          <p className="page-subtitle">
            Manage client accounts and store locations. Pricing and visible products are now controlled
            from the <Link to="/tiers">Tiers</Link> page.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!canManage || state.clients.length === 0}
            onClick={() => { setAddLocationClientId(null); setShowLocationModal(true); }}
          >
            <Plus size={16} /> Add Location
          </button>
          <button className="btn btn-primary" type="button" disabled={!canManage} onClick={() => setShowClientModal(true)}>
            <Plus size={16} /> Add Client
          </button>
        </div>
      </div>

      {!canManage ? (
        <div className="alert alert-warning">
          <Settings2 size={18} />
          <div className="alert-content">
            <div className="alert-title">Read-only client management</div>
            <div className="alert-description">
              This user can review client setup, but only settings admins can add or change clients, locations, and pricing.
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="client-directory-header">
          <div>
            <div className="card-title">
              <Users size={18} /> Client Directory
            </div>
            <div className="client-directory-count">
              Showing {filteredClients.length.toLocaleString()} of {state.clients.length.toLocaleString()} clients
            </div>
          </div>
          <label className="client-directory-search">
            <Search size={16} />
            <input
              type="search"
              value={clientSearch}
              onChange={(event) => setClientSearch(event.target.value)}
              placeholder="Search clients or locations..."
            />
          </label>
        </div>

        {filteredClients.length ? (
          <div className="client-accordion">
            {filteredClients.map((client) => {
              const clientLocations = state.locations.filter((l) => l.clientId === client.id);
              const assignedTier = getClientTier(state.tiers ?? [], client);
              const enabledProductCount = assignedTier?.products.length ?? 0;
              const open = isExpanded(client.id);
              const displayName = client.operatingAs?.trim() || client.name;
              const hasOperatingAs = Boolean(client.operatingAs?.trim());

              return (
                <div key={client.id} className={`client-accordion-card ${open ? 'open' : ''}`}>
                  {/* Collapsed header — clickable */}
                  <button
                    type="button"
                    className="client-accordion-header"
                    onClick={() => toggleClient(client.id)}
                    aria-expanded={open}
                  >
                    <div className="client-accordion-title-wrap">
                      <div className="client-accordion-title">{displayName}</div>
                      {hasOperatingAs ? (
                        <div className="client-accordion-legal">Legal name: {client.name}</div>
                      ) : null}
                    </div>
                    <div className="client-accordion-summary">
                      <span className="client-accordion-pill">
                        <MapPin size={13} />
                        {clientLocations.length} {clientLocations.length === 1 ? 'location' : 'locations'}
                      </span>
                      <span className="client-accordion-pill">
                        <Layers size={13} />
                        {assignedTier ? assignedTier.name : 'No tier'}
                      </span>
                      <span className="client-accordion-chev">
                        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </span>
                    </div>
                  </button>

                  {/* Expanded body */}
                  {open ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-6)',
                        padding: 'var(--space-5) var(--space-6) var(--space-6)',
                      }}
                    >
                      <ClientInfoSection
                        client={client}
                        assignedTier={assignedTier}
                        enabledProductCount={enabledProductCount}
                        hasOperatingAs={hasOperatingAs}
                        canManage={canManage}
                        onEdit={() => setEditingClient(client)}
                      />

                      <ClientLocationsSection
                        clientLocations={clientLocations}
                        canManage={canManage}
                        onAddLocation={() => handleAddLocationForClient(client.id)}
                        onEditLocation={(location) => setEditingLocation(location)}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">{state.clients.length ? 'No clients match that search' : 'No clients configured yet'}</div>
            <div className="empty-state-description">
              {state.clients.length
                ? 'Try searching by customer name, location, city, address, or postal code.'
                : 'Add your first client to start building locations and negotiated pricing.'}
            </div>
          </div>
        )}
      </div>

      {showClientModal || editingClient ? (
        <ClientModal
          client={editingClient}
          onClose={() => {
            setShowClientModal(false);
            setEditingClient(null);
          }}
        />
      ) : null}

      {showLocationModal || editingLocation ? (
        <LocationModal
          location={editingLocation ?? (addLocationClientId ? { clientId: addLocationClientId } : null)}
          onClose={() => {
            setShowLocationModal(false);
            setEditingLocation(null);
            setAddLocationClientId(null);
          }}
        />
      ) : null}

    </div>
  );
}

function ClientInfoSection({ client, assignedTier, enabledProductCount, hasOperatingAs, canManage, onEdit }) {
  const qbCustomerName = client.qbCustomerName?.trim();
  const showQbName = qbCustomerName && qbCustomerName !== client.name && qbCustomerName !== client.operatingAs?.trim();
  const tierLabel = assignedTier
    ? `${assignedTier.name} · ${enabledProductCount.toLocaleString()} visible product${enabledProductCount === 1 ? '' : 's'}`
    : 'No tier assigned';

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
        <h4 style={{ margin: 0, fontSize: 'var(--font-size-md, 15px)', fontWeight: 600 }}>Client info</h4>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          disabled={!canManage}
          onClick={onEdit}
        >
          <Pencil size={14} /> Edit info
        </button>
      </header>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          columnGap: 'var(--space-6)',
          rowGap: 'var(--space-3)',
          margin: 0,
        }}
      >
        <ClientInfoField label="Legal name" value={client.name} />
        {hasOperatingAs ? <ClientInfoField label="Operating as" value={client.operatingAs} /> : null}
        {showQbName ? <ClientInfoField label="QuickBooks customer" value={qbCustomerName} /> : null}
        <ClientInfoField
          label="Assigned tier"
          value={
            assignedTier ? (
              tierLabel
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>
                {tierLabel} — customers will see no products
              </span>
            )
          }
          action={
            <Link
              to="/tiers"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 'var(--font-size-sm, 13px)',
                color: 'var(--color-primary, #1f3a2e)',
                textDecoration: 'none',
              }}
            >
              <Layers size={13} /> Manage in Tiers
            </Link>
          }
        />
      </dl>
    </section>
  );
}

function ClientInfoField({ label, value, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <dt
        style={{
          color: 'var(--color-text-muted)',
          fontSize: 'var(--font-size-xs, 12px)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontWeight: 600,
          margin: 0,
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0, fontWeight: 500, color: 'var(--color-text-primary)' }}>{value}</dd>
      {action ? <div style={{ marginTop: 4 }}>{action}</div> : null}
    </div>
  );
}

function ClientLocationsSection({ clientLocations, canManage, onAddLocation, onEditLocation }) {
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
          Locations{' '}
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>
            ({clientLocations.length})
          </span>
        </h4>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          disabled={!canManage}
          onClick={onAddLocation}
        >
          <Plus size={14} /> Add location
        </button>
      </header>

      {clientLocations.length === 0 ? (
        <div
          style={{
            padding: 'var(--space-5) var(--space-4)',
            background: 'var(--color-surface-muted, #f6f7f6)',
            borderRadius: 'var(--radius-md, 8px)',
            color: 'var(--color-text-muted)',
            textAlign: 'center',
          }}
        >
          No locations yet. Click <strong>Add location</strong> to create the first one.
        </div>
      ) : (
        <div className="client-location-grid">
          {clientLocations.map((location) => (
            <LocationCard
              key={location.id}
              location={location}
              canManage={canManage}
              onEdit={() => onEditLocation(location)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Read-first card for a single location. Address, QB ship-to name, and
 * representative contact info all visible without clicking — Edit is its own
 * explicit pencil button in the top-right.
 */
function LocationCard({ location, canManage, onEdit }) {
  const addressLine = [location.addressLine1, location.addressLine2].filter(Boolean).join(' ');
  const cityLine = [location.city, location.province, location.postalCode].filter(Boolean).join(' ');
  const fullAddress = [addressLine, cityLine].filter(Boolean).join(', ');
  const needsAddress = location.qbMappingStatus !== 'ready';
  const hasRep = Boolean(location.repName || location.repEmail || location.repPhone);

  return (
    <div className={`location-card ${needsAddress ? 'location-card-needs-address' : ''}`}>
      <div className="location-card-header">
        <div className="location-card-title-wrap">
          <div className="location-card-title">{location.name}</div>
          {needsAddress ? <span className="location-card-warn">Needs address</span> : null}
        </div>
        <button
          className="btn btn-ghost btn-icon"
          type="button"
          disabled={!canManage}
          onClick={onEdit}
          aria-label={`Edit ${location.name}`}
          title={`Edit ${location.name}`}
        >
          <Pencil size={14} />
        </button>
      </div>

      <div className="location-card-row">
        <MapPin size={14} className="location-card-icon" />
        <span>{fullAddress || 'No address set yet'}</span>
      </div>

      {location.qbShipToName && location.qbShipToName !== location.name ? (
        <div className="location-card-row location-card-muted">
          <span className="location-card-key">QB ship-to:</span>
          <span>{location.qbShipToName}</span>
        </div>
      ) : null}

      {hasRep ? (
        <div className="location-card-rep">
          <div className="location-card-rep-header">
            <User size={14} />
            <span>
              Representative
              {location.repName ? <>: <strong>{location.repName}</strong></> : null}
            </span>
          </div>
          {location.repPhone || location.repEmail ? (
            <div className="location-card-rep-contact">
              {location.repPhone ? (
                <span>
                  <Phone size={12} /> {location.repPhone}
                </span>
              ) : null}
              {location.repEmail ? (
                <a href={`mailto:${location.repEmail}`}>{location.repEmail}</a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
