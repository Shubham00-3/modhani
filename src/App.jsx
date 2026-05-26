import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import AuthScreen from './components/auth/AuthScreen';
import SetPasswordScreen from './components/auth/SetPasswordScreen';
import { useApp } from './context/useApp';
import PhaseOneOverview from './pages/PhaseOneOverview';
import PhaseOneOrdersInvoicing from './pages/PhaseOneOrdersInvoicing';
import PhaseOneProductionBatches from './pages/PhaseOneProductionBatches';
import PhaseOneInventory from './pages/PhaseOneInventory';
import PhaseOneReports from './pages/PhaseOneReports';
import PhaseOneSettings from './pages/PhaseOneSettings';
import PhaseOneAuditTrail from './pages/PhaseOneAuditTrail';
import PhaseOneClientsLocations from './pages/PhaseOneClientsLocations';
import PhaseOneProducts from './pages/PhaseOneProducts';
import PhaseOneTiers from './pages/PhaseOneTiers';
import PhaseOneCustomers from './pages/PhaseOneCustomers';
import CustomerPortal from './pages/CustomerPortal';
import CustomerCart from './pages/CustomerCart';
import CustomerThankYou from './pages/CustomerThankYou';
import CustomerRecentOrders from './pages/CustomerRecentOrders';
import CustomerPortalShell from './pages/CustomerPortalShell';
import CartProvider from './context/CartProvider';
import DriverPortal from './pages/DriverPortal';

// Detect Supabase invite / recovery callbacks before rendering the login form,
// so the JS client has time to turn the URL token or code into a session.
function hasAuthHashInUrl() {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const combined = `${hash}&${search}`;
  if (
    !combined.includes('access_token')
    && !combined.includes('code=')
    && !combined.includes('error')
  ) {
    return false;
  }
  return /type=(invite|recovery|signup|magiclink)/.test(combined)
    || combined.includes('access_token')
    || combined.includes('code=');
}

export default function App() {
  const { state, dispatch } = useApp();
  const processingAuthHash = state.authConfigured
    && !state.isAuthenticated
    && hasAuthHashInUrl();

  if (!state.initialized || state.authLoading || processingAuthHash) {
    const message = processingAuthHash
      ? 'Processing your invite link...'
      : `Preparing ${state.authConfigured ? 'Supabase-backed workspace' : 'demo workspace'}...`;
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(180deg, #f4f7f4 0%, #edf1ee 100%)',
        }}
      >
        <div className="card" style={{ padding: '28px 32px', textAlign: 'center', minWidth: 320 }}>
          <div style={{ fontWeight: 700, fontSize: '20px' }}>Loading ModhaniOS</div>
          <div style={{ color: 'var(--color-text-secondary)', marginTop: '8px' }}>
            {message}
          </div>
        </div>
      </div>
    );
  }

  if (state.authConfigured && !state.isAuthenticated) {
    return <AuthScreen />;
  }

  // Any newly invited user (staff, driver, or customer) lands here once on
  // first sign-in to choose a password before reaching their portal.
  if (state.needsPasswordSetup && ['customer', 'staff', 'driver'].includes(state.authRole)) {
    return (
      <SetPasswordScreen
        authRole={state.authRole}
        onComplete={() => dispatch({ type: 'SET_AUTH_STATUS', payload: { needsPasswordSetup: false } })}
      />
    );
  }

  if (state.authConfigured && state.authRole === 'customer') {
    return (
      <CartProvider>
        <CustomerPortalShell>
          <Routes>
            <Route path="/cart" element={<CustomerCart />} />
            <Route path="/thank-you" element={<CustomerThankYou />} />
            <Route path="/recent-orders" element={<CustomerRecentOrders />} />
            <Route path="*" element={<CustomerPortal />} />
          </Routes>
        </CustomerPortalShell>
      </CartProvider>
    );
  }

  if (state.authConfigured && state.authRole === 'driver') {
    return <DriverPortal />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<PhaseOneOverview />} />
        <Route path="/orders" element={<PhaseOneOrdersInvoicing />} />
        <Route path="/production" element={<PhaseOneProductionBatches />} />
        <Route path="/inventory" element={<PhaseOneInventory />} />
        <Route path="/reports" element={<PhaseOneReports />} />
        <Route path="/audit" element={<PhaseOneAuditTrail />} />
        <Route path="/clients-locations" element={<PhaseOneClientsLocations />} />
        <Route path="/customers" element={<PhaseOneCustomers />} />
        <Route path="/products" element={<PhaseOneProducts />} />
        <Route path="/tiers" element={<PhaseOneTiers />} />
        <Route path="/settings" element={<PhaseOneSettings />} />
      </Routes>
    </Layout>
  );
}
