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
  TIERS,
  USERS,
  buildReportRowsFromOrders,
  getEffectiveItemPrice,
  getItemDiscountAmount,
  getInvoiceLineTotal,
  isProductHstApplicable,
  roundCurrency,
  HST_RATE,
} from '../data/phaseOneData';
import { buildOperationalNotifications } from '../lib/notifications';
import {
  executeAdminAction,
  executeWorkflowAction,
  fetchAuthIdentity,
  fetchCustomerPortalState,
  fetchDriverPortalState,
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
  tiers: TIERS,
  batches: BATCHES,
  orders: ORDERS,
  auditLog: AUDIT_LOG,
  notificationDismissals: [],
  quickBooksJobs: [],
  customerContacts: [],
  customerClientAssignments: [],
  customerLocationAssignments: [],
  customerPortal: null,
  quickBooks: QUICKBOOKS_SETTINGS,
  trashReportRows: [],
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
  tiers: [],
  batches: [],
  orders: [],
  auditLog: [],
  notificationDismissals: [],
  quickBooksJobs: [],
  customerContacts: [],
  customerClientAssignments: [],
  customerLocationAssignments: [],
  customerPortal: null,
  quickBooks: QUICKBOOKS_SETTINGS,
  reportRows: [],
  trashReportRows: [],
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

const SIDEBAR_MOBILE_BREAKPOINT = 900;

function getInitialSidebarCollapsed() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(max-width: ${SIDEBAR_MOBILE_BREAKPOINT}px)`).matches;
}

function withViewportDefaults(state) {
  return { ...state, sidebarCollapsed: getInitialSidebarCollapsed() };
}

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

function trimFulfilmentToInvoiceLines(order, batches, lines) {
  const nextBatchesById = new Map(batches.map((batch) => [batch.id, { ...batch }]));
  const linesByItemId = new Map(lines.map((line) => [line.orderItemId, line]));

  const nextItems = order.items.map((item) => {
    const line = linesByItemId.get(item.id);
    if (!line) return item;

    const nextInvoiceQty = Number(line.invoiceQty);
    const currentFulfilledQty = Number(item.fulfilledQty) || 0;
    let qtyToReturn = Math.max(currentFulfilledQty - nextInvoiceQty, 0);
    const nextAssignedBatches = [...item.assignedBatches];

    for (let index = nextAssignedBatches.length - 1; index >= 0 && qtyToReturn > 0; index -= 1) {
      const assigned = nextAssignedBatches[index];
      const assignedQty = Number(assigned.qty) || 0;
      const returnedQty = Math.min(assignedQty, qtyToReturn);
      const batch = nextBatchesById.get(assigned.batchId);

      if (batch) {
        const nextRemainingQty = Math.min(Number(batch.qtyProduced) || 0, (Number(batch.qtyRemaining) || 0) + returnedQty);
        batch.qtyRemaining = nextRemainingQty;
        batch.status = nextRemainingQty > 0 ? 'active' : 'cleared';
      }

      qtyToReturn -= returnedQty;

      if (returnedQty >= assignedQty) {
        nextAssignedBatches.splice(index, 1);
      } else {
        nextAssignedBatches[index] = {
          ...assigned,
          qty: assignedQty - returnedQty,
        };
      }
    }

    const removedFulfilmentQty = Math.max(currentFulfilledQty - nextInvoiceQty, 0);

    return {
      ...item,
      fulfilledQty: Math.min(currentFulfilledQty, nextInvoiceQty),
      invoiceQty: nextInvoiceQty,
      declinedQty: (item.declinedQty ?? 0) + removedFulfilmentQty,
      overridePrice: line.overridePrice,
      overrideReason: line.overrideReason,
      discountAmount: line.discount == null ? (item.discountAmount ?? 0) : Number(line.discount) || 0,
      discountReason: line.discountReason == null ? (item.discountReason ?? '') : line.discountReason,
      assignedBatches: nextAssignedBatches,
    };
  });

  return {
    items: nextItems,
    batches: batches.map((batch) => nextBatchesById.get(batch.id) ?? batch),
  };
}

function buildClientPricingForTier({ clientPricing, clientId, tier }) {
  const otherRows = clientPricing.filter((row) => row.clientId !== clientId);
  if (!tier) return otherRows;
  const tierRows = (tier.products ?? []).map((entry) => ({
    id: `cp-${clientId}-${entry.productId}`,
    clientId,
    productId: entry.productId,
    price: Number(entry.price) || 0,
    isActive: true,
  }));
  return [...otherRows, ...tierRows];
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
    case 'INITIALIZE_DRIVER_PORTAL':
      return {
        ...state,
        ...action.payload.data,
        currentUserId: action.payload.currentUserId,
        customerPortal: null,
        initialized: true,
        authLoading: false,
        isAuthenticated: true,
        authRole: 'driver',
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
      return {
        ...state,
        products: [...state.products, action.payload],
      };
    case 'UPDATE_PRODUCT': {
      const nextProducts = state.products.map((product) =>
        product.id === action.payload.id ? { ...product, ...action.payload } : product
      );

      return {
        ...state,
        products: nextProducts,
      };
    }
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
    case 'SET_USER_DISABLED': {
      const disabledAt = action.payload.disabled ? (action.payload.disabledAt ?? new Date().toISOString()) : null;

      if (action.payload.role === 'customer') {
        return {
          ...state,
          customerContacts: state.customerContacts.map((contact) =>
            contact.userId === action.payload.userId
              ? {
                  ...contact,
                  status: action.payload.disabled ? 'disabled' : 'active',
                  failedLoginAttempts: action.payload.disabled
                    ? (action.payload.failedLoginAttempts ?? contact.failedLoginAttempts ?? 0)
                    : 0,
                  failedLoginLastAt: action.payload.disabled
                    ? (action.payload.failedLoginLastAt ?? contact.failedLoginLastAt ?? null)
                    : null,
                }
              : contact
          ),
        };
      }

      return {
        ...state,
        users: state.users.map((user) =>
          user.id === action.payload.userId
            ? {
                ...user,
                disabledAt,
                disabledReason: action.payload.disabled ? (action.payload.reason ?? user.disabledReason ?? null) : null,
                failedLoginAttempts: action.payload.disabled
                  ? (action.payload.failedLoginAttempts ?? user.failedLoginAttempts ?? 0)
                  : 0,
                failedLoginLastAt: action.payload.disabled
                  ? (action.payload.failedLoginLastAt ?? user.failedLoginLastAt ?? null)
                  : null,
              }
            : user
        ),
      };
    }
    case 'UPDATE_CUSTOMER_ASSIGNMENTS': {
      const { customerUserId, clientIds, locationIds } = action.payload;
      return {
        ...state,
        customerClientAssignments: [
          ...state.customerClientAssignments.filter((a) => a.customerUserId !== customerUserId),
          ...clientIds.map((clientId) => ({ customerUserId, clientId })),
        ],
        customerLocationAssignments: [
          ...state.customerLocationAssignments.filter((a) => a.customerUserId !== customerUserId),
          ...locationIds.map((locationId) => ({ customerUserId, locationId })),
        ],
      };
    }
    case 'UPSERT_TIER': {
      const incoming = {
        id: action.payload.id,
        name: action.payload.name,
        products: (action.payload.products ?? []).map((entry) => ({
          productId: entry.productId,
          price: Number(entry.price) || 0,
        })),
      };

      const exists = state.tiers.some((tier) => tier.id === incoming.id);
      const nextTiers = exists
        ? state.tiers.map((tier) => (tier.id === incoming.id ? { ...tier, ...incoming } : tier))
        : [...state.tiers, incoming];

      let nextClientPricing = state.clientPricing;
      state.clients
        .filter((client) => client.tierId === incoming.id)
        .forEach((client) => {
          nextClientPricing = buildClientPricingForTier({
            clientPricing: nextClientPricing,
            clientId: client.id,
            tier: incoming,
          });
        });

      return { ...state, tiers: nextTiers, clientPricing: nextClientPricing };
    }
    case 'DELETE_TIER': {
      const tierId = action.payload.tierId;
      const affectedClientIds = state.clients
        .filter((client) => client.tierId === tierId)
        .map((client) => client.id);

      let nextClientPricing = state.clientPricing;
      affectedClientIds.forEach((clientId) => {
        nextClientPricing = buildClientPricingForTier({
          clientPricing: nextClientPricing,
          clientId,
          tier: null,
        });
      });

      return {
        ...state,
        tiers: state.tiers.filter((tier) => tier.id !== tierId),
        clients: state.clients.map((client) =>
          client.tierId === tierId ? { ...client, tierId: null } : client
        ),
        clientPricing: nextClientPricing,
      };
    }
    case 'SET_TIER_CLIENT_MEMBERSHIP': {
      const { tierId, clientIds } = action.payload;
      const memberSet = new Set(clientIds);
      const tier = state.tiers.find((entry) => entry.id === tierId);
      if (!tier) return state;

      let nextClientPricing = state.clientPricing;

      const nextClients = state.clients.map((client) => {
        // Newly added or kept on the tier.
        if (memberSet.has(client.id)) {
          if (client.tierId !== tierId) {
            nextClientPricing = buildClientPricingForTier({
              clientPricing: nextClientPricing,
              clientId: client.id,
              tier,
            });
          }
          return { ...client, tierId };
        }
        // Was on this tier, now removed.
        if (client.tierId === tierId) {
          nextClientPricing = buildClientPricingForTier({
            clientPricing: nextClientPricing,
            clientId: client.id,
            tier: null,
          });
          return { ...client, tierId: null };
        }
        return client;
      });

      return { ...state, clients: nextClients, clientPricing: nextClientPricing };
    }
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
            const product = state.products.find((entry) => entry.id === item.productId);
            const hstApplicable = isProductHstApplicable(product);
            const withInvoice = !override
              ? {
                  ...item,
                  invoiceQty: item.fulfilledQty,
                  discountAmount: item.discountAmount ?? 0,
                  discountReason: item.discountReason ?? '',
                }
              : {
                  ...item,
                  invoiceQty: item.fulfilledQty,
                  overridePrice: override.overridePrice,
                  overrideReason: override.overrideReason,
                  discountAmount: Number(override.discount ?? 0) || 0,
                  discountReason: override.discountReason ?? '',
                };
            return {
              ...withInvoice,
              hstApplicable,
              hstAmount: hstApplicable ? roundCurrency(getInvoiceLineTotal(withInvoice) * HST_RATE) : 0,
            };
          });

          const invoiceTotal = nextItems.reduce(
            (sum, item) => sum + Math.max((item.invoiceQty ?? item.fulfilledQty) * getEffectiveItemPrice(item) - getItemDiscountAmount(item), 0),
            0
          );
          const invoiceHstTotal = nextItems.reduce((sum, item) => sum + (Number(item.hstAmount) || 0), 0);

          return {
            ...order,
            items: nextItems,
            status: 'invoiced',
            invoiceNumber: action.payload.invoiceNumber,
            invoiceTotal,
            invoiceHstTotal,
            invoicedAt: action.payload.timestamp,
            invoiceEmailSentAt: action.payload.invoiceEmailSentAt,
            invoiceShipToName: action.payload.shipTo?.name ?? null,
            invoiceAddressLine1: action.payload.shipTo?.addressLine1 ?? null,
            invoiceAddressLine2: action.payload.shipTo?.addressLine2 ?? null,
            invoiceCity: action.payload.shipTo?.city ?? null,
            invoiceProvince: action.payload.shipTo?.province ?? null,
            invoicePostalCode: action.payload.shipTo?.postalCode ?? null,
            invoiceCountry: action.payload.shipTo?.country ?? null,
          };
        }),
      };
    case 'EDIT_INVOICE':
      return {
        ...state,
        ...(() => {
          let nextBatches = state.batches;
          const nextOrders = state.orders.map((order) => {
            if (order.id !== action.payload.orderId) return order;

            const result = trimFulfilmentToInvoiceLines(order, state.batches, action.payload.lines);
            nextBatches = result.batches;
            const nextItems = result.items.map((item) => {
              const product = state.products.find((entry) => entry.id === item.productId);
              const hstApplicable = item.hstApplicable ?? isProductHstApplicable(product);
              return {
                ...item,
                hstApplicable,
                hstAmount: hstApplicable ? roundCurrency(getInvoiceLineTotal(item) * HST_RATE) : 0,
              };
            });
            const invoiceTotal = nextItems.reduce(
              (sum, item) => sum + Math.max((item.invoiceQty ?? item.fulfilledQty) * getEffectiveItemPrice(item) - getItemDiscountAmount(item), 0),
              0
            );
            const invoiceHstTotal = nextItems.reduce((sum, item) => sum + (Number(item.hstAmount) || 0), 0);

            return {
              ...order,
              items: nextItems,
              invoiceTotal,
              invoiceHstTotal,
              invoiceShipToName: action.payload.shipTo?.name ?? order.invoiceShipToName ?? null,
              invoiceAddressLine1: action.payload.shipTo?.addressLine1 ?? order.invoiceAddressLine1 ?? null,
              invoiceAddressLine2: action.payload.shipTo?.addressLine2 ?? order.invoiceAddressLine2 ?? null,
              invoiceCity: action.payload.shipTo?.city ?? order.invoiceCity ?? null,
              invoiceProvince: action.payload.shipTo?.province ?? order.invoiceProvince ?? null,
              invoicePostalCode: action.payload.shipTo?.postalCode ?? order.invoicePostalCode ?? null,
              invoiceCountry: action.payload.shipTo?.country ?? order.invoiceCountry ?? null,
              qbSyncStatus: order.qbSyncStatus === 'pushed' ? 'pending' : order.qbSyncStatus,
            };
          });

          return { orders: nextOrders, batches: nextBatches };
        })(),
        auditLog: [
          {
            id: `audit-${Date.now()}`,
            timestamp: action.payload.timestamp,
            action: 'invoice_updated',
            orderId: action.payload.orderId,
            clientId: state.orders.find((order) => order.id === action.payload.orderId)?.clientId ?? null,
            userId: state.currentUserId,
            userName: state.users.find((user) => user.id === state.currentUserId)?.name ?? 'Staff user',
            details: `Invoice updated: ${action.payload.reason}`,
            previousValue: null,
            newValue: 'Invoice revised',
          },
          ...state.auditLog,
        ],
      };
    case 'PUSH_QB_INVOICE':
      return {
        ...state,
        orders: state.orders.map((order) =>
          order.id === action.payload.orderId
            ? {
                ...order,
                qbInvoiceNumber: action.payload.qbInvoiceNumber,
                qbTxnId: action.payload.qbTxnId ?? order.qbTxnId ?? null,
                qbEditSequence: action.payload.qbEditSequence ?? order.qbEditSequence ?? null,
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
            jobType: action.payload.jobType ?? 'invoice',
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
        orders: state.orders.map((order) => {
          if (order.id !== action.payload.orderId) return order;
          // No driver -> "packed"; driver already assigned -> "shipped".
          const nextStatus = order.driverUserId ? 'shipped' : 'packed';
          return {
            ...order,
            status: nextStatus,
            shippedAt: nextStatus === 'shipped' ? action.payload.timestamp : order.shippedAt,
            packingSlipNumber: action.payload.packingSlipNumber,
            packingSlipSentAt: action.payload.packingSlipSentAt,
          };
        }),
      };
    case 'ASSIGN_DRIVER':
    case 'BULK_ASSIGN_DRIVER': {
      const orderIds = new Set(
        action.type === 'BULK_ASSIGN_DRIVER' ? action.payload.orderIds : [action.payload.orderId]
      );
      const nextDriverId = action.payload.driverUserId ?? null;
      const timestamp = action.payload.timestamp ?? new Date().toISOString();
      return {
        ...state,
        orders: state.orders.map((order) => {
          if (!orderIds.has(order.id) || order.status === 'delivered') return order;
          // Assigning a driver to a packed order dispatches it (shipped);
          // clearing the driver on an un-delivered shipped order reverts it.
          let status = order.status;
          let shippedAt = order.shippedAt;
          if (nextDriverId && order.status === 'packed') {
            status = 'shipped';
            shippedAt = timestamp;
          } else if (!nextDriverId && order.status === 'shipped' && !order.podSignedAt) {
            status = 'packed';
            shippedAt = null;
          }
          return {
            ...order,
            driverUserId: nextDriverId,
            driverAssignedAt: nextDriverId ? timestamp : null,
            driverAssignedBy: nextDriverId ? state.currentUserId : null,
            status,
            shippedAt,
          };
        }),
      };
    }
    case 'COMPLETE_DELIVERY_POD':
      return {
        ...state,
        orders: state.orders.map((order) =>
          order.id === action.payload.orderId
            ? {
                ...order,
                status: 'delivered',
                podSignatureDataUrl: action.payload.signatureDataUrl,
                podSignedBy: action.payload.signedBy,
                podSignedAt: action.payload.timestamp,
                podSignedAtUnixMs: action.payload.signedAtUnixMs ?? null,
                podSignedAtLocal: action.payload.signedAtLocal ?? null,
                podSignedTimezone: action.payload.signedTimezone ?? null,
                podNotes: action.payload.notes ?? null,
                podCapturedBy: action.payload.userId ?? state.currentUserId,
                podPhotoUrls: Array.isArray(action.payload.photoUrls) ? action.payload.photoUrls : (order.podPhotoUrls ?? []),
                podPhotoPaths: Array.isArray(action.payload.photoPaths) ? action.payload.photoPaths : (order.podPhotoPaths ?? []),
              }
            : order
        ),
        auditLog: [
          {
            id: `audit-${Date.now()}`,
            timestamp: action.payload.timestamp,
            action: 'pod_captured',
            orderId: action.payload.orderId,
            clientId: state.orders.find((order) => order.id === action.payload.orderId)?.clientId ?? null,
            userId: action.payload.userId ?? state.currentUserId,
            userName: state.users.find((user) => user.id === (action.payload.userId ?? state.currentUserId))?.name ?? 'Driver',
            details: `Proof of delivery signed by ${action.payload.signedBy}`,
            previousValue: null,
            newValue: 'POD captured',
          },
          ...state.auditLog,
        ],
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
    case 'UPDATE_USER_PROFILE':
      return {
        ...state,
        users: state.users.map((user) =>
          user.id === action.payload.id
            ? {
                ...user,
                ...(action.payload.name !== undefined ? { name: action.payload.name } : {}),
                ...(action.payload.phone !== undefined ? { phone: action.payload.phone } : {}),
                ...(action.payload.joinedAt !== undefined ? { joinedAt: action.payload.joinedAt } : {}),
              }
            : user
        ),
      };
    case 'SEND_INVOICE_EMAIL':
      return {
        ...state,
        orders: state.orders.map((order) =>
          order.id === action.payload.orderId
            ? { ...order, invoiceEmailSentAt: action.payload.timestamp ?? new Date().toISOString() }
            : order
        ),
      };
    case 'BULK_SEND_INVOICE_EMAIL': {
      const orderIds = new Set(action.payload.orderIds ?? []);
      const timestamp = action.payload.timestamp ?? new Date().toISOString();
      return {
        ...state,
        orders: state.orders.map((order) =>
          orderIds.has(order.id) && order.invoiceNumber && !order.invoiceEmailSentAt
            ? { ...order, invoiceEmailSentAt: timestamp }
            : order
        ),
      };
    }
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

const localOnlyActions = new Set(['TOGGLE_SIDEBAR', 'ADD_TOAST', 'REMOVE_TOAST', 'SET_USER_DISABLED']);
const serverWorkflowActions = new Set([
  'LOCK_ORDER',
  'UNLOCK_ORDER',
  'APPLY_FULFILMENT',
  'APPLY_FULFILMENT_AND_DECLINE_REMAINING',
  'DECLINE_ORDER',
  'CREATE_INVOICE',
  'EDIT_INVOICE',
  'PUSH_QB_INVOICE',
  'QUEUE_QB_INVOICE',
  'CONFIRM_SHIPMENT',
  'COMPLETE_DELIVERY_POD',
  'LOG_PRODUCTION_BATCH',
  'EDIT_PRODUCTION_BATCH',
  'SOFT_DELETE_BATCH',
  'RESTORE_BATCH',
  'ASSIGN_DRIVER',
  'BULK_ASSIGN_DRIVER',
  'SEND_INVOICE_EMAIL',
  'BULK_SEND_INVOICE_EMAIL',
]);
const serverAdminActions = new Set([
  'ADD_PRODUCT',
  'UPDATE_PRODUCT',
  'ADD_CLIENT',
  'UPDATE_CLIENT',
  'ADD_LOCATION',
  'UPDATE_LOCATION',
  'SET_CLIENT_PRICING',
  'UPSERT_TIER',
  'DELETE_TIER',
  'SET_TIER_CLIENT_MEMBERSHIP',
  'UPDATE_CUSTOMER_CONTACT',
  'UPDATE_CUSTOMER_ASSIGNMENTS',
  'UPDATE_USER',
  'UPDATE_USER_PROFILE',
  'UPDATE_QB_SETTINGS',
  // Production batch mutations — LOG_PRODUCTION_BATCH is the canonical RPC path
  // in serverWorkflowActions; these keep legacy/manual dispatches routed
  // through executeAdminAction instead of the generic optimistic fallback.
  'ADD_BATCH',
  'UPDATE_BATCH',
]);
const orderEmailEventsByAction = {
  DECLINE_ORDER: 'order_updated',
  APPLY_FULFILMENT_AND_DECLINE_REMAINING: 'order_updated',
  // Invoice emails are no longer sent automatically on creation. Admins review
  // each invoice (accounting for transit damage) and dispatch it manually with
  // SEND_INVOICE_EMAIL.
  SEND_INVOICE_EMAIL: 'invoice_ready',
  CONFIRM_SHIPMENT: 'order_shipped',
  COMPLETE_DELIVERY_POD: 'order_delivered',
};

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
  const [state, baseDispatch] = useReducer(reducer, initialState, withViewportDefaults);
  const stateRef = useRef(state);
  // Timestamp of the last manual full-state reload (after a dispatch). The
  // realtime subscription consults this and skips its own debounced refresh
  // if it would fire too close behind — avoids a fetchRemoteState double-pull.
  const lastManualReloadAtRef = useRef(0);

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

  const loadCustomerPortalData = useCallback(async (user, options = {}) => {
    if (!supabase) return;

    const data = await fetchCustomerPortalState(supabase, user);
    baseDispatch({
      type: 'INITIALIZE_CUSTOMER_PORTAL',
      payload: {
        data,
        currentUserId: user.id,
      },
    });

    // Only touch the needsPasswordSetup flag during the initial login flow.
    // A silent realtime refresh shouldn't be able to clobber a legit
    // password-setup state that came in via the original auth event.
    if (options.skipPasswordSetupCheck) return;

    if (options.needsPasswordSetup || user.user_metadata?.must_change_password === true) {
      baseDispatch({ type: 'SET_AUTH_STATUS', payload: { needsPasswordSetup: true } });
    } else {
      baseDispatch({ type: 'SET_AUTH_STATUS', payload: { needsPasswordSetup: false } });
    }
  }, []);

  const loadDriverPortalData = useCallback(async (userId) => {
    if (!supabase) return;

    const data = await fetchDriverPortalState(supabase, userId);
    baseDispatch({
      type: 'INITIALIZE_DRIVER_PORTAL',
      payload: {
        data,
        currentUserId: userId,
      },
    });
  }, []);

  const loadAuthenticatedUser = useCallback(
    async (user) => {
      if (!supabase) return;

      const identity = await fetchAuthIdentity(supabase, user.id);
      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''));
      const searchParams = new URLSearchParams(window.location.search);
      const tokenType = hashParams.get('type') || searchParams.get('type');
      // Two signals point at "the user just clicked an invite or reset email
      // and still needs to choose a password":
      //   - URL hash carries `type=invite` (new invite) or `type=recovery` (reset)
      //   - the user metadata flag we set on invite (cleared after they submit)
      const needsPasswordSetup =
        tokenType === 'invite'
        || tokenType === 'recovery'
        || user.user_metadata?.must_change_password === true;

      if (identity === 'staff') {
        baseDispatch({ type: 'SET_AUTH_STATUS', payload: { needsPasswordSetup } });
        await loadRemoteData(user.id);
        return;
      }

      if (identity === 'driver') {
        baseDispatch({ type: 'SET_AUTH_STATUS', payload: { needsPasswordSetup } });
        await loadDriverPortalData(user.id);
        return;
      }

      await loadCustomerPortalData(user, { needsPasswordSetup });
    },
    [loadCustomerPortalData, loadDriverPortalData, loadRemoteData]
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
            tiers: [],
            batches: [],
            orders: [],
            auditLog: [],
            notificationDismissals: [],
            quickBooksJobs: [],
            customerContacts: [],
            customerClientAssignments: [],
            customerLocationAssignments: [],
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

  // Realtime: keep all role views in sync without manual refresh.
  // Staff/admin, driver, and customer portals each subscribe to the tables
  // that another role's actions can mutate behind their back.
  useEffect(() => {
    if (!supabase) return undefined;
    if (!state.isAuthenticated || !state.currentUserId) return undefined;
    if (!state.authRole) return undefined;
    // Don't subscribe while a user is still in the password-setup flow —
    // a realtime refresh would clobber the needsPasswordSetup flag.
    if (state.needsPasswordSetup) return undefined;

    let refreshTimer = null;
    const userId = state.currentUserId;
    const role = state.authRole;

    const scheduleRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(async () => {
        refreshTimer = null;
        // If the user's own dispatch just reloaded the full state, skip
        // this realtime refresh — it would just be a duplicate fetch.
        if (Date.now() - lastManualReloadAtRef.current < 800) return;
        try {
          if (role === 'driver') {
            await loadDriverPortalData(userId);
          } else if (role === 'customer') {
            await loadCustomerPortalData({ id: userId }, { skipPasswordSetupCheck: true });
          } else {
            await loadRemoteData(userId);
          }
        } catch (err) {
          // Silent — next change or manual refresh will retry.
          console.warn('Realtime refresh failed:', err);
        }
      }, 400); // small debounce to coalesce bursts of changes
    };

    // Tables each role needs to watch for cross-role mutations.
    let tables;
    if (role === 'staff') {
      tables = [
        'orders', 'order_items', 'audit_events',
        'customer_contacts', 'customer_client_assignments', 'customer_location_assignments',
        'batches', 'batch_assignments',
        'clients', 'locations', 'products', 'client_product_prices',
        'tiers', 'tier_products',
        'quickbooks_sync_jobs', 'quickbooks_settings',
      ];
    } else if (role === 'driver') {
      tables = ['orders', 'order_items', 'audit_events', 'locations'];
    } else if (role === 'customer') {
      tables = [
        'orders', 'order_items',
        'customer_contacts', 'customer_client_assignments', 'customer_location_assignments',
        'clients', 'locations', 'products', 'client_product_prices',
      ];
    } else {
      return undefined;
    }

    let channel = supabase.channel(`modhanios-realtime-${role}-${userId}`);
    tables.forEach((table) => {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleRefresh
      );
    });
    channel.subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      supabase.removeChannel(channel);
    };
  }, [state.isAuthenticated, state.currentUserId, state.authRole, state.needsPasswordSetup, loadRemoteData, loadDriverPortalData, loadCustomerPortalData]);

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

    const loginIdentifier = String(email ?? '').trim().toLowerCase();
    if (!loginIdentifier) {
      return { ok: false, error: 'Enter your username.' };
    }

    let normalizedEmail = loginIdentifier;
    const resolveResponse = await fetch('/api/resolve-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: loginIdentifier }),
    }).catch(() => null);
    const resolveData = await resolveResponse?.json().catch(() => ({}));

    if (resolveResponse?.ok && resolveData?.authEmail) {
      normalizedEmail = resolveData.authEmail;
    } else if (!loginIdentifier.includes('@')) {
      return { ok: false, error: resolveData?.error ?? 'Invalid username or password.' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (error) {
      const response = await fetch('/api/record-login-failure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: loginIdentifier, email: normalizedEmail }),
      }).catch(() => null);
      const failureData = await response?.json().catch(() => ({}));

      if (failureData?.locked) {
        return {
          ok: false,
          error: failureData.error ?? 'Too many failed sign-in attempts. Ask an admin to re-enable your account or set a new password.',
        };
      }
      if (Number.isFinite(failureData?.attemptsRemaining)) {
        return {
          ok: false,
          error: failureData.error ?? `${error.message} ${failureData.attemptsRemaining} attempt${failureData.attemptsRemaining === 1 ? '' : 's'} remaining before this account is disabled.`,
        };
      }
      return { ok: false, error: error.message };
    }

    if (data.session?.access_token) {
      fetch('/api/clear-login-failures', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session.access_token}`,
        },
      }).catch(() => null);
    }

    return { ok: true };
  }, []);

  const notifyOrderEvent = useCallback(async (orderId, eventType) => {
    if (!supabase || !orderId || !eventType) return { ok: true };

    const { data: sessionResult, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionResult.session) {
      return { ok: false, error: sessionError?.message ?? 'No active session.' };
    }

    const response = await fetch('/api/notify-order-event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionResult.session.access_token}`,
      },
      body: JSON.stringify({ orderId, eventType }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.ok === false) {
      const message = data.error || `Email notification failed (${response.status}).`;
      addToast(message, 'warning');
      return { ok: false, error: message };
    }

    if (!data.skipped) {
      addToast('Customer email notification sent.');
    }

    return { ok: true };
  }, [addToast]);



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

    const { data: orderId, error } = await submitCustomerOrder(supabase, { clientId, locationId, items });
    if (error) return { ok: false, error: error.message };

    await loadCustomerPortalData(sessionResult.session.user);
    if (orderId) {
      notifyOrderEvent(orderId, 'order_received');
    }
    return { ok: true, orderId };
  }, [loadCustomerPortalData, notifyOrderEvent]);

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
          const actionErrorPrefix = action.type === 'QUEUE_QB_INVOICE' ? 'QuickBooks queue failed' : 'Save failed';
          addToast(`${actionErrorPrefix}: ${error.message}`, 'warning');
          return { ok: false, error };
        }

        if (previousState.authRole === 'driver' && action.type === 'COMPLETE_DELIVERY_POD') {
          baseDispatch(action);
          lastManualReloadAtRef.current = Date.now();
          if (previousState.currentUserId) {
            loadDriverPortalData(previousState.currentUserId).catch((reloadError) => {
              addToast(`Reload failed: ${reloadError.message}`, 'warning');
            });
          }
          return { ok: true };
        }

        if (previousState.currentUserId) {
          try {
            if (previousState.authRole === 'driver') {
              await loadDriverPortalData(previousState.currentUserId);
            } else {
              await loadRemoteData(previousState.currentUserId);
            }
            lastManualReloadAtRef.current = Date.now();
          } catch (reloadError) {
            addToast(`Reload failed: ${reloadError.message}`, 'warning');
            return { ok: false, error: reloadError };
          }
        }

        const emailEventType = orderEmailEventsByAction[action.type];
        if (emailEventType && action.payload?.orderId) {
          notifyOrderEvent(action.payload.orderId, emailEventType);
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
    [addToast, loadDriverPortalData, loadRemoteData, notifyOrderEvent]
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
      notifyOrderEvent,
      logout,
      dismissNotification,
      clearNotifications,

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
      notifyOrderEvent,
      logout,
      dismissNotification,
      clearNotifications,

      completeCustomerProfile,
      submitPortalOrder,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
