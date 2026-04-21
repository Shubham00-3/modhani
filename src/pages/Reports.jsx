import { useState, useMemo } from 'react';
import { useApp } from '../context/useApp';
import { getProductDisplayName, formatCurrency } from '../data/seedData';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

const CHART_COLORS = ['#1A3021', '#D1A14E', '#587B66', '#8FA899', '#B8860B', '#6B7280'];

export default function Reports() {
  const { state } = useApp();
  const { orders, clients, products, locations } = state;
  const [filterClient, setFilterClient] = useState('');

  const filtered = filterClient ? orders.filter(o => o.clientId === filterClient) : orders;

  // Weekly orders (mock days)
  const weeklyData = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((day, i) => ({
      day,
      orders: Math.max(0, Math.floor(filtered.length * (0.6 + Math.sin(i * 1.2) * 0.5))),
    }));
  }, [filtered]);

  // Product mix
  const productMix = useMemo(() => {
    const counts = {};
    filtered.forEach(o => {
      o.items.forEach(item => {
        const p = products.find(pr => pr.id === item.productId);
        const name = p ? getProductDisplayName(p) : 'Other';
        counts[name] = (counts[name] || 0) + item.quantity;
      });
    });
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    return Object.entries(counts).map(([name, value]) => ({
      name, value, percent: total > 0 ? Math.round((value / total) * 100) : 0,
    }));
  }, [filtered, products]);

  // Revenue by client
  const revenueByClient = useMemo(() => {
    return clients.map(c => {
      const clientOrders = filtered.filter(o => o.clientId === c.id);
      const revenue = clientOrders.reduce((sum, o) => {
        return sum + o.items.reduce((s, item) => {
          const price = item.overridePrice || item.clientPrice || item.basePrice;
          return s + price * item.quantity;
        }, 0);
      }, 0);
      return { name: `${c.name} (all)`, revenue: Math.round(revenue) };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [filtered, clients]);

  // Fulfilment rate
  const fulfilmentRate = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    return days.map((day, i) => {
      const total = Math.floor(filtered.length * (0.5 + Math.sin(i) * 0.4));
      const fulfilled = Math.floor(total * 0.7);
      const partial = Math.floor(total * 0.2);
      const declined = Math.max(0, total - fulfilled - partial);
      return { day, Fulfilled: Math.max(0, fulfilled), Partial: Math.max(0, partial), Declined: Math.max(0, declined) };
    });
  }, [filtered]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null;
    return (
      <div style={{
        background: 'var(--color-card)', padding: '8px 12px', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)', fontSize: 'var(--font-size-sm)',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color, display: 'flex', gap: 8 }}>
            <span>{p.name}:</span>
            <span style={{ fontWeight: 600 }}>{typeof p.value === 'number' && p.value > 100 ? `$${p.value.toLocaleString()}` : p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      <div className="filter-bar">
        <select className="form-select" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="grid-2 section">
        {/* Weekly Orders */}
        <div className="card">
          <div className="card-title">Weekly Orders</div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="orders" name="Orders" fill="#1A3021" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Product Mix */}
        <div className="card">
          <div className="card-title">Product Mix — This Month</div>
          <div style={{ height: 260, display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="50%" height="100%">
              <PieChart>
                <Pie data={productMix} dataKey="value" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {productMix.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {productMix.map((item, i) => (
                <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-sm)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{item.name}</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{item.percent}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Revenue by Client */}
        <div className="card">
          <div className="card-title">Revenue by Client</div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByClient} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis type="number" tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }} width={120} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill="#1A3021" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fulfilment Rate */}
        <div className="card">
          <div className="card-title">Fulfilment Rate — This Week</div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fulfilmentRate} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" />
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} />
                <YAxis tick={{ fontSize: 12, fill: 'var(--color-text-secondary)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Fulfilled" stackId="a" fill="#1A3021" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Partial" stackId="a" fill="#D1A14E" />
                <Bar dataKey="Declined" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
