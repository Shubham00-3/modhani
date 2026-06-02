import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Building2,
  Briefcase,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  FlaskConical,
  KeyRound,
  LayoutDashboard,
  Lock,
  Mail,
  MapPin,
  Minus,
  Package,
  Pencil,
  Phone,
  Power,
  PowerOff,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Truck,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/useApp';
import { supabase } from '../../lib/supabaseClient';
import { formatDateTime } from '../../data/phaseOneData';
import { useModalBehavior, handleOverlayClick } from '../../hooks/useModalBehavior';

const ROLE_LABEL = { staff: 'Staff', driver: 'Driver', customer: 'Customer' };
const ROLE_ICON = { staff: Briefcase, driver: Truck, customer: ShoppingBag };

// Roles outside the canonical staff/driver/customer set (admin/operations/
// billing from seed data) fall back to a title-cased label.
function roleLabel(role) {
  return ROLE_LABEL[role] ?? (role ? role[0].toUpperCase() + role.slice(1) : 'User');
}

// Date-only formatter (the Joined field is a DATE, so avoid a midnight time).
function formatDateOnly(value) {
  if (!value) return null;
  const raw = String(value);
  const date = new Date(raw.length <= 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

// The four editable staff permission flags, used for both the toggle editor
// and the granted/restricted summary in the detail panel.
const PERM_FIELDS = [
  { key: 'fulfilOrders', label: 'Fulfil Orders' },
  { key: 'overridePrices', label: 'Override Prices' },
  { key: 'editInvoices', label: 'Edit Invoices' },
  { key: 'manageSettings', label: 'Manage Settings' },
];

// Short human description of what each role can do, shown in Access Roles.
const ROLE_DESCRIPTIONS = {
  admin: 'Full system access and configuration',
  operations: 'Orders, fulfilment, and inventory',
  billing: 'Invoicing and pricing',
  staff: 'Operational access to orders and inventory',
  driver: 'Delivery routes and proof of delivery',
  customer: 'Places and tracks orders via the portal',
};

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'locked', label: 'Locked' },
  { value: 'staff', label: 'Staff' },
  { value: 'driver', label: 'Drivers' },
  { value: 'customer', label: 'Customers' },
];

// Initials for the avatar disc (first + last name, or first two letters).
function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending invites' },
  { value: 'locked', label: 'Locked' },
  { value: 'disabled', label: 'Disabled' },
];

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'role', label: 'Role' },
  { value: 'status', label: 'Status' },
];

// Derive the filter/sort status bucket for a row from its existing flags.
function rowStatus(row) {
  if (isLoginLockout(row)) return 'locked';
  if (row.disabled) return 'disabled';
  if (row.status === 'pending') return 'pending';
  return 'active';
}

const ROLE_SORT_ORDER = { staff: 0, driver: 1, customer: 2 };

const MATRIX_ROLES = [
  { key: 'admin', label: 'Admin', icon: ShieldCheck },
  { key: 'driver', label: 'Driver', icon: Truck },
  { key: 'staff', label: 'Staff', icon: Briefcase },
  { key: 'customer', label: 'Customer', icon: ShoppingBag },
];

const MATRIX_MODULES = [
  {
    label: 'Overview',
    icon: LayoutDashboard,
    access: { admin: 'full', driver: 'limited', staff: 'full', customer: 'limited' },
  },
  {
    label: 'Orders & Invoicing',
    icon: ShoppingCart,
    access: { admin: 'full', driver: 'limited', staff: 'full', customer: 'limited' },
  },
  {
    label: 'Production & Lots',
    icon: FlaskConical,
    access: { admin: 'full', driver: 'none', staff: 'limited', customer: 'none' },
  },
  {
    label: 'Inventory',
    icon: Package,
    access: { admin: 'full', driver: 'none', staff: 'full', customer: 'none' },
  },
  {
    label: 'Reports',
    icon: BarChart3,
    access: { admin: 'full', driver: 'none', staff: 'limited', customer: 'none' },
  },
  {
    label: 'Audit Trail',
    icon: ScrollText,
    access: { admin: 'full', driver: 'none', staff: 'none', customer: 'none' },
  },
  {
    label: 'Clients & Locations',
    icon: Building2,
    access: { admin: 'full', driver: 'none', staff: 'limited', customer: 'none' },
  },
  {
    label: 'Customers',
    icon: UserRound,
    access: { admin: 'full', driver: 'none', staff: 'limited', customer: 'limited' },
  },
  {
    label: 'Products',
    icon: Package,
    access: { admin: 'full', driver: 'none', staff: 'limited', customer: 'limited' },
  },
  {
    label: 'Settings',
    icon: Settings,
    access: { admin: 'full', driver: 'none', staff: 'none', customer: 'none' },
  },
];

// Click order for editable cells, and the storage key for admin overrides.
// The matrix has no backend table, so admin edits persist locally per-browser.
const ACCESS_CYCLE = { full: 'limited', limited: 'none', none: 'full' };
const ACCESS_LABEL = { full: 'Full access', limited: 'Limited access', none: 'No access' };
const MATRIX_STORAGE_KEY = 'modhani.permissionsMatrix.v1';

function buildDefaultMatrix() {
  const map = {};
  MATRIX_MODULES.forEach((mod) => {
    map[mod.label] = { ...mod.access };
  });
  return map;
}

// Merge any saved admin overrides on top of the hard-coded defaults so new
// modules/roles added in code still show up even on browsers with old saves.
function buildMatrixState() {
  let saved = null;
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(MATRIX_STORAGE_KEY);
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
  }
  const merged = {};
  MATRIX_MODULES.forEach((mod) => {
    merged[mod.label] = { ...mod.access, ...(saved?.[mod.label] ?? {}) };
  });
  return merged;
}

function isLoginLockout(row) {
  return Boolean(row.disabled && (
    Number(row.failedLoginAttempts ?? 0) >= 3
    || /failed sign-in attempts/i.test(row.disabledReason ?? '')
  ));
}

/**
 * Unified user-management table for the Settings page. Lists staff, drivers,
 * and customers; lets settings admins invite new users, send password resets,
 * disable or re-enable users, and edit staff permissions inline.
 */
export default function UserManagementSection({ canManage }) {
  const { state, dispatch, addToast } = useApp();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name-asc');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [hoveredUserId, setHoveredUserId] = useState(null);
  const [pendingActionUserId, setPendingActionUserId] = useState(null);

  const currentUserId = state.currentUser?.id;
  // Only enabled admins count toward the "at least one admin must remain" rule.
  const settingsAdmins = useMemo(
    () => state.users.filter((u) => u.permissions?.manageSettings && !u.disabledAt),
    [state.users]
  );
  const settingsAdminCount = settingsAdmins.length;

  const allRows = useMemo(() => {
    const staffRows = state.users.map((user) => ({
      id: user.id,
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      phone: user.phone ?? null,
      joinedAt: user.joinedAt ?? null,
      status: user.disabledAt ? 'disabled' : 'active',
      disabled: Boolean(user.disabledAt),
      disabledReason: user.disabledReason ?? null,
      failedLoginAttempts: Number(user.failedLoginAttempts ?? 0),
      failedLoginLastAt: user.failedLoginLastAt ?? null,
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
      phone: c.phone ?? null,
      joinedAt: c.createdAt ?? null,
      status: c.status,
      disabled: c.status === 'disabled',
      disabledReason: c.status === 'disabled' && Number(c.failedLoginAttempts ?? 0) >= 3
        ? 'Auto-disabled after 3 failed sign-in attempts.'
        : null,
      failedLoginAttempts: Number(c.failedLoginAttempts ?? 0),
      failedLoginLastAt: c.failedLoginLastAt ?? null,
      permissions: null,
      isSelf: false,
      isLastAdmin: false,
    }));
    return [...staffRows, ...customerRows];
  }, [state.users, state.customerContacts, currentUserId, settingsAdminCount]);

  const rows = useMemo(() => {
    let next = allRows;
    if (tab === 'locked') next = next.filter(isLoginLockout);
    else if (tab !== 'all') next = next.filter((row) => row.role === tab);

    if (statusFilter !== 'all') {
      next = next.filter((row) => rowStatus(row) === statusFilter);
    }

    const query = search.trim().toLowerCase();
    if (query) {
      next = next.filter((row) =>
        `${row.name} ${row.email}`.toLowerCase().includes(query)
      );
    }

    const sorted = [...next];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'role':
          return (ROLE_SORT_ORDER[a.role] ?? 9) - (ROLE_SORT_ORDER[b.role] ?? 9)
            || a.name.localeCompare(b.name);
        case 'status':
          return rowStatus(a).localeCompare(rowStatus(b)) || a.name.localeCompare(b.name);
        case 'name-asc':
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [allRows, tab, search, statusFilter, sortBy]);

  // The detail pane is hidden until a row is hovered or clicked. Hover gives a
  // live preview; a click "pins" the selection so it stays open after the
  // cursor leaves. The active row is the hovered one, or the pinned one.
  const activeUserId = hoveredUserId ?? selectedUserId;
  const activeRow = useMemo(
    () => allRows.find((row) => row.userId === activeUserId) ?? null,
    [allRows, activeUserId]
  );
  const isPanelOpen = Boolean(activeRow);
  const panelRow = activeRow;

  // Headline counts for the stat strip — all derived from existing user data.
  const stats = useMemo(() => ({
    total: allRows.length,
    active: allRows.filter((row) => !row.disabled).length,
    locked: allRows.filter(isLoginLockout).length,
    drivers: allRows.filter((row) => row.role === 'driver').length,
    staff: allRows.filter((row) => row.role === 'staff').length,
    customers: allRows.filter((row) => row.role === 'customer').length,
  }), [allRows]);

  const tabCounts = useMemo(() => ({
    all: allRows.length,
    locked: allRows.filter(isLoginLockout).length,
    staff: allRows.filter((row) => row.role === 'staff').length,
    driver: allRows.filter((row) => row.role === 'driver').length,
    customer: allRows.filter((row) => row.role === 'customer').length,
  }), [allRows]);

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
    const loginLocked = isLoginLockout(row);
    const confirmed = window.confirm(
      loginLocked
        ? `Unlock ${row.email} and send a password reset link so they can set a new password?`
        : `Send a password reset email to ${row.email}?`
    );
    if (!confirmed) return;
    setPendingActionUserId(row.userId);
    const { ok, data } = await callAdminApi('/api/reset-user-password', { email: row.email });
    setPendingActionUserId(null);
    if (ok) {
      if (data?.reenabled) {
        await dispatch({
          type: 'SET_USER_DISABLED',
          payload: {
            userId: row.userId,
            role: row.role,
            disabled: false,
            disabledAt: null,
            disabledReason: null,
            failedLoginAttempts: 0,
            failedLoginLastAt: null,
          },
        });
      }
      addToast(data?.reenabled
        ? `${ROLE_LABEL[row.role]} ${row.email} unlocked and password reset link sent.`
        : `Password reset email sent to ${row.email}.`);
    }
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
    const { ok, data } = await callAdminApi('/api/set-user-disabled', {
      userId: row.userId,
      disabled: turningOff,
    });
    setPendingActionUserId(null);
    if (ok) {
      await dispatch({
        type: 'SET_USER_DISABLED',
        payload: {
          userId: row.userId,
          role: row.role,
          disabled: turningOff,
          disabledAt: data?.disabledAt,
        },
      });
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
    <div className="settings-user-grid">
    <div className="card user-mgmt-card">
      <div className="user-mgmt-header">
        <div className="user-mgmt-titleblock">
          <div className="card-title">
            <Users size={18} /> User Management
          </div>
          <p className="user-mgmt-subtitle">
            Manage system users, roles, and access permissions.
          </p>
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

      <div className="um-stats">
        <UserStat icon={Users} label="Total Users" value={stats.total} />
        <UserStat icon={CheckCircle2} label="Active" value={stats.active} tone="green" />
        <UserStat icon={Lock} label="Locked" value={stats.locked} tone="red" />
        <UserStat icon={Truck} label="Drivers" value={stats.drivers} />
        <UserStat icon={Briefcase} label="Staff" value={stats.staff} />
        <UserStat icon={ShoppingBag} label="Customers" value={stats.customers} />
      </div>

      <div className="um-toolbar">
        <div className="um-search">
          <Search size={15} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by name or email..."
            aria-label="Search users by name or email"
          />
        </div>

        <div className="um-filters">
          <select
            className="um-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            className="um-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort users"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>Sort by: {o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="user-mgmt-tabs">
        {TABS.map((t) => {
          const count = tabCounts[t.value] ?? 0;
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

      <div className={`um-detail-grid ${isPanelOpen ? 'is-open' : 'is-closed'}`}>
        <div
          className="um-list-pane"
          onMouseLeave={() => setHoveredUserId(null)}
        >
          <div className="um-list-pane-head">
            <span className="um-list-count">{rows.length} {rows.length === 1 ? 'user' : 'users'}</span>
            {selectedUserId ? (
              <button
                type="button"
                className="um-list-clear"
                onClick={() => {
                  setSelectedUserId(null);
                  setHoveredUserId(null);
                }}
              >
                Close details
              </button>
            ) : null}
          </div>
          {rows.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <div className="empty-state-title">
                {search.trim() ? 'No users match your search' : 'No users in this view'}
              </div>
              <div className="empty-state-description">
                {search.trim()
                  ? 'Try a different name or email.'
                  : 'Click "Add User" to invite the first one.'}
              </div>
            </div>
          ) : (
            <div className="um-list">
              {rows.map((row) => {
                const isActive = activeRow?.userId === row.userId && activeRow?.role === row.role;
                const isSelected = selectedUserId === row.userId;
                const loginLocked = isLoginLockout(row);
                const RoleIcon = ROLE_ICON[row.role] ?? ShieldCheck;

                return (
                  <button
                    key={`${row.role}:${row.id}`}
                    type="button"
                    className={`um-listrow ${isActive ? 'is-active' : ''} ${isSelected ? 'is-selected' : ''} ${row.disabled ? 'is-disabled' : ''}`}
                    onClick={() => setSelectedUserId(isSelected ? null : row.userId)}
                    onMouseEnter={() => setHoveredUserId(row.userId)}
                    onFocus={() => setHoveredUserId(row.userId)}
                    onBlur={() => setHoveredUserId(null)}
                    aria-pressed={isSelected}
                  >
                    <div className={`um-avatar um-avatar-${row.role}`} aria-hidden="true">
                      {initials(row.name)}
                    </div>
                    <div className="um-listrow-identity">
                      <div className="um-name-line">
                        <span className="um-name">{row.name}</span>
                        {row.isSelf ? <span className="um-self-chip">You</span> : null}
                      </div>
                      <div className="um-email">{row.email}</div>
                    </div>
                    <div className={`um-role-pill um-role-${row.role}`} aria-hidden="true">
                      <RoleIcon size={13} />
                      <span>{roleLabel(row.role)}</span>
                    </div>
                    <div className="um-listrow-status">
                      {loginLocked ? (
                        <span className="um-statusdot um-statusdot-locked">Locked</span>
                      ) : row.disabled ? (
                        <span className="um-statusdot um-statusdot-disabled">Disabled</span>
                      ) : (
                        <span className="um-statusdot um-statusdot-active">Active</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="um-detail-pane" aria-hidden={!isPanelOpen}>
          {panelRow ? (
            <UserDetailPanel
              key={panelRow.userId}
              row={panelRow}
              canManage={canManage}
              isBusy={pendingActionUserId === panelRow.userId}
              onSendReset={handleSendReset}
              onToggleDisabled={handleToggleDisabled}
              onTogglePermission={handleTogglePermission}
            />
          ) : null}
        </div>
      </div>

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

    <PermissionsMatrixCard canManage={canManage} />
    </div>
  );
}

function UserDetailPanel({ row, canManage, isBusy, onSendReset, onToggleDisabled, onTogglePermission }) {
  const { state, dispatch, addToast } = useApp();
  const RoleIcon = ROLE_ICON[row.role] ?? ShieldCheck;
  const loginLocked = isLoginLockout(row);
  const hasPerms = Boolean(row.permissions);

  // Customers live in customer_contacts (not the profiles table), so the
  // profile-edit RPC doesn't apply to them — only staff/driver are editable.
  const canEditProfile = canManage && row.role !== 'customer';
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: row.name ?? '',
    phone: row.phone ?? '',
    joinedAt: row.joinedAt ? String(row.joinedAt).slice(0, 10) : '',
  });

  async function handleSaveProfile() {
    const name = draft.name.trim();
    if (!name) {
      addToast('Full name is required.', 'warning');
      return;
    }
    setSaving(true);
    const result = await dispatch({
      type: 'UPDATE_USER_PROFILE',
      payload: {
        id: row.userId,
        name,
        phone: draft.phone.trim(),
        joinedAt: draft.joinedAt || null,
      },
    });
    setSaving(false);
    if (result?.ok) {
      setEditing(false);
      addToast('Profile updated.');
    }
  }

  const grantedCount = hasPerms ? PERM_FIELDS.filter((p) => row.permissions[p.key]).length : 0;
  const restrictedCount = hasPerms ? PERM_FIELDS.length - grantedCount : 0;

  const recentActivity = useMemo(
    () => (state.auditLog ?? []).filter((entry) => entry.userId === row.userId).slice(0, 4),
    [state.auditLog, row.userId]
  );

  const assignedLocations = useMemo(() => {
    if (row.role !== 'customer') return [];
    const ids = new Set(
      (state.customerLocationAssignments ?? [])
        .filter((a) => a.customerUserId === row.userId)
        .map((a) => a.locationId)
    );
    return (state.locations ?? []).filter((loc) => ids.has(loc.id));
  }, [state.customerLocationAssignments, state.locations, row.role, row.userId]);

  const statusLabel = loginLocked ? 'Locked' : row.disabled ? 'Disabled' : 'Active';
  const statusTone = loginLocked ? 'locked' : row.disabled ? 'disabled' : 'active';

  return (
    <div className="um-detail">
      <div className="um-detail-head">
        <div className={`um-detail-avatar um-avatar-${row.role}`} aria-hidden="true">
          {initials(row.name)}
        </div>
        <div className="um-detail-headmain">
          <div className="um-detail-nameline">
            <h3 className="um-detail-name">{row.name}</h3>
            <span className={`um-detail-statusbadge is-${statusTone}`}>{statusLabel}</span>
            {row.isSelf ? <span className="um-self-chip">You</span> : null}
          </div>
          <div className="um-detail-email">{row.email}</div>
          <div className="um-detail-subline">
            <span className={`um-role-pill um-role-${row.role}`}>
              <RoleIcon size={13} />
              <span>{roleLabel(row.role)}</span>
            </span>
            <span className="um-detail-muted">Last login: Not set</span>
          </div>
        </div>
      </div>

      {loginLocked ? (
        <div className="um-detail-locknote">
          Locked after repeated failed sign-ins. Send an unlock &amp; reset link before this user can sign in again.
        </div>
      ) : null}

      <div className="um-detail-section">
        <div className="um-detail-section-head">
          <div className="um-detail-section-title">Profile</div>
          {canEditProfile && !editing ? (
            <button type="button" className="um-edit-btn" onClick={() => setEditing(true)}>
              <Pencil size={13} /> Edit
            </button>
          ) : null}
        </div>

        {editing ? (
          <div className="um-profile-edit">
            <div className="um-profile-grid">
              <label className="um-edit-field">
                <span className="um-field-label"><UserRound size={13} /> Full Name</span>
                <input
                  className="form-input"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  autoFocus
                />
              </label>
              <div className="um-edit-field">
                <span className="um-field-label"><Mail size={13} /> Email Address</span>
                <div className="um-field-value um-field-readonly">{row.email}</div>
              </div>
              <label className="um-edit-field">
                <span className="um-field-label"><Phone size={13} /> Phone Number</span>
                <input
                  className="form-input"
                  type="tel"
                  value={draft.phone}
                  placeholder="+1 555 123 4567"
                  onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
                />
              </label>
              <label className="um-edit-field">
                <span className="um-field-label"><Calendar size={13} /> Joined</span>
                <input
                  className="form-input"
                  type="date"
                  value={draft.joinedAt}
                  onChange={(e) => setDraft((d) => ({ ...d, joinedAt: e.target.value }))}
                />
              </label>
            </div>
            <div className="um-edit-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  setDraft({
                    name: row.name ?? '',
                    phone: row.phone ?? '',
                    joinedAt: row.joinedAt ? String(row.joinedAt).slice(0, 10) : '',
                  });
                }}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSaveProfile}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="um-profile-grid">
            <Field icon={UserRound} label="Full Name" value={row.name} />
            <Field icon={Mail} label="Email Address" value={row.email} />
            <Field icon={Phone} label="Phone Number" value={row.phone} />
            <Field icon={Calendar} label="Joined" value={formatDateOnly(row.joinedAt)} />
          </div>
        )}
      </div>

      <div className="um-detail-cards">
        <div className="um-detail-card">
          <div className="um-detail-card-title"><ShieldCheck size={15} /> Access Roles</div>
          <div className="um-roleitem">
            <span className={`um-roleitem-icon um-role-${row.role}`}><RoleIcon size={16} /></span>
            <div>
              <div className="um-roleitem-name">{roleLabel(row.role)}</div>
              <div className="um-roleitem-desc">{ROLE_DESCRIPTIONS[row.role] ?? 'Standard access'}</div>
            </div>
          </div>
        </div>

        <div className="um-detail-card">
          <div className="um-detail-card-title"><Check size={15} /> Permissions Summary</div>
          {hasPerms ? (
            <div className="um-permstats">
              <div className="um-permstat">
                <div className="um-permstat-num">{PERM_FIELDS.length}</div>
                <div className="um-permstat-label">Total</div>
              </div>
              <div className="um-permstat is-granted">
                <div className="um-permstat-num">{grantedCount}</div>
                <div className="um-permstat-label">Granted</div>
              </div>
              <div className="um-permstat is-restricted">
                <div className="um-permstat-num">{restrictedCount}</div>
                <div className="um-permstat-label">Restricted</div>
              </div>
            </div>
          ) : (
            <div className="um-detail-muted">No configurable permissions for this role.</div>
          )}
        </div>

        <div className="um-detail-card">
          <div className="um-detail-card-title"><MapPin size={15} /> Assigned Locations</div>
          {assignedLocations.length > 0 ? (
            <div className="um-loc-list">
              {assignedLocations.map((loc) => (
                <div key={loc.id} className="um-loc-item">
                  <MapPin size={14} />
                  <div>
                    <div className="um-loc-name">{loc.name}</div>
                    {loc.city || loc.province ? (
                      <div className="um-loc-sub">{[loc.city, loc.province].filter(Boolean).join(', ')}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="um-detail-muted">Not set</div>
          )}
        </div>

        <div className="um-detail-card">
          <div className="um-detail-card-title"><Clock size={15} /> Recent Activity</div>
          {recentActivity.length > 0 ? (
            <div className="um-activity-list">
              {recentActivity.map((entry) => (
                <div key={entry.id} className="um-activity-item">
                  <span className="um-activity-dot" />
                  <div>
                    <div className="um-activity-text">{entry.details ?? entry.action}</div>
                    <div className="um-activity-time">{formatDateTime(entry.timestamp)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="um-detail-muted">No recent activity recorded.</div>
          )}
        </div>
      </div>

      {hasPerms ? (
        <div className="um-detail-section">
          <div className="um-detail-section-title">
            Permissions{!canManage ? <span className="um-detail-muted"> (read-only)</span> : null}
          </div>
          <div className="um-perm-toggle-grid">
            {PERM_FIELDS.map((field) => {
              const on = Boolean(row.permissions?.[field.key]);
              const lastAdminGuard = field.key === 'manageSettings' && row.isLastAdmin;
              return (
                <PermissionToggle
                  key={field.key}
                  label={field.label}
                  on={on}
                  onClick={() => onTogglePermission(row, field.key)}
                  disabledReason={
                    !canManage
                      ? 'You do not have permission to edit this.'
                      : lastAdminGuard
                        ? 'At least one settings admin must remain.'
                        : null
                  }
                />
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="um-detail-section">
        <div className="um-detail-section-title">Quick Actions</div>
        <div className="um-quick-actions">
          <button
            type="button"
            className="btn btn-ghost um-qa-btn"
            disabled={!canManage || isBusy}
            onClick={() => onSendReset(row)}
          >
            <KeyRound size={15} /> {loginLocked ? 'Unlock & Reset' : 'Reset Password'}
          </button>
          {row.role === 'customer' ? (
            <Link to="/customers" className="btn btn-ghost um-qa-btn">
              <MapPin size={15} /> Assignments
            </Link>
          ) : null}
          <button
            type="button"
            className={`btn um-qa-btn ${row.disabled ? 'btn-primary' : 'um-qa-danger'}`}
            disabled={!canManage || isBusy || (row.isSelf && !row.disabled) || (row.isLastAdmin && !row.disabled)}
            onClick={() => onToggleDisabled(row)}
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
            {row.disabled ? 'Re-enable User' : 'Disable User'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, label, value }) {
  const Icon = icon;
  return (
    <div className="um-field">
      <div className="um-field-label"><Icon size={13} /> {label}</div>
      <div className={`um-field-value ${value ? '' : 'is-empty'}`}>{value || 'Not set'}</div>
    </div>
  );
}

function PermissionsMatrixCard({ canManage }) {
  const { addToast } = useApp();
  const [access, setAccess] = useState(buildMatrixState);

  function persist(next) {
    try {
      window.localStorage.setItem(MATRIX_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be unavailable (private mode); edits still apply in-session.
    }
  }

  function cycleCell(moduleLabel, roleKey) {
    if (!canManage) return;
    setAccess((cur) => {
      const current = cur[moduleLabel]?.[roleKey] ?? 'none';
      const nextLevel = ACCESS_CYCLE[current] ?? 'full';
      const next = {
        ...cur,
        [moduleLabel]: { ...cur[moduleLabel], [roleKey]: nextLevel },
      };
      persist(next);
      return next;
    });
  }

  function resetMatrix() {
    const defaults = buildDefaultMatrix();
    setAccess(defaults);
    try {
      window.localStorage.removeItem(MATRIX_STORAGE_KEY);
    } catch {
      // ignore — state already reset in memory
    }
    addToast('Permissions reset to defaults.');
  }

  const isCustomized = useMemo(
    () => MATRIX_MODULES.some((mod) =>
      MATRIX_ROLES.some((role) => access[mod.label]?.[role.key] !== mod.access[role.key])
    ),
    [access]
  );

  return (
    <div className="card um-matrix-card">
      <div className="um-matrix-head">
        <div>
          <div className="card-title"><ShieldCheck size={18} /> Permissions Overview</div>
          <p className="um-matrix-sub">
            {canManage
              ? 'Click any cell to change what a role can access in Modhani.'
              : 'See what each role can access in Modhani.'}
          </p>
        </div>
        {canManage && isCustomized ? (
          <button type="button" className="btn btn-ghost um-matrix-reset" onClick={resetMatrix}>
            Reset to defaults
          </button>
        ) : null}
      </div>

      <div className="um-matrix-wrap">
        <table className="um-matrix">
          <thead>
            <tr>
              <th className="um-matrix-corner">Module</th>
              {MATRIX_ROLES.map((role) => {
                const RoleIcon = role.icon;
                return (
                  <th key={role.key}>
                    <span className={`um-matrix-rolehead um-matrix-role-${role.key}`}>
                      <RoleIcon size={16} />
                      {role.label}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {MATRIX_MODULES.map((mod) => {
              const ModIcon = mod.icon;
              return (
                <tr key={mod.label}>
                  <td>
                    <span className="um-matrix-module">
                      <ModIcon size={15} />
                      {mod.label}
                    </span>
                  </td>
                  {MATRIX_ROLES.map((role) => {
                    const level = access[mod.label]?.[role.key] ?? 'none';
                    return (
                      <td key={role.key}>
                        {canManage ? (
                          <button
                            type="button"
                            className="um-matrix-cell-btn"
                            onClick={() => cycleCell(mod.label, role.key)}
                            title={`${role.label}: ${ACCESS_LABEL[level]} — click to change`}
                            aria-label={`${mod.label}, ${role.label}: ${ACCESS_LABEL[level]}. Click to change.`}
                          >
                            <MatrixCell level={level} />
                          </button>
                        ) : (
                          <MatrixCell level={level} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="um-matrix-legend">
        <span className="um-legend-item"><Check size={14} className="um-cell-full" /> Full access</span>
        <span className="um-legend-item"><Circle size={14} className="um-cell-limited" /> Limited access</span>
        <span className="um-legend-item"><Minus size={14} className="um-cell-none" /> No access</span>
      </div>
    </div>
  );
}

function MatrixCell({ level }) {
  if (level === 'full') {
    return <Check size={16} className="um-cell-full" aria-label="Full access" />;
  }
  if (level === 'limited') {
    return <Circle size={14} className="um-cell-limited" aria-label="Limited access" />;
  }
  return <Minus size={16} className="um-cell-none" aria-label="No access" />;
}

function UserStat({ icon, label, value, tone }) {
  const Icon = icon;
  return (
    <div className={`um-stat${tone ? ` um-stat-${tone}` : ''}`}>
      <div className="um-stat-icon">
        <Icon size={18} />
      </div>
      <div className="um-stat-body">
        <div className="um-stat-value">{value}</div>
        <div className="um-stat-label">{label}</div>
      </div>
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
