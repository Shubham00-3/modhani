import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Power,
  PowerOff,
  ShoppingBag,
  Truck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/useApp';
import { supabase } from '../../lib/supabaseClient';
import { useModalBehavior, handleOverlayClick } from '../../hooks/useModalBehavior';

const ROLE_LABEL = { staff: 'Staff', driver: 'Driver', customer: 'Customer' };
const ROLE_ICON = { staff: Briefcase, driver: Truck, customer: ShoppingBag };

// Single-line permission summary for staff: small chips, on = brand-green tint,
// off = muted. Lets admins see at a glance who can do what without expanding.
const STAFF_PERM_FIELDS = [
  { key: 'fulfilOrders', short: 'Fulfil', full: 'Fulfil orders' },
  { key: 'overridePrices', short: 'Override', full: 'Override prices' },
  { key: 'editInvoices', short: 'Invoices', full: 'Edit invoices' },
  { key: 'manageSettings', short: 'Settings', full: 'Manage settings' },
];

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'staff', label: 'Staff' },
  { value: 'driver', label: 'Drivers' },
  { value: 'customer', label: 'Customers' },
];

/**
 * Unified user-management table for the Settings page. Lists staff, drivers,
 * and customers; lets settings admins invite new users, send password resets,
 * remove users (with last-admin / self-delete guards), and edit staff
 * permissions inline.
 */
export default function UserManagementSection({ canManage }) {
  const { state, dispatch, addToast } = useApp();
  const [tab, setTab] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [pendingActionUserId, setPendingActionUserId] = useState(null);

  const currentUserId = state.currentUser?.id;
  // Only enabled admins count toward the "at least one admin must remain" rule.
  const settingsAdmins = useMemo(
    () => state.users.filter((u) => u.permissions?.manageSettings && !u.disabledAt),
    [state.users]
  );
  const settingsAdminCount = settingsAdmins.length;

  const rows = useMemo(() => {
    const staffRows = state.users.map((user) => ({
      id: user.id,
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      status: user.disabledAt ? 'disabled' : 'active',
      disabled: Boolean(user.disabledAt),
      permissions: user.permissions,
      isSelf: user.id === currentUserId,
      // Only enabled admins count toward the "must have one admin" rule.
      isLastAdmin:
        Boolean(user.permissions?.manageSettings)
        && !user.disabledAt
        && settingsAdminCount === 1,
    }));
    const customerRows = (state.customerContacts ?? []).map((c) => ({
      id: c.userId,
      userId: c.userId,
      role: 'customer',
      name: c.fullName || c.email,
      email: c.email,
      status: c.status,
      disabled: c.status === 'disabled',
      permissions: null,
      isSelf: false,
      isLastAdmin: false,
    }));
    const combined = [...staffRows, ...customerRows];
    if (tab === 'all') return combined;
    return combined.filter((row) => row.role === tab);
  }, [state.users, state.customerContacts, currentUserId, settingsAdminCount, tab]);

  async function callAdminApi(path, body) {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      addToast('You must be signed in.', 'warning');
      return { ok: false };
    }
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && !data.warning) {
      addToast(data.error || `Request failed (${response.status}).`, 'warning');
      return { ok: false };
    }
    if (data.warning) addToast(data.warning, 'warning');
    return { ok: true, data };
  }

  async function handleSendReset(row) {
    const confirmed = window.confirm(`Send a password reset email to ${row.email}?`);
    if (!confirmed) return;
    setPendingActionUserId(row.userId);
    const { ok } = await callAdminApi('/api/reset-user-password', { email: row.email });
    setPendingActionUserId(null);
    if (ok) addToast(`Password reset email sent to ${row.email}.`);
  }

  async function handleToggleDisabled(row) {
    const turningOff = !row.disabled;
    if (turningOff && row.isSelf) {
      addToast("You can't disable your own account.", 'warning');
      return;
    }
    if (turningOff && row.isLastAdmin) {
      addToast('Grant another user settings access before disabling the last admin.', 'warning');
      return;
    }
    const verb = turningOff ? 'Disable' : 'Re-enable';
    const sessionNote = turningOff
      ? '\n\nThey will be immediately signed out and unable to log in until re-enabled. Their profile and history are kept on record.'
      : '\n\nThey will be able to sign in again with their existing password.';
    const confirmed = window.confirm(`${verb} ${row.name} (${row.email})?${sessionNote}`);
    if (!confirmed) return;

    setPendingActionUserId(row.userId);
    const { ok } = await callAdminApi('/api/set-user-disabled', {
      userId: row.userId,
      disabled: turningOff,
    });
    setPendingActionUserId(null);
    if (ok) {
      addToast(turningOff
        ? `${ROLE_LABEL[row.role]} ${row.email} disabled.`
        : `${ROLE_LABEL[row.role]} ${row.email} re-enabled.`);
    }
  }

  async function handleTogglePermission(row, permissionKey) {
    if (!canManage) return;
    const nextValue = !row.permissions?.[permissionKey];

    // Client-side mirror of the server guard so we surface a clear message
    // before the round-trip.
    if (permissionKey === 'manageSettings' && !nextValue && row.isLastAdmin) {
      addToast('At least one settings admin must remain.', 'warning');
      return;
    }

    const result = await dispatch({
      type: 'UPDATE_USER',
      payload: { id: row.userId, permissions: { [permissionKey]: nextValue } },
    });
    if (!result?.ok) return;
  }

  return (
    <div className="card user-mgmt-card">
      <div className="user-mgmt-header">
        <div className="card-title">
          <Users size={18} /> User Management
        </div>
        <button
          className="btn btn-primary"
          type="button"
          disabled={!canManage}
          onClick={() => setShowAddModal(true)}
        >
          <UserPlus size={16} /> Add User
        </button>
      </div>

      <div className="user-mgmt-tabs">
        {TABS.map((t) => {
          const count = t.value === 'all'
            ? rows.length
            : (
                t.value === 'customer'
                  ? (state.customerContacts ?? []).length
                  : state.users.filter((u) => u.role === t.value).length
              );
          return (
            <button
              key={t.value}
              type="button"
              className={`user-mgmt-tab ${tab === t.value ? 'active' : ''}`}
              onClick={() => setTab(t.value)}
            >
              {t.label}
              <span className="user-mgmt-tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
          <div className="empty-state-title">No users in this view</div>
          <div className="empty-state-description">
            Click "Add User" to invite the first one.
          </div>
        </div>
      ) : (
        <div className="user-mgmt-list">
          {rows.map((row) => {
            const isExpanded = expandedUserId === row.userId && row.role === 'staff';
            const isBusy = pendingActionUserId === row.userId;
            const canEditPerms = row.role === 'staff' && canManage;

            const RoleIcon = ROLE_ICON[row.role] ?? Briefcase;

            return (
              <div key={`${row.role}:${row.id}`} className="um-row-wrap">
                <div className={`um-row um-row-${row.role} ${isExpanded ? 'is-expanded' : ''} ${row.disabled ? 'is-disabled' : ''}`}>
                  <div className={`um-role-pill um-role-${row.role}`} aria-hidden="true">
                    <RoleIcon size={13} />
                    <span>{ROLE_LABEL[row.role]}</span>
                  </div>

                  <div className="um-identity">
                    <div className="um-name-line">
                      <span className="um-name">{row.name}</span>
                      {row.isSelf ? <span className="um-self-chip">You</span> : null}
                      {row.disabled ? (
                        <span className="um-status um-status-disabled">Disabled</span>
                      ) : row.role === 'customer' ? (
                        <span className={`um-status um-status-${row.status}`}>
                          {row.status}
                        </span>
                      ) : null}
                    </div>
                    <div className="um-email">{row.email}</div>
                    {row.role === 'staff' && row.permissions ? (
                      <div className="um-perm-summary">
                        {STAFF_PERM_FIELDS.map((p) => (
                          <span
                            key={p.key}
                            className={`um-perm-chip ${row.permissions[p.key] ? 'is-on' : 'is-off'}`}
                            title={`${p.full}: ${row.permissions[p.key] ? 'On' : 'Off'}`}
                          >
                            {p.short}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="um-actions">
                    {canEditPerms ? (
                      <button
                        className={`um-icon-btn ${isExpanded ? 'is-active' : ''}`}
                        type="button"
                        onClick={() => setExpandedUserId(isExpanded ? null : row.userId)}
                        aria-label="Edit permissions"
                        title="Edit permissions"
                      >
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    ) : null}
                    {row.role === 'customer' ? (
                      <Link
                        to="/customers"
                        className="um-link-btn"
                        title="Manage company and location assignments"
                      >
                        Assignments
                      </Link>
                    ) : null}
                    <button
                      className="um-icon-btn"
                      type="button"
                      disabled={!canManage || isBusy}
                      onClick={() => handleSendReset(row)}
                      aria-label="Send password reset email"
                      title="Send password reset email"
                    >
                      <KeyRound size={15} />
                    </button>
                    <button
                      className={`um-icon-btn ${row.disabled ? 'um-icon-btn-restore' : 'um-icon-btn-danger'}`}
                      type="button"
                      disabled={!canManage || isBusy || (row.isSelf && !row.disabled) || (row.isLastAdmin && !row.disabled)}
                      onClick={() => handleToggleDisabled(row)}
                      aria-label={row.disabled ? 'Re-enable user' : 'Disable user'}
                      title={
                        row.isSelf && !row.disabled
                          ? "You can't disable your own account"
                          : row.isLastAdmin && !row.disabled
                            ? 'At least one settings admin must remain'
                            : row.disabled
                              ? 'Re-enable this user'
                              : 'Disable login (keeps history)'
                      }
                    >
                      {row.disabled ? <Power size={15} /> : <PowerOff size={15} />}
                    </button>
                  </div>
                </div>

                {isExpanded ? (
                  <PermissionsEditor
                    row={row}
                    onToggle={handleTogglePermission}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {showAddModal ? (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(message) => {
            addToast(message);
            setShowAddModal(false);
          }}
        />
      ) : null}
    </div>
  );
}

function PermissionsEditor({ row, onToggle }) {
  return (
    <div className="user-mgmt-perms">
      <PermissionToggle label="Fulfil Orders"   on={row.permissions?.fulfilOrders}   onClick={() => onToggle(row, 'fulfilOrders')} />
      <PermissionToggle label="Override Prices" on={row.permissions?.overridePrices} onClick={() => onToggle(row, 'overridePrices')} />
      <PermissionToggle label="Edit Invoices"   on={row.permissions?.editInvoices}   onClick={() => onToggle(row, 'editInvoices')} />
      <PermissionToggle
        label="Manage Settings"
        on={row.permissions?.manageSettings}
        onClick={() => onToggle(row, 'manageSettings')}
        disabledReason={row.isLastAdmin ? 'At least one settings admin must remain.' : null}
      />
    </div>
  );
}

function PermissionToggle({ label, on, onClick, disabledReason }) {
  return (
    <button
      type="button"
      className={`user-mgmt-perm-chip ${on ? 'on' : 'off'}`}
      onClick={disabledReason ? undefined : onClick}
      disabled={Boolean(disabledReason)}
      title={disabledReason ?? (on ? 'Click to disable' : 'Click to enable')}
    >
      <span className="user-mgmt-perm-dot">{on ? 'Y' : 'N'}</span>
      {label}
    </button>
  );
}

function AddUserModal({ onClose, onSuccess }) {
  const { addToast } = useApp();
  const [role, setRole] = useState('staff');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [permissions, setPermissions] = useState({
    fulfilOrders: true,
    overridePrices: false,
    editInvoices: false,
    manageSettings: false,
  });
  const [submitting, setSubmitting] = useState(false);
  useModalBehavior(onClose, { enabled: !submitting });

  async function handleSubmit(event) {
    event.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();
    if (!trimmedEmail || !trimmedName) {
      addToast('Email and full name are required.', 'warning');
      return;
    }

    setSubmitting(true);
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      addToast('You must be signed in.', 'warning');
      setSubmitting(false);
      return;
    }

    const isCustomer = role === 'customer';
    const endpoint = isCustomer ? '/api/invite-customer' : '/api/invite-staff';
    const body = isCustomer
      ? { email: trimmedEmail, fullName: trimmedName }
      : { email: trimmedEmail, fullName: trimmedName, role, permissions };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    setSubmitting(false);

    if (!response.ok && !data.warning) {
      addToast(data.error || 'Failed to send invite.', 'warning');
      return;
    }
    if (data.warning) addToast(data.warning, 'warning');

    const successMessage = isCustomer
      ? `Customer ${trimmedEmail} invited. Configure their company & location assignments from the Customers page.`
      : `${role === 'driver' ? 'Driver' : 'Staff'} ${trimmedEmail} invited. They'll receive an email to set their password.`;

    onSuccess(successMessage);
  }

  return (
    <div className="modal-overlay" onClick={submitting ? undefined : handleOverlayClick(onClose)}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Invite User</h3>
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={submitting} aria-label="Close">x</button>
        </div>
        <form className="modal-body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Role</label>
            <div className="role-radio-group">
              {[
                { value: 'staff', label: 'Staff' },
                { value: 'driver', label: 'Driver' },
                { value: 'customer', label: 'Customer' },
              ].map((r) => (
                <label key={r.value} className={`role-radio ${role === r.value ? 'active' : ''}`}>
                  <input
                    type="radio"
                    name="invite-role"
                    value={r.value}
                    checked={role === r.value}
                    onChange={() => setRole(r.value)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              className="form-input"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          {role === 'staff' ? (
            <div className="form-group">
              <label className="form-label">Initial Permissions</label>
              <div className="invite-perm-list">
                {[
                  { key: 'fulfilOrders', label: 'Fulfil Orders' },
                  { key: 'overridePrices', label: 'Override Prices' },
                  { key: 'editInvoices', label: 'Edit Invoices' },
                  { key: 'manageSettings', label: 'Manage Settings' },
                ].map((perm) => (
                  <label key={perm.key} className="invite-perm-row">
                    <input
                      type="checkbox"
                      checked={permissions[perm.key]}
                      onChange={(event) =>
                        setPermissions((cur) => ({ ...cur, [perm.key]: event.target.checked }))
                      }
                    />
                    <span>{perm.label}</span>
                  </label>
                ))}
              </div>
              <p className="form-hint">You can adjust these later by editing the user's row.</p>
            </div>
          ) : null}

          {role === 'customer' ? (
            <div className="alert" style={{ background: 'var(--color-bg-secondary, #f3f4f6)' }}>
              <div className="alert-content">
                <div className="alert-title">Next step</div>
                <div className="alert-description">
                  After invite, configure company and location assignments from the Customers page.
                </div>
              </div>
            </div>
          ) : null}

          <div className="modal-footer">
            <button className="btn btn-ghost" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Sending invite...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
