import React, { useState, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip,
} from 'recharts';
import { useAuth } from '../context/AuthContext';

const MONTHLY_BUDGET_GBP = 20;

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const getSectorCount = (companiesData) => {
  if (!companiesData?.length) return 0;
  return new Set(companiesData.map(c => c.sicDescription).filter(Boolean)).size;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ color: '#6b7280', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontWeight: 700, color: '#111' }}>£{payload[0].value.toFixed(2)}</div>
      </div>
    );
  }
  return null;
};

const CustomBarLabel = ({ x, y, width, value }) => (
  value > 0
    ? <text x={x + width / 2} y={y - 6} fill="#374151" fontSize={12} textAnchor="middle">£{value.toFixed(2)}</text>
    : null
);

const PLAN_FEATURES = [
  '£20 analysis budget / month',
  'Unlimited companies',
  'All 5 analysis tiers',
  'Filing processing',
];

const PLAN = { name: 'Pro', price: 19, renewsDate: 'Jun 1, 2025' };
const MEMBER_SINCE = 'Jan 2025';

const ProfilePage = () => {
  const { user, authFetch } = useAuth();
  const [timeRange] = useState('Last 6 months');

  const [stats,        setStats]        = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    authFetch(`${process.env.REACT_APP_API_URL}/api/users/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setStats(data); })
      .catch(() => {})
      .finally(() => setLoadingStats(false));
  }, [authFetch]);

  const companiesCount = user?.companies?.length || 0;
  const sectorCount    = getSectorCount(user?.companiesData);

  // Fall back to zeros while loading
  const totalAnalyses        = stats?.totalAnalyses         ?? 0;
  const analysesThisMonth    = stats?.analysesThisMonth     ?? 0;
  const currentSpend         = stats?.currentMonthSpendGBP  ?? 0;
  const monthlyBudget        = stats?.monthlyBudgetGBP      ?? MONTHLY_BUDGET_GBP;
  const budgetRemaining      = Math.max(0, monthlyBudget - currentSpend);
  const budgetPct            = monthlyBudget > 0 ? Math.round((currentSpend / monthlyBudget) * 100) : 0;

  // Chart data: last 6 months from API, or empty placeholders while loading
  const spendingData = stats?.monthlySpend ?? [];
  const currentMonthLabel = spendingData[spendingData.length - 1]?.label ?? '';

  // Determine axis domain dynamically
  const maxAmount = Math.max(...spendingData.map(d => d.amount), 1);
  const axisMax   = Math.ceil(maxAmount / 5) * 5 + 5;

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh', padding: '32px 24px' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* Profile header */}
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '24px 28px', display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '20px', flexShrink: 0 }}>
            {getInitials(user?.name)}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#111', lineHeight: 1.2 }}>{user?.name || 'User'}</div>
            <div style={{ fontSize: '14px', color: '#6b7280', marginTop: '3px' }}>
              {user?.email} · {PLAN.name} plan · Member since {MEMBER_SINCE}
            </div>
          </div>
          <button style={{ background: '#fff', border: '1px solid #d1d5db', borderRadius: '8px', padding: '9px 18px', fontSize: '14px', fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
            Edit profile
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
          <StatCard label="Analyses Run" value={loadingStats ? '—' : totalAnalyses} sub={`+${analysesThisMonth} this month`} />
          <StatCard label="Spent This Month" value={loadingStats ? '—' : `£${currentSpend.toFixed(2)}`} sub={`of £${monthlyBudget.toFixed(2)} budget`} valueColor="#2563eb" leftBorder />
          <StatCard label="Companies" value={companiesCount} sub={`Across ${sectorCount} sector${sectorCount !== 1 ? 's' : ''}`} />
          <StatCard label="Budget Remaining" value={loadingStats ? '—' : `£${budgetRemaining.toFixed(2)}`} sub="Resets Jun 1" valueColor="#16a34a" />
        </div>

        {/* Main content area */}
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

          {/* Monthly Spending card */}
          <div style={{ flex: '1 1 0', background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '24px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                Monthly Spending
              </span>
              <button style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                {timeRange}
                <ChevronDown size={14} color="#6b7280" />
              </button>
            </div>

            {loadingStats ? (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 14 }}>
                Loading…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={spendingData} barSize={42} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#6b7280' }}
                    tickFormatter={(val) => val === currentMonthLabel ? `${val} •` : val}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }}
                    tickFormatter={(v) => `£${v}`} domain={[0, axisMax]}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={false} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]} label={<CustomBarLabel />}>
                    {spendingData.map((entry) => (
                      <Cell key={entry.label} fill={entry.label === currentMonthLabel ? '#2563eb' : '#d1d5db'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#111' }}>Monthly budget</span>
                <span style={{ fontSize: '14px', color: '#374151', fontWeight: 500 }}>
                  £{currentSpend.toFixed(2)} of £{monthlyBudget.toFixed(2)} used · {budgetPct}%
                </span>
              </div>
              <div style={{ height: '7px', background: '#e5e7eb', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(budgetPct, 100)}%`, background: budgetPct >= 90 ? '#dc2626' : '#2563eb', borderRadius: '99px', transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
                £{budgetRemaining.toFixed(2)} remaining · Resets Jun 1, 2025
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div style={{ width: '300px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Plan card */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Plan</span>
                <span style={{ background: '#ede9fe', color: '#5b21b6', fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '99px' }}>{PLAN.name}</span>
              </div>
              <div style={{ marginBottom: '4px' }}>
                <span style={{ fontSize: '32px', fontWeight: 800, color: '#111' }}>£{PLAN.price}</span>
                <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: 400 }}>/month</span>
              </div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>Renews {PLAN.renewsDate}</div>
              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '16px', marginBottom: '20px' }}>
                {PLAN_FEATURES.map((feature) => (
                  <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <Check size={15} color="#16a34a" strokeWidth={2.5} />
                    <span style={{ fontSize: '14px', color: '#374151' }}>{feature}</span>
                  </div>
                ))}
              </div>
              <button
                style={{ width: '100%', background: '#fff', border: '1.5px solid #d1d5db', borderRadius: '8px', padding: '10px', fontSize: '14px', fontWeight: 600, color: '#111', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
              >
                Manage plan
              </button>
            </div>

            {/* Analysis Budget card */}
            <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e5e7eb', borderLeft: '4px solid #2563eb', padding: '20px 20px 20px 16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '12px' }}>
                Analysis Budget
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Used</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#111' }}>£{currentSpend.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Remaining</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#16a34a' }}>£{budgetRemaining.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', color: '#6b7280' }}>Total</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#111' }}>£{monthlyBudget.toFixed(2)}</span>
              </div>
              <div style={{ height: '6px', background: '#e5e7eb', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(budgetPct, 100)}%`, background: '#2563eb', borderRadius: '99px' }} />
              </div>
              <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
                {budgetPct}% used · resets Jun 1
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};

const StatCard = ({ label, value, sub, valueColor, leftBorder }) => (
  <div style={{ flex: 1, padding: '20px 24px', background: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', borderLeft: leftBorder ? '4px solid #2563eb' : undefined }}>
    <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: '8px' }}>{label}</div>
    <div style={{ fontSize: '28px', fontWeight: 800, color: valueColor || '#111', lineHeight: 1.1, marginBottom: '4px' }}>{value}</div>
    <div style={{ fontSize: '13px', color: '#6b7280' }}>{sub}</div>
  </div>
);

export default ProfilePage;
