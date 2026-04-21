import { createContext, useContext, useReducer, useCallback } from 'react';
import {
  PRODUCTS, CLIENTS, LOCATIONS, CLIENT_PRICING, BATCHES, ORDERS, AUDIT_LOG, CURRENT_USER
} from '../data/seedData';

const AppContext = createContext(null);

const initialState = {
  currentUser: CURRENT_USER,
  products: PRODUCTS,
  clients: CLIENTS,
  locations: LOCATIONS,
  clientPricing: CLIENT_PRICING,
  batches: BATCHES,
  orders: ORDERS,
  auditLog: AUDIT_LOG,
  sidebarCollapsed: false,
  toasts: [],
};

function appReducer(state, action) {
  switch (action.type) {
    // ---- Sidebar ----
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed };

    // ---- Products ----
    case 'ADD_PRODUCT':
      return { ...state, products: [...state.products, action.payload] };
    case 'UPDATE_PRODUCT':
      return {
        ...state,
        products: state.products.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p),
      };
    case 'DELETE_PRODUCT':
      return { ...state, products: state.products.filter(p => p.id !== action.payload) };

    // ---- Clients ----
    case 'ADD_CLIENT':
      return { ...state, clients: [...state.clients, action.payload] };
    case 'UPDATE_CLIENT':
      return {
        ...state,
        clients: state.clients.map(c => c.id === action.payload.id ? { ...c, ...action.payload } : c),
      };

    // ---- Locations ----
    case 'ADD_LOCATION':
      return { ...state, locations: [...state.locations, action.payload] };
    case 'UPDATE_LOCATION':
      return {
        ...state,
        locations: state.locations.map(l => l.id === action.payload.id ? { ...l, ...action.payload } : l),
      };
    case 'DELETE_LOCATION':
      return { ...state, locations: state.locations.filter(l => l.id !== action.payload) };

    // ---- Client Pricing ----
    case 'SET_CLIENT_PRICING':
      {
        const exists = state.clientPricing.find(
          cp => cp.clientId === action.payload.clientId && cp.productId === action.payload.productId
        );
        if (exists) {
          return {
            ...state,
            clientPricing: state.clientPricing.map(cp =>
              cp.clientId === action.payload.clientId && cp.productId === action.payload.productId
                ? { ...cp, ...action.payload }
                : cp
            ),
          };
        }
        return { ...state, clientPricing: [...state.clientPricing, action.payload] };
      }

    // ---- Batches ----
    case 'ADD_BATCH':
      return { ...state, batches: [...state.batches, action.payload] };
    case 'UPDATE_BATCH':
      return {
        ...state,
        batches: state.batches.map(b => b.id === action.payload.id ? { ...b, ...action.payload } : b),
      };

    // ---- Orders ----
    case 'ADD_ORDER':
      return { ...state, orders: [...state.orders, action.payload] };
    case 'UPDATE_ORDER':
      return {
        ...state,
        orders: state.orders.map(o => o.id === action.payload.id ? { ...o, ...action.payload } : o),
      };
    case 'LOCK_ORDER':
      return {
        ...state,
        orders: state.orders.map(o =>
          o.id === action.payload.orderId
            ? { ...o, lockedBy: action.payload.userId, lockedAt: new Date().toISOString() }
            : o
        ),
      };
    case 'UNLOCK_ORDER':
      return {
        ...state,
        orders: state.orders.map(o =>
          o.id === action.payload ? { ...o, lockedBy: null, lockedAt: null } : o
        ),
      };

    // ---- Fulfilment ----
    case 'FULFIL_ORDER':
      {
        const { orderId, assignments } = action.payload;
        // assignments: [{ orderItemId, batchId, qty }]
        // Update order items with assigned batches + fulfilled qty
        let updatedBatches = [...state.batches];
        const updatedOrders = state.orders.map(order => {
          if (order.id !== orderId) return order;
          const updatedItems = order.items.map(item => {
            const itemAssignments = assignments.filter(a => a.orderItemId === item.id);
            if (itemAssignments.length === 0) return item;
            const newAssigned = [
              ...item.assignedBatches,
              ...itemAssignments.map(a => ({ batchId: a.batchId, qty: a.qty })),
            ];
            const totalFulfilled = newAssigned.reduce((sum, ab) => sum + ab.qty, 0);
            return { ...item, assignedBatches: newAssigned, fulfilledQty: totalFulfilled };
          });
          const allFulfilled = updatedItems.every(i => i.fulfilledQty >= i.quantity);
          const anyFulfilled = updatedItems.some(i => i.fulfilledQty > 0);
          let newStatus = order.status;
          if (allFulfilled) newStatus = 'invoiced';
          else if (anyFulfilled) newStatus = 'partial';
          return {
            ...order, items: updatedItems, status: newStatus,
            fulfilledAt: allFulfilled ? new Date().toISOString() : order.fulfilledAt,
            lockedBy: null, lockedAt: null,
          };
        });
        // Deduct from batches
        for (const a of assignments) {
          updatedBatches = updatedBatches.map(b => {
            if (b.id !== a.batchId) return b;
            const newRemaining = b.qtyRemaining - a.qty;
            return { ...b, qtyRemaining: newRemaining, status: newRemaining <= 0 ? 'cleared' : 'active' };
          });
        }
        return { ...state, orders: updatedOrders, batches: updatedBatches };
      }

    // ---- Audit Log ----
    case 'ADD_AUDIT':
      return { ...state, auditLog: [action.payload, ...state.auditLog] };

    // ---- Toasts ----
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.payload] };
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };

    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const addToast = useCallback((message, type = 'success') => {
    const id = `toast-${Date.now()}`;
    dispatch({ type: 'ADD_TOAST', payload: { id, message, type } });
    setTimeout(() => dispatch({ type: 'REMOVE_TOAST', payload: id }), 3500);
  }, []);

  const addAudit = useCallback((action, orderId, details, previousValue, newValue) => {
    dispatch({
      type: 'ADD_AUDIT',
      payload: {
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action,
        orderId,
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        details,
        previousValue,
        newValue,
      },
    });
  }, [state.currentUser]);

  return (
    <AppContext.Provider value={{ state, dispatch, addToast, addAudit }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
