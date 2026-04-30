import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import AppContext from './appContext';
import {
  AUDIT_LOG,
  BATCHES,
  CLIENT_PRICING,
  CLIENTS,
  CURRENT_USER_ID,
  LOCATIONS,
  ORDERS,
  PRODUCTS,
  QUICKBOOKS_SETTINGS,
  USERS,
  buildReportRowsFromOrders,
  getEffectiveItemPrice,
} from '../data/phaseOneData';
import { buildOperationalNotifications } from '../lib/notifications';
import {
  executeAdminAction,
  executeWorkflowAction,
  fetchAuthIdentity,
  fetchCustomerPortalState,
  fetchRemoteState,
  persistAction,
  persistNotificationDismissals,
  registerCustomerProfile,
  submitCustomerOrder,
} from '../lib/phaseOneDataStore';
import { getSupabaseConfigError, isSupabaseConfigured, supabase } from '../lib/supabaseClient';

const demoState = {
  currentUserId: CURRENT_USER_ID,
  users: USERS,
  products: PRODUCTS,
  clients: CLIENTS,
  locations: LOCATIONS,
  clientPricing: CLIENT_PRICING,
  batches: BATCHES,
  orders: ORDERS,
  auditLog: AUDIT_LOG,
  notificationDismissals: [],
  quickBooksJobs: [],
  customerContacts: [],
  customerPortal: null,
  quickBooks: QUICKBOOKS_SETTINGS,
  reportRows: buildReportRowsFromOrders({
    orders: ORDERS,
    clients: CLIENTS,
    locations: LOCATIONS,
    products: PRODUCTS,
    batches: BATCHES,
  }),
  sidebarCollapsed: false,
  toasts: [],
  initialized: true,
  authConfigured: false,
  authLoading: false,
  isAuthenticated: true,
  authRole: 'staff',
  authError: getSupabaseConfigError(),
};

const remoteBootState = {
  currentUserId: null,
  users: [],
  products: [],
  clients: [],
  locations: [],
  clientPricing: [],
  batches: [],
  orders: [],
  auditLog: [],
  notificationDismissals: [],
  quickBooksJobs: [],
  customerContacts: [],
  customerPortal: null,
  quickBooks: QUICKBOOKS_SETTINGS,
  reportRows: [],
  sidebarCollapsed: false,
  toasts: [],
  initialized: false,
  authConfigured: true,
  authLoading: true,
  isAuthenticated: false,
  authRole: null,
  authError: null,
};

const initialState = isSupabaseConfigured ? remoteBootState : demoState;

function applyAssignments(order, batches, assignments, timestamp) {
  const nextBatchesById = new Map(batches.map((batch) => [batch.id, { ...batch }]));
  let acceptedQty = 0;

  const nextItems = order.items.map((item) => {
    const itemAssignments = assignments.filter((assignment) => assignment.orderItemId === item.id);
    const nextAssignedBatches = [...item.assignedBatches];
    let remainingToAssign = Math.max(item.quantity - item.fulfilledQty - (item.declinedQty ?? 0), 0);
    let acceptedForItem = 0;

    itemAssignments.forEach((assignment) => {
      const batch = nextBatchesById.get(assignment.batchId);
      const requestedQty = Number(assignment.qty) || 0;

      if (!batch || batch.productId !== item.productId || batch.qtyRemaining <= 0 || requestedQty <= 0 || remainingToAssign <= 0) {
        return;
      }

      const accepted = Math.min(requestedQty, batch.qtyRemaining, remainingToAssign);

      if (accepted <= 0) return;

      batch.qtyRemaining -= accepted;
      batch.status = batch.qtyRemaining <= 0 ? 'cleared' : 'active';
      remainingToAssign -= accepted;
      acceptedForItem += accepted;
      acceptedQty += accepted;
      nextAssignedBatches.push({ batchId: assignment.batchId, qty: accepted });
    });

    return {
      ...item,
      fulfilledQty: item.fulfilledQty + acceptedForItem,
      assignedBatches: nextAssignedBatches,
    };
  });

  const fullyFulfilled = nextItems.every((item) => item.fulfilledQty >= item.quantity);
  const partiallyFulfilled = nextItems.some((item) => item.fulfilledQty > 0);

  return {
    order: {
      ...order,
      items: nextItems,
      status: fullyFulfilled ? 'fulfilled' : partiallyFulfilled ? 'partial' : order.status,
      fulfilledAt: acceptedQty > 0 ? timestamp : order.fulfilledAt,
      lockedBy: null,
      lockedAt: null,
    },
    batches: batches.map((batch) => nextBatchesById.get(batch.id) ?? batch),
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'INITIALIZE_REMOTE_DATA':
      return {
        ...state,
        ...action.payload.data,
        currentUserId: action.payload.currentUserId,
        initialized: true,
        authLoading: false,
        isAuthenticated: true,
        authRole: 'staff',
        customerPortal: null,
        authError: null,
      };
    case 'INITIALIZE_CUSTOMER_PORTAL':
      return {
        ...state,
        currentUserId: action.payload.currentUserId,
        users: [],
        products: [],
        clients: [],
        locations: [],
        clientPricing: [],
        batches: [],
        orders: [],
        auditLog: [],
        notificationDismissals: [],
        quickBooksJobs: [],
        quickBooks: QUICKBOOKS_SETTINGS,
        reportRows: [],
        customerPortal: action.payload.data,
        initialized: true,
        authLoading: false,
        isAuthenticated: true,
        authRole: 'customer',
        authError: null,
      };
    case 'SET_AUTH_STATUS':
      return {
        ...state,
        ...action.payload,
      };
    case 'UPSERT_NOTIFICATION_DISMISSALS': {
      const nextByKey = new Map(
        state.notificationDismissals.map((dismissal) => [dismissal.notificationKey, dismissal])
      );

      action.payload.forEach((dismissal) => {
        nextByKey.set(dismissal.notificationKey, dismissal);
      });

      return {
        ...state,
        notificationDismissals: Array.from(nextByKey.values()).sort(
          (left, right) => new Date(right.dismissedAt) - new Date(left.dismissedAt)
        ),
      };
    }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };
    case 'SET_CURRENT_USER':
      return { ...state, currentUserId: action.payload };
    case 'ADD_PRODUCT':
      return { ...state, products: [...state.products, action.payload] };
    case 'UPDATE_PRODUCT':
      return {
        ...state,
        products: state.products.map((product) =>
          product.id === action.payload.id ? { ...product, ...action.payload } : product
        ),
      };
    case 'ADD_CLIENT':
      return { ...state, clients: [...state.clients, action.payload] };
    case 'UPDATE_CLIENT':
      return {
        ...state,
        clients: state.clients.map((client) =>
          client.id === action.payload.id ? { ...client, ...action.payload } : client
        ),
      };
    case 'ADD_LOCATION':
      return { ...state, locations: [...state.locations, action.payload] };
    case 'UPDATE_LOCATION':
      return {
        ...state,
        locations: state.locations.map((location) =>
          location.id === action.payload.id ? { ...location, ...action.payload } : location
        ),
      };
    case 'SET_CLIENT_PRICING': {
      const existing = state.clientPricing.find(
        (pricing) =>
          pricing.clientId === action.payload.clientId && pricing.productId === action.payload.productId
      );

      if (!existing) {
        return { ...state, clientPricing: [...state.clientPricing, action.payload] };
      }

      return {
        ...state,
        clientPricing: state.clientPricing.map((pricing) =>
          pricing.clientId === action.payload.clientId && pricing.productId === action.payload.productId
            ? { ...pricing, ...action.payload }
            : pricing
        ),
      };
    }
    case 'UPDATE_CUSTOMER_CONTACT':
      return {
        ...state,
        customerContacts: state.customerContacts.map((contact) =>
          contact.userId === action.payload.userId ? { ...contact, ...action.payload } : contact
        ),
      };
    case 'ADD_BATCH':
    case 'LOG_PRODUCTION_BATCH':
      return { ...state, batches: [...state.batches, action.payload] };
    case 'UPDATE_BATCH':
      return {
        ...state,
        batches: state.batches.map((batch) =>
          batch.id === action.payload.id ? { ...batch, ...action.payload } : batch
        ),
      };
    case 'ADD_ORDER':
      return { ...state, orders: [action.payload, ...state.orders] };
    case 'LOCK_ORDER':
      return {
        ...state,
        orders: state.orders.map((order) => {
          if (order.id !== action.payload.orderId) return order;
          if (order.lockedBy && order.lockedBy !== action.payload.userId) return order;
          return { ...order, lockedBy: action.payload.userId, lockedAt: action.payload.lockedAt };
        }),
      };
    case 'UNLOCK_ORDER':
      return {
        ...state,
        orders: state.orders.map((order) => {
          if (order.id !== action.payload.orderId) return order;
          if (action.payload.userId && order.lockedBy && order.lockedBy !== action.payload.userId) return order;
          return { ...order, lockedBy: null, lockedAt: null };
        }),
      };
    case 'APPLY_FULFILMENT': {
      const order = state.orders.find((entry) => entry.id === action.payload.orderId);
      if (!order) return state;
      if (order.lockedBy && order.lockedBy !== action.payload.userId) return state;
      const result = applyAssignments(order, state.batches, action.payload.assignments, action.payload.timestamp);
      return {
        ...state,
        orders: state.orders.map((entry) => (entry.id === action.payload.orderId ? result.order : entry)),
        batches: result.batches,
      };
    }
    case 'APPLY_FULFILMENT_AND_DECLINE_REMAINING': {
      const order = state.orders.find((entry) => entry.id === action.payload.orderId);
      if (!order) return state;
      if (order.lockedBy && order.lockedBy !== action.payload.userId) return state;

      const result = applyAssignments(order, state.batches, action.payload.assignments, action.payload.timestamp);
      const nextOrder = {
        ...result.order,
        status: 'fulfilled',
        declineReason: action.payload.reason,
        declinedAt: action.payload.timestamp,
        items: result.order.items.map((item) => ({
          ...item,
          declinedQty: (item.declinedQty ?? 0) + Math.max(item.quantity - item.fulfilledQty - (item.declinedQty ?? 0), 0),
        })),
      };

      return {
        ...state,
        orders: state.orders.map((entry) => (entry.id === action.payload.orderId ? nextOrder : entry)),
        batches: result.batches,
      };
    }
    case 'DECLINE_ORDER':
      return {
        ...state,
        orders: state.orders.map((order) =>
          order.id === action.payload.orderId
            ? {
                ...order,
                status: 'declined',
                declineReason: action.payload.reason,
                declinedAt: action.payload.timestamp,
                lockedBy: null,
                lockedAt: null,
              }
            : order
        ),
      };
    case 'CREATE_INVOICE':
      return {
        ...state,
        orders: state.orders.map((order) => {
          if (order.id !== action.payload.orderId) return order;

          const nextItems = order.items.map((item) => {
            const override = action.payload.overrides.find((entry) => entry.orderItemId === item.id);
            if (!override) return item;
            return {
              ...item,
              overridePrice: override.overridePrice,
              overrideReason: override.overrideReason,
            };
          });

          const invoiceTotal = nextItems.reduce((sum, item) => sum + item.fulfilledQty * getEffectiveItemPrice(item), 0);

          return {
            ...order,
            items: nextItems,
            status: 'invoiced',
            invoiceNumber: action.payload.invoiceNumber,
            invoiceTotal,
            invoicedAt: action.payload.timestamp,
            invoiceEmailSentAt: action.payload.invoiceEmailSentAt,
          };
        }),
      };
    case 'PUSH_QB_INVOICE':
      return {
        ...state,
        orders: state.orders.map((order) =>
          order.id === action.payload.orderId
            ? {
                ...order,
                qbInvoiceNumber: action.payload.qbInvoiceNumber,
                qbSyncStatus: 'pushed',
                qbSyncedAt: action.payload.timestamp,
              }
            : order
        ),
        quickBooks: {
          ...state.quickBooks,
          lastSyncAt: action.payload.timestamp,
          nextInvoiceSequence: state.quickBooks.nextInvoiceSequence + 1,
          status: 'connected',
        },
      };
    case 'QUEUE_QB_INVOICE':
      return {
        ...state,
        orders: state.orders.map((order) =>
          order.id === action.payload.orderId
            ? {
                ...order,
                qbSyncStatus: 'pending',
              }
            : order
        ),
        quickBooksJobs: [
          {
            id: `qb-job-${Date.now()}`,
            orderId: action.payload.orderId,
            jobType: 'invoice',
            status: 'pending',
            attempts: 0,
            createdAt: action.payload.timestamp,
            updatedAt: action.payload.timestamp,
          },
          ...state.quickBooksJobs.filter((job) => job.orderId !== action.payload.orderId || job.status === 'pushed'),
        ],
      };
    case 'CONFIRM_SHIPMENT':
      return {
        ...state,
        orders: state.orders.map((order) =>
          order.id === action.payload.orderId
            ? {
                ...order,
                status: 'shipped',
                shippedAt: action.payload.timestamp,
                packingSlipNumber: action.payload.packingSlipNumber,
                packingSlipSentAt: action.payload.packingSlipSentAt,
              }
            : order
        ),
      };
    case 'UPDATE_USER':
      return {
        ...state,
        users: state.users.map((user) =>
          user.id === action.payload.id
            ? {
                ...user,
                ...action.payload,
                permissions: {
                  ...user.permissions,
                  ...(action.payload.permissions ?? {}),
                },
              }
            : user
        ),
      };
    case 'UPDATE_QB_SETTINGS':
      return { ...state, quickBooks: { ...state.quickBooks, ...action.payload } };
    case 'ADD_AUDIT':
      return { ...state, auditLog: [action.payload, ...state.auditLog] };
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.payload] };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter((toast) => toast.id !== action.payload) };
    default:
      return state;
  }
}

const localOnlyActions = new Set(['TOGGLE_SIDEBAR', 'ADD_TOAST', 'REMOVE_TOAST']);
const serverWorkflowActions = new Set([
  'LOCK_ORDER',
  'UNLOCK_ORDER',
  'APPLY_FULFILMENT',
  'APPLY_FULFILMENT_AND_DECLINE_REMAINING',
  'DECLINE_ORDER',
  'CREATE_INVOICE',
  'PUSH_QB_INVOICE',
  'QUEUE_QB_INVOICE',
  'CONFIRM_SHIPMENT',
  'LOG_PRODUCTION_BATCH',
]);
const serverAdminActions = new Set([
  'ADD_PRODUCT',
  'UPDATE_PRODUCT',
  'ADD_CLIENT',
  'UPDATE_CLIENT',
  'ADD_LOCATION',
  'UPDATE_LOCATION',
  'SET_CLIENT_PRICING',
  'UPDATE_CUSTOMER_CONTACT',
  'UPDATE_USER',
  'UPDATE_QB_SETTINGS',
]);

function buildLocalNotificationDismissals(userId, notificationKeys) {
  return notificationKeys.map((notificationKey) => ({
    userId,
    notificationKey,
    dismissedAt: new Date().toISOString(),
  }));
}

function isMissingNotificationDismissalsTable(error) {
  const message = error?.message ?? '';
  return (
    error?.code === 'PGRST205' ||
    message.includes('notification_dismissals') && message.includes('schema cache')
  );
}

export function AppProvider({ children }) {
  const [state, baseDispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const currentUser = state.users.find((user) => user.id === state.currentUserId) ?? state.users[0] ?? null;
  const notifications = useMemo(() => {
    const activeNotifications = buildOperationalNotifications({
      orders: state.orders,
      batches: state.batches,
      auditLog: state.auditLog,
      clients: state.clients,
      locations: state.locations,
      products: state.products,
    });
    const dismissedKeys = new Set(state.notificationDismissals.map((dismissal) => dismissal.notificationKey));

    return activeNotifications.filter((notification) => !dismissedKeys.has(notification.key));
  }, [
    state.auditLog,
    state.batches,
    state.clients,
    state.locations,
    state.notificationDismissals,
    state.orders,
    state.products,
  ]);

  const loadRemoteData = useCallback(async (userId) => {
    if (!supabase) return;

    const data = await fetchRemoteState(supabase, userId);
    baseDispatch({
      type: 'INITIALIZE_REMOTE_DATA',
      payload: {
        data,
        currentUserId: userId,
      },
    });
  }, []);

  const loadCustomerPortalData = useCallback(async (user) => {
    if (!supabase) return;

    const data = await fetchCustomerPortalState(supabase, user);
    baseDispatch({
      type: 'INITIALIZE_CUSTOMER_PORTAL',
      payload: {
        data,
        currentUserId: user.id,
      },
    });
  }, []);

  const loadAuthenticatedUser = useCallback(
    async (user) => {
      if (!supabase) return;

      const identity = await fetchAuthIdentity(supabase, user.id);

      if (identity === 'staff') {
        await loadRemoteData(user.id);
        return;
      }

      await loadCustomerPortalData(user);
    },
    [loadCustomerPortalData, loadRemoteData]
  );

  const handleRemoteBootstrapError = useCallback((userId, fetchError) => {
    baseDispatch({
      type: 'SET_AUTH_STATUS',
      payload: {
        initialized: true,
        authLoading: false,
        isAuthenticated: false,
        authError: fetchError.message,
        currentUserId: userId,
        authRole: null,
      },
    });
  }, []);

  useEffect(() => {
    if (!supabase) return undefined;

    let active = true;

    async function initialiseAuth() {
      const { data, error } = await supabase.auth.getSession();

      if (!active) return;

      if (error) {
        baseDispatch({
          type: 'SET_AUTH_STATUS',
          payload: {
            initialized: true,
            authLoading: false,
            isAuthenticated: false,
            authError: error.message,
            currentUserId: null,
          },
        });
        return;
      }

      if (!data.session) {
        baseDispatch({
          type: 'SET_AUTH_STATUS',
          payload: {
            initialized: true,
            authLoading: false,
            isAuthenticated: false,
            authError: null,
            currentUserId: null,
          },
        });
        return;
      }

      try {
        await loadAuthenticatedUser(data.session.user);
      } catch (fetchError) {
          handleRemoteBootstrapError(data.session.user.id, fetchError);
      }
    }

    initialiseAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      // Refresh bootstrapping is already handled by getSession() above.
      // Avoid awaiting Supabase reads inside the auth callback to prevent lockups.
      if (event === 'INITIAL_SESSION') return;

      if (!session) {
        baseDispatch({
          type: 'SET_AUTH_STATUS',
          payload: {
            initialized: true,
            authLoading: false,
            isAuthenticated: false,
            authError: null,
            currentUserId: null,
            authRole: null,
            users: [],
            products: [],
            clients: [],
            locations: [],
            clientPricing: [],
            batches: [],
            orders: [],
            auditLog: [],
            notificationDismissals: [],
            quickBooksJobs: [],
            customerContacts: [],
            customerPortal: null,
            quickBooks: QUICKBOOKS_SETTINGS,
            reportRows: [],
          },
        });
        return;
      }

      setTimeout(() => {
        if (!active) return;

        loadAuthenticatedUser(session.user).catch((fetchError) => {
          if (!active) return;
          handleRemoteBootstrapError(session.user.id, fetchError);
        });
      }, 0);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [handleRemoteBootstrapError, loadAuthenticatedUser]);

  const addToast = useCallback((message, type = 'success') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    baseDispatch({ type: 'ADD_TOAST', payload: { id, message, type } });

    setTimeout(() => {
      baseDispatch({ type: 'REMOVE_TOAST', payload: id });
    }, 3500);
  }, []);

  const addAudit = useCallback(
    ({ action, orderId = null, clientId = null, details, previousValue = null, newValue = null, userId, userName }) => {
      const currentState = stateRef.current;
      const order = orderId ? currentState.orders.find((entry) => entry.id === orderId) : null;
      const nextAudit = {
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        action,
        orderId,
        clientId: clientId ?? order?.clientId ?? null,
        userId: userId ?? currentState.currentUserId,
        userName: userName ?? currentState.users.find((entry) => entry.id === currentState.currentUserId)?.name ?? 'Unknown user',
        details,
        previousValue,
        newValue,
      };

      baseDispatch({
        type: 'ADD_AUDIT',
        payload: nextAudit,
      });

      if (supabase) {
        persistAction(supabase, { type: 'ADD_AUDIT', payload: nextAudit }, currentState, {
          ...currentState,
          auditLog: [nextAudit, ...currentState.auditLog],
        }).then(({ error }) => {
          if (error) addToast(`Audit sync failed: ${error.message}`, 'warning');
        });
      }
    },
    [addToast]
  );

  const login = useCallback(async ({ email, password }) => {
    if (!supabase) {
      return { ok: false, error: getSupabaseConfigError() };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }, []);

  const signUpCustomer = useCallback(async ({ email, password, fullName }) => {
    if (!supabase) {
      return { ok: false, error: getSupabaseConfigError() };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          account_type: 'customer',
        },
      },
    });

    if (error) return { ok: false, error: error.message };

    if (!data.session) {
      return {
        ok: true,
        needsEmailConfirmation: true,
      };
    }

    const { error: registerError } = await registerCustomerProfile(supabase, fullName);
    if (registerError) return { ok: false, error: registerError.message };

    await loadCustomerPortalData(data.session.user);
    return { ok: true };
  }, [loadCustomerPortalData]);

  const completeCustomerProfile = useCallback(async (fullName) => {
    if (!supabase) {
      return { ok: false, error: getSupabaseConfigError() };
    }

    const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) return { ok: false, error: sessionError.message };
    if (!sessionResult.session) return { ok: false, error: 'No customer session is active.' };

    const { error } = await registerCustomerProfile(supabase, fullName);
    if (error) return { ok: false, error: error.message };

    await loadCustomerPortalData(sessionResult.session.user);
    return { ok: true };
  }, [loadCustomerPortalData]);

  const submitPortalOrder = useCallback(async ({ clientId, locationId, items }) => {
    if (!supabase) {
      return { ok: false, error: getSupabaseConfigError() };
    }

    const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) return { ok: false, error: sessionError.message };
    if (!sessionResult.session) return { ok: false, error: 'No customer session is active.' };

    const { error } = await submitCustomerOrder(supabase, { clientId, locationId, items });
    if (error) return { ok: false, error: error.message };

    await loadCustomerPortalData(sessionResult.session.user);
    return { ok: true };
  }, [loadCustomerPortalData]);

  const logout = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const dismissNotification = useCallback(
    async (notificationKey) => {
      if (!notificationKey || !stateRef.current.currentUserId) return { ok: true };

      if (!supabase) {
        baseDispatch({
          type: 'UPSERT_NOTIFICATION_DISMISSALS',
          payload: [
            {
              userId: stateRef.current.currentUserId,
              notificationKey,
              dismissedAt: new Date().toISOString(),
            },
          ],
        });
        return { ok: true };
      }

      const { data, error } = await persistNotificationDismissals(
        supabase,
        stateRef.current.currentUserId,
        [notificationKey]
      );

      if (error) {
        if (isMissingNotificationDismissalsTable(error)) {
          baseDispatch({
            type: 'UPSERT_NOTIFICATION_DISMISSALS',
            payload: buildLocalNotificationDismissals(stateRef.current.currentUserId, [notificationKey]),
          });
          return { ok: true };
        }

        addToast(`Notification clear failed: ${error.message}`, 'warning');
        return { ok: false, error };
      }

      baseDispatch({
        type: 'UPSERT_NOTIFICATION_DISMISSALS',
        payload:
          data.length > 0
            ? data
            : [
                ...buildLocalNotificationDismissals(stateRef.current.currentUserId, [notificationKey]),
              ],
      });

      return { ok: true };
    },
    [addToast]
  );

  const clearNotifications = useCallback(async () => {
    if (!notifications.length) return { ok: true };

    const notificationKeys = notifications.map((notification) => notification.key);

    if (!supabase || !stateRef.current.currentUserId) {
      baseDispatch({
        type: 'UPSERT_NOTIFICATION_DISMISSALS',
        payload: notificationKeys.map((notificationKey) => ({
          userId: stateRef.current.currentUserId,
          notificationKey,
          dismissedAt: new Date().toISOString(),
        })),
      });
      return { ok: true };
    }

    const { data, error } = await persistNotificationDismissals(
      supabase,
      stateRef.current.currentUserId,
      notificationKeys
    );

    if (error) {
      if (isMissingNotificationDismissalsTable(error)) {
        baseDispatch({
          type: 'UPSERT_NOTIFICATION_DISMISSALS',
          payload: buildLocalNotificationDismissals(stateRef.current.currentUserId, notificationKeys),
        });
        return { ok: true };
      }

      addToast(`Notification clear failed: ${error.message}`, 'warning');
      return { ok: false, error };
    }

    baseDispatch({
      type: 'UPSERT_NOTIFICATION_DISMISSALS',
      payload:
        data.length > 0
          ? data
          : buildLocalNotificationDismissals(stateRef.current.currentUserId, notificationKeys),
    });

    return { ok: true };
  }, [addToast, notifications]);

  const dispatch = useCallback(
    async (action) => {
      if (!supabase || localOnlyActions.has(action.type) || (action.type === 'SET_CURRENT_USER' && !stateRef.current.authConfigured)) {
        baseDispatch(action);
        return { ok: true };
      }

      if (action.type === 'SET_CURRENT_USER') {
        return { ok: true };
      }

      const previousState = stateRef.current;

      if (serverWorkflowActions.has(action.type) || serverAdminActions.has(action.type)) {
        const currentUser = previousState.users.find((user) => user.id === previousState.currentUserId);

        if (!currentUser) {
          const error = new Error('No authenticated user is available for this action.');
          addToast(error.message, 'warning');
          return { ok: false, error };
        }

        const { error } = serverWorkflowActions.has(action.type)
          ? await executeWorkflowAction(supabase, action, currentUser)
          : await executeAdminAction(supabase, action, currentUser, previousState);

        if (error) {
          addToast(`Save failed: ${error.message}`, 'warning');
          return { ok: false, error };
        }

        if (previousState.currentUserId) {
          try {
            await loadRemoteData(previousState.currentUserId);
          } catch (reloadError) {
            addToast(`Reload failed: ${reloadError.message}`, 'warning');
            return { ok: false, error: reloadError };
          }
        }

        return { ok: true };
      }

      const nextState = reducer(previousState, action);
      baseDispatch(action);

      const { error } = await persistAction(supabase, action, previousState, nextState);

      if (error) {
        addToast(`Save failed: ${error.message}`, 'warning');
        try {
          if (previousState.currentUserId) {
            await loadRemoteData(previousState.currentUserId);
          }
        } catch (reloadError) {
          addToast(`Reload failed: ${reloadError.message}`, 'warning');
        }
        return { ok: false, error };
      }

      return { ok: true };
    },
    [addToast, loadRemoteData]
  );

  const value = useMemo(
    () => ({
      state: {
        ...state,
        currentUser,
        notifications,
      },
      dispatch,
      addToast,
      addAudit,
      login,
      logout,
      dismissNotification,
      clearNotifications,
      signUpCustomer,
      completeCustomerProfile,
      submitPortalOrder,
    }),
    [
      state,
      currentUser,
      notifications,
      dispatch,
      addToast,
      addAudit,
      login,
      logout,
      dismissNotification,
      clearNotifications,
      signUpCustomer,
      completeCustomerProfile,
      submitPortalOrder,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
