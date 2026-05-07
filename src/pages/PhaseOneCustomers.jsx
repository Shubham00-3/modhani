import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Mail,
  MapPin,
  Plus,
  Search,
  Settings2,
  Trash2,
  UserPlus,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { useApp } from '../context/useApp';
import { supabase } from '../lib/supabaseClient';

export default function PhaseOneCustomers() {
  const { state, dispatch, addToast } = useApp();
  const canManage = state.currentUser?.permissions?.manageSettings;
  const [customerSearch, setCustomerSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);

  const customers = useMemo(() => state.customerContacts ?? [], [state.customerContacts]);
  const clientAssignments = useMemo(() => state.customerClientAssignments ?? [], [state.customerClientAssignments]);
  const locationAssignments = useMemo(() => state.customerLocationAssignments ?? [], [state.customerLocationAssignments]);

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return customers;

    return customers.filter((contact) => {
      const assignedClientNames = clientAssignments
        .filter((a) => a.customerUserId === contact.userId)
        .map((a) => state.clients.find((c) => c.id === a.clientId)?.name ?? '')
        .join(' ');

      const searchable = [contact.fullName, contact.email, assignedClientNames]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(query);
    });
  }, [customerSearch, customers, clientAssignments, state.clients]);

  function getAssignedClientIds(userId) {
    return clientAssignments.filter((a) => a.customerUserId === userId).map((a) => a.clientId);
  }

  function getAssignedLocationIds(userId) {
    return locationAssignments.filter((a) => a.customerUserId === userId).map((a) => a.locationId);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">
            Manage customer portal accounts, company and location assignments.
          </p>
        </div>
        <div>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canManage}
            onClick={() => setShowAddModal(true)}
          >
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {!canManage ? (
        <div className="alert alert-warning">
          <Settings2 size={18} />
          <div className="alert-content">
            <div className="alert-title">Read-only customer management</div>
            <div className="alert-description">
              Only settings admins can add or modify customer accounts.
            </div>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="client-directory-header">
          <div>
            <div className="card-title">
              <UserRoundCheck size={18} /> Customer Directory
            </div>
            <div className="client-directory-count">
              Showing {filteredCustomers.length.toLocaleString()} of {customers.length.toLocaleString()} customers
            </div>
          </div>
          <label className="client-directory-search">
            <Search size={16} />
            <input
              type="search"
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="Search customers by name, email, or company..."
            />
          </label>
        </div>

        {filteredCustomers.length ? (
          <div className="customer-contact-list">
            {filteredCustomers.map((contact) => {
              const assignedClients = getAssignedClientIds(contact.userId);
              const assignedLocations = getAssignedLocationIds(contact.userId);
              const isExpanded = expandedUserId === contact.userId;

              return (
                <div key={contact.userId}>
                  <div
                    className={`customer-contact-row customer-contact-row-expandable ${isExpanded ? 'customer-contact-row-expanded' : ''}`}
                    onClick={() => setExpandedUserId(isExpanded ? null : contact.userId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedUserId(isExpanded ? null : contact.userId);
                      }
                    }}
                  >
                    <div className="customer-contact-info">
                      <strong>{contact.fullName || contact.email}</strong>
                      <p>{contact.email}</p>
                    </div>
                    <div className="customer-contact-summary">
                      <span className="customer-chip-count">
                        <Building2 size={14} />
                        {assignedClients.length} {assignedClients.length === 1 ? 'company' : 'companies'}
                      </span>
                      <span className="customer-chip-count">
                        <MapPin size={14} />
                        {assignedLocations.length} {assignedLocations.length === 1 ? 'location' : 'locations'}
                      </span>
                      <span className={`status-badge status-${contact.status}`}>
                        {contact.status}
                      </span>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>

                  {isExpanded ? (
                    <CustomerDetailPanel
                      contact={contact}
                      clients={state.clients}
                      locations={state.locations}
                      initialClientIds={assignedClients}
                      initialLocationIds={assignedLocations}
                      canManage={canManage}
                      dispatch={dispatch}
                      addToast={addToast}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
            <div className="empty-state-title">
              {customers.length ? 'No customers match that search' : 'No customers added yet'}
            </div>
            <div className="empty-state-description">
              {customers.length
                ? 'Try searching by name, email, or company.'
                : 'Add your first customer using the button above. They will receive an invitation email to set their password.'}
            </div>
          </div>
        )}
      </div>

      {showAddModal ? (
        <AddCustomerModal
          clients={state.clients}
          locations={state.locations}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => addToast('Customer invited successfully! They will receive an email to set their password.')}
        />
      ) : null}
    </div>
  );
}

// ============================================================================
// Searchable Multi-Select
// ============================================================================

function SearchableChipList({ items, selectedIds, onToggle, disabled, searchPlaceholder, renderLabel }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const label = renderLabel ? renderLabel(item) : item.name || item.id;
      return label.toLowerCase().includes(q);
    });
  }, [items, search, renderLabel]);

  const selectedCount = items.filter((item) => selectedIds.includes(item.id)).length;

  return (
    <div className="searchable-chip-list">
      <div className="searchable-chip-search">
        <Search size={14} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder || 'Search...'}
          onClick={(e) => e.stopPropagation()}
        />
        {selectedCount > 0 ? (
          <span className="searchable-chip-badge">{selectedCount} selected</span>
        ) : null}
      </div>
      <div className="customer-multi-select">
        {filtered.map((item) => {
          const checked = selectedIds.includes(item.id);
          const label = renderLabel ? renderLabel(item) : item.name;
          return (
            <label key={item.id} className={`multi-select-chip ${checked ? 'multi-select-chip-active' : ''}`}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(item.id)}
              />
              <span>{label}</span>
            </label>
          );
        })}
        {filtered.length === 0 && search ? (
          <span className="form-hint" style={{ marginTop: 0 }}>No results for "{search}"</span>
        ) : null}
        {items.length === 0 ? (
          <span className="form-hint" style={{ marginTop: 0 }}>None available</span>
        ) : null}
      </div>
    </div>
  );
}

// ============================================================================
// Customer Detail Panel (expandable)
// ============================================================================

function CustomerDetailPanel({ contact, clients, locations, initialClientIds, initialLocationIds, canManage, dispatch, addToast }) {
  const [selectedClientIds, setSelectedClientIds] = useState(initialClientIds);
  const [selectedLocationIds, setSelectedLocationIds] = useState(initialLocationIds);
  const [status, setStatus] = useState(contact.status);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);

  const filteredLocations = useMemo(
    () => locations.filter((loc) => selectedClientIds.includes(loc.clientId)),
    [locations, selectedClientIds]
  );

  // When clients change, remove location assignments that no longer belong.
  function handleToggleClient(clientId) {
    setSelectedClientIds((prev) => {
      const next = prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId];

      // Remove location assignments that don't belong to any selected client.
      setSelectedLocationIds((prevLocs) =>
        prevLocs.filter((locId) => {
          const loc = locations.find((l) => l.id === locId);
          return loc && next.includes(loc.clientId);
        })
      );

      return next;
    });
  }

  function handleToggleLocation(locationId) {
    setSelectedLocationIds((prev) =>
      prev.includes(locationId) ? prev.filter((id) => id !== locationId) : [...prev, locationId]
    );
  }

  function selectAllLocationsForClient(clientId) {
    const clientLocIds = locations.filter((l) => l.clientId === clientId).map((l) => l.id);
    setSelectedLocationIds((prev) => [...new Set([...prev, ...clientLocIds])]);
  }

  function deselectAllLocationsForClient(clientId) {
    const clientLocIds = new Set(locations.filter((l) => l.clientId === clientId).map((l) => l.id));
    setSelectedLocationIds((prev) => prev.filter((id) => !clientLocIds.has(id)));
  }

  const isDirty =
    status !== contact.status ||
    !arraysEqual(selectedClientIds.slice().sort(), initialClientIds.slice().sort()) ||
    !arraysEqual(selectedLocationIds.slice().sort(), initialLocationIds.slice().sort());

  async function handleSave() {
    setSaving(true);

    // 1. Save assignments.
    const assignResult = await dispatch({
      type: 'UPDATE_CUSTOMER_ASSIGNMENTS',
      payload: {
        customerUserId: contact.userId,
        clientIds: selectedClientIds,
        locationIds: selectedLocationIds,
      },
    });

    if (!assignResult.ok) {
      setSaving(false);
      return;
    }

    // 2. Always sync the contact (status + backward-compat clientId).
    const contactResult = await dispatch({
      type: 'UPDATE_CUSTOMER_CONTACT',
      payload: {
        ...contact,
        clientId: selectedClientIds[0] || null,
        status,
      },
    });

    if (!contactResult.ok) {
      setSaving(false);
      return;
    }

    addToast('Customer updated successfully.');
    setSaving(false);
  }

  async function handleDelete() {
    setDeleting(true);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        addToast('You must be signed in to remove customers.', 'warning');
        setDeleting(false);
        return;
      }

      const response = await fetch('/api/delete-customer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({ customerUserId: contact.userId }),
      });

      const data = await response.json();

      if (!data.ok && !data.warning) {
        addToast(data.error || 'Failed to remove customer.', 'warning');
        setDeleting(false);
        return;
      }

      if (data.warning) {
        addToast(data.warning, 'warning');
      } else {
        addToast(`Customer ${contact.email} has been permanently removed.`);
      }

      // Navigate to root to reflect the deletion.
      setTimeout(() => {
        window.location.href = '/';
      }, 800);
    } catch (fetchError) {
      addToast(fetchError.message || 'Network error.', 'warning');
      setDeleting(false);
    }
  }

  return (
    <div className="customer-detail-panel" onClick={(e) => e.stopPropagation()}>
      <div className="customer-detail-section">
        <h4><Building2 size={16} /> Assigned Companies</h4>
        <SearchableChipList
          items={clients}
          selectedIds={selectedClientIds}
          onToggle={handleToggleClient}
          disabled={!canManage}
          searchPlaceholder="Search companies..."
        />
      </div>

      {selectedClientIds.length > 0 ? (
        <div className="customer-detail-section">
          <h4><MapPin size={16} /> Assigned Locations</h4>
          {selectedClientIds.map((clientId) => {
            const client = clients.find((c) => c.id === clientId);
            const clientLocs = filteredLocations.filter((l) => l.clientId === clientId);
            const allSelected = clientLocs.length > 0 && clientLocs.every((l) => selectedLocationIds.includes(l.id));

            return (
              <div key={clientId} className="customer-location-group">
                <div className="customer-location-group-header">
                  <strong>{client?.name ?? clientId}</strong>
                  <button
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={!canManage}
                    onClick={() => allSelected ? deselectAllLocationsForClient(clientId) : selectAllLocationsForClient(clientId)}
                  >
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <SearchableChipList
                  items={clientLocs}
                  selectedIds={selectedLocationIds}
                  onToggle={handleToggleLocation}
                  disabled={!canManage}
                  searchPlaceholder={`Search ${client?.name ?? 'company'} locations...`}
                  renderLabel={(loc) => `${loc.name}${loc.city ? ` (${loc.city})` : ''}`}
                />
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="customer-detail-section customer-detail-footer">
        <div className="customer-detail-status">
          <label className="form-label">Status</label>
          <select
            className="form-select"
            value={status}
            disabled={!canManage}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            className="btn btn-danger-ghost btn-sm"
            type="button"
            disabled={!canManage || saving || deleting}
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 size={14} /> Remove
          </button>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={!canManage || !isDirty || saving}
            onClick={handleSave}
          >
            <Check size={14} /> {saving ? 'Saving...' : isDirty ? 'Save Changes' : 'Saved'}
          </button>
        </div>
      </div>

      {showDeleteConfirm ? (
        <div className="customer-delete-confirm">
          <div className="customer-delete-confirm-header">
            <AlertTriangle size={18} />
            <strong>Permanently Remove Customer</strong>
          </div>
          <p>
            This will permanently delete <strong>{contact.fullName || contact.email}</strong>'s account,
            all company and location assignments, and their Supabase auth user.
            This action cannot be undone.
          </p>
          <div className="form-group">
            <label className="form-label">
              Type <strong>{contact.email}</strong> to confirm:
            </label>
            <input
              className="form-input"
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              placeholder={contact.email}
              autoFocus
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-ghost btn-sm"
              type="button"
              onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmEmail(''); }}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              className="btn btn-danger btn-sm"
              type="button"
              disabled={deleteConfirmEmail.trim().toLowerCase() !== contact.email.toLowerCase() || deleting}
              onClick={handleDelete}
            >
              <Trash2 size={14} /> {deleting ? 'Removing...' : 'Remove Permanently'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================================
// Add Customer Modal
// ============================================================================

function AddCustomerModal({ clients, locations, onClose, onSuccess }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const filteredLocations = useMemo(
    () => locations.filter((loc) => selectedClientIds.includes(loc.clientId)),
    [locations, selectedClientIds]
  );

  function handleToggleClient(clientId) {
    setSelectedClientIds((prev) => {
      const next = prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId];

      setSelectedLocationIds((prevLocs) =>
        prevLocs.filter((locId) => {
          const loc = locations.find((l) => l.id === locId);
          return loc && next.includes(loc.clientId);
        })
      );

      return next;
    });
  }

  function handleToggleLocation(locationId) {
    setSelectedLocationIds((prev) =>
      prev.includes(locationId) ? prev.filter((id) => id !== locationId) : [...prev, locationId]
    );
  }

  function selectAllLocationsForClient(clientId) {
    const clientLocIds = locations.filter((l) => l.clientId === clientId).map((l) => l.id);
    setSelectedLocationIds((prev) => [...new Set([...prev, ...clientLocIds])]);
  }

  function deselectAllLocationsForClient(clientId) {
    const clientLocIds = new Set(locations.filter((l) => l.clientId === clientId).map((l) => l.id));
    setSelectedLocationIds((prev) => prev.filter((id) => !clientLocIds.has(id)));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      // Get the current user's session token for authentication.
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) {
        setError('You must be signed in to invite customers.');
        setSubmitting(false);
        return;
      }

      const response = await fetch('/api/invite-customer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          clientIds: selectedClientIds,
          locationIds: selectedLocationIds,
        }),
      });

      const data = await response.json();

      if (!data.ok && !data.warning) {
        setError(data.error || 'Failed to invite customer.');
        setSubmitting(false);
        return;
      }

      if (data.warning) {
        setError(data.warning);
      }

      onSuccess();

      // Force a page reload to pick up the new customer contact from the server.
      setTimeout(() => {
        window.location.reload();
      }, 1200);
    } catch (fetchError) {
      setError(fetchError.message || 'Network error. Please try again.');
    }

    setSubmitting(false);
  }

  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-lg" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <UserPlus size={20} /> Add Customer
          </h2>
          <button className="btn btn-ghost btn-sm" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p className="modal-description">
              Enter the customer's details below. An invitation email will be sent so they can set their password and sign in to the Customer Portal.
            </p>

            <div className="form-group">
              <label className="form-label">Full Name *</label>
              <input
                className="form-input"
                placeholder="e.g. John Smith"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Email *</label>
              <div className="auth-input-wrap" style={{ background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                <Mail size={16} />
                <input
                  className="form-input"
                  type="email"
                  placeholder="customer@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label"><Building2 size={14} /> Assign to Companies (optional)</label>
              <SearchableChipList
                items={clients}
                selectedIds={selectedClientIds}
                onToggle={handleToggleClient}
                searchPlaceholder="Search companies..."
              />
              <div className="form-hint">
                Selected companies will be linked immediately. If none are selected, the customer will start as "pending."
              </div>
            </div>

            {selectedClientIds.length > 0 ? (
              <div className="form-group">
                <label className="form-label"><MapPin size={14} /> Assign to Locations (optional)</label>
                {selectedClientIds.map((clientId) => {
                  const client = clients.find((c) => c.id === clientId);
                  const clientLocs = filteredLocations.filter((l) => l.clientId === clientId);
                  const allSelected = clientLocs.length > 0 && clientLocs.every((l) => selectedLocationIds.includes(l.id));

                  return (
                    <div key={clientId} className="customer-location-group">
                      <div className="customer-location-group-header">
                        <strong>{client?.name ?? clientId}</strong>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => allSelected ? deselectAllLocationsForClient(clientId) : selectAllLocationsForClient(clientId)}
                        >
                          {allSelected ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      <SearchableChipList
                        items={clientLocs}
                        selectedIds={selectedLocationIds}
                        onToggle={handleToggleLocation}
                        searchPlaceholder={`Search ${client?.name ?? 'company'} locations...`}
                        renderLabel={(loc) => `${loc.name}${loc.city ? ` (${loc.city})` : ''}`}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}

            {error ? (
              <div className="alert alert-warning">
                <div className="alert-content">
                  <div className="alert-title">Could not invite</div>
                  <div className="alert-description">{error}</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              <Mail size={16} />
              {submitting ? 'Sending Invite...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
