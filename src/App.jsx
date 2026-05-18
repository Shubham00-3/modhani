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
import PhaseOneCustomers from './pages/PhaseOneCustomers';
import CustomerPortal from './pages/CustomerPortal';
import CustomerCart from './pages/CustomerCart';
import CustomerThankYou from './pages/CustomerThankYou';
import CustomerRecentOrders from './pages/CustomerRecentOrders';
import CustomerPortalShell from './pages/CustomerPortalShell';
import CartProvider from './context/CartProvider';
import DriverPortal from './pages/DriverPortal';

export default function App() {
  const { state, dispatch } = useApp();

  if (!state.initialized || state.authLoading) {
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
            Preparing {state.authConfigured ? 'Supabase-backed workspace' : 'demo workspace'}...
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
        <Route path="/settings" element={<PhaseOneSettings />} />
      </Routes>
    </Layout>
  );
}
