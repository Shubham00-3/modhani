import { useCallback, useMemo, useState } from 'react';
import { useApp } from './useApp';
import { CartContext } from './cartContext';
import { formatCaseQuantity } from '../data/phaseOneData';

export default function CartProvider({ children }) {
  const { state } = useApp();
  const portal = state.customerPortal;

  const [quantities, setQuantities] = useState({});
  const [locationId, setLocationId] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');

  const portalClients = useMemo(() => portal?.clients ?? [], [portal?.clients]);
  const portalProducts = useMemo(() => portal?.products ?? [], [portal?.products]);
  const hasMultipleClients = portalClients.length > 1;

  const activeClient = useMemo(() => {
    if (!portal) return null;
    if (hasMultipleClients) {
      return portalClients.find((client) => client.id === selectedClientId) || portalClients[0] || null;
    }
    return portal.client ?? portalClients[0] ?? null;
  }, [portal, hasMultipleClients, portalClients, selectedClientId]);

  const activeClientId = activeClient?.id ?? '';

  const activeLocations = useMemo(
    () => (portal?.locations ?? []).filter((location) => location.clientId === activeClientId),
    [portal?.locations, activeClientId]
  );

  const activeLocationId = locationId || activeLocations[0]?.id || '';
  const activeLocationName =
    activeLocations.find((location) => location.id === activeLocationId)?.name ?? 'No location';

  const activeProducts = useMemo(() => {
    if (!portalProducts.length || !activeClientId) return [];
    return portalProducts.filter((product) => product.pricingClientId === activeClientId);
  }, [portalProducts, activeClientId]);

  const selectedLines = useMemo(
    () =>
      activeProducts
        .map((product) => ({
          product,
          quantity: Number(quantities[product.id] ?? 0),
        }))
        .filter((line) => line.quantity > 0),
    [activeProducts, quantities]
  );

  const orderTotal = selectedLines.reduce(
    (total, line) => total + line.quantity * line.product.clientPrice,
    0
  );

  const cartItemCount = selectedLines.reduce((sum, line) => sum + line.quantity, 0);
  const formattedCartItemCount = formatCaseQuantity(cartItemCount);

  const updateProductQuantity = useCallback((productId, nextValue) => {
    if (nextValue === '') {
      setQuantities((current) => ({
        ...current,
        [productId]: '',
      }));
      return;
    }

    const rawValue = String(nextValue).trim();
    if (!/^\d*\.?\d{0,2}$/.test(rawValue)) return;

    const nextQuantity = Math.max(0, Number(rawValue) || 0);
    setQuantities((current) => ({
      ...current,
      [productId]: nextQuantity || rawValue === '0' || rawValue === '0.' ? rawValue : '',
    }));
  }, []);

  const handleClientChange = useCallback((newClientId) => {
    setSelectedClientId(newClientId);
    setLocationId('');
    setQuantities({});
  }, []);

  const clearCart = useCallback(() => {
    setQuantities({});
  }, []);

  const value = useMemo(
    () => ({
      quantities,
      locationId: activeLocationId,
      setLocationId,
      selectedClientId: activeClientId,
      handleClientChange,
      updateProductQuantity,
      clearCart,
      portal,
      portalClients,
      portalProducts,
      hasMultipleClients,
      activeClient,
      activeClientId,
      activeLocations,
      activeLocationId,
      activeLocationName,
      activeProducts,
      selectedLines,
      orderTotal,
      cartItemCount,
      formattedCartItemCount,
    }),
    [
      quantities,
      activeLocationId,
      activeClientId,
      handleClientChange,
      updateProductQuantity,
      clearCart,
      portal,
      portalClients,
      portalProducts,
      hasMultipleClients,
      activeClient,
      activeLocations,
      activeLocationName,
      activeProducts,
      selectedLines,
      orderTotal,
      cartItemCount,
      formattedCartItemCount,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
