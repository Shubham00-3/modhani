import { Navigate, Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/layout/Layout';
import AuthScreen from './components/auth/AuthScreen';
import { useApp } from './context/useApp';
import PhaseOneOverview from './pages/PhaseOneOverview';
import PhaseOneOrdersInvoicing from './pages/PhaseOneOrdersInvoicing';
import PhaseOneProductionBatches from './pages/PhaseOneProductionBatches';
import PhaseOneReports from './pages/PhaseOneReports';
import PhaseOneSettings from './pages/PhaseOneSettings';
import PhaseOneAuditTrail from './pages/PhaseOneAuditTrail';
import PhaseOneClientsLocations from './pages/PhaseOneClientsLocations';
import PhaseOneProducts from './pages/PhaseOneProducts';
import { CustomerPortalDashboard, CustomerPortalNewOrder } from './pages/CustomerPortal';

export default function App() {
  const { state } = useApp();
  const location = useLocation();
  const isPortalPath = location.pathname.startsWith('/portal');

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
            Preparing {state.authConfigured ? 'Supabase-backed staff data' : 'demo workspace'}...
          </div>
        </div>
      </div>
    );
  }

  if (state.authConfigured && !state.isAuthenticated) {
    return <AuthScreen portal={isPortalPath} />;
  }

  if (state.userAccessType === 'customer') {
    return (
      <Routes>
        <Route path="/portal" element={<CustomerPortalDashboard />} />
        <Route path="/portal/orders/new" element={<CustomerPortalNewOrder />} />
        <Route path="*" element={<Navigate to="/portal" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<PhaseOneOverview />} />
        <Route path="/orders" element={<PhaseOneOrdersInvoicing />} />
        <Route path="/production" element={<PhaseOneProductionBatches />} />
        <Route path="/reports" element={<PhaseOneReports />} />
        <Route path="/audit" element={<PhaseOneAuditTrail />} />
        <Route path="/clients-locations" element={<PhaseOneClientsLocations />} />
        <Route path="/products" element={<PhaseOneProducts />} />
        <Route path="/settings" element={<PhaseOneSettings />} />
        <Route path="/portal/*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
