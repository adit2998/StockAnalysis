import React, { useEffect, useState } from 'react';
import { Spinner, Alert } from 'react-bootstrap';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import TrendDetailView from './TrendDetailView';

const FILTERS = ['All', 'Income Statement', 'Balance Sheet', 'Cash Flow'];

const STATEMENT_LABELS = {
  'Income Statement': 'INCOME STATEMENT',
  'Balance Sheet': 'BALANCE SHEET',
  'Cash Flow': 'CASH FLOW',
};

function formatVal(val) {
  if (val === null || val === undefined || isNaN(val)) return '--';
  const abs = Math.abs(val);
  if (abs >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `$${(val / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `$${(val / 1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `$${(val / 1e3).toFixed(1)}K`;
  if (abs < 100)   return val.toFixed(2);
  return val.toFixed(0);
}

function getAnnualValues(values) {
  const byYear = {};
  for (const v of values) {
    const year = new Date(v.date).getFullYear();
    if (!byYear[year] || v.date > byYear[year].date) byYear[year] = v;
  }
  return Object.values(byYear).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function MetricCard({ metric, onClick }) {
  const [hovered, setHovered] = useState(false);
  const annual = getAnnualValues(metric.values || []);
  const chartData = annual.map(v => ({ value: v.value }));
  const latest = annual.length ? annual[annual.length - 1].value : null;
  const prev = annual.length >= 2 ? annual[annual.length - 2].value : null;
  const yoy = prev ? ((latest - prev) / Math.abs(prev)) * 100 : null;
  const yearStart = annual.length ? new Date(annual[0].date).getFullYear() : '';
  const yearEnd = annual.length ? new Date(annual[annual.length - 1].date).getFullYear() : '';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: 12,
        padding: '16px',
        cursor: 'pointer',
        background: '#fff',
        boxShadow: hovered ? '0 2px 12px rgba(0,0,0,0.09)' : 'none',
        transition: 'box-shadow 0.15s',
      }}
    >
      <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#222', marginBottom: 4, lineHeight: 1.3 }}>
        {metric.metric}
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, lineHeight: 1.2 }}>
        {formatVal(latest)}
        {yoy != null && (
          <span style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            marginLeft: 8,
            color: yoy >= 0 ? '#16a34a' : '#dc2626',
          }}>
            {yoy >= 0 ? '+' : ''}{yoy.toFixed(1)}%
          </span>
        )}
      </div>
      {chartData.length > 1 && (
        <div style={{ margin: '8px 0 4px', height: 50 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line type="monotone" dataKey="value" stroke="#9ca3af" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {yearStart && yearEnd && (
        <div style={{ fontSize: '0.76rem', color: '#aaa', marginTop: 2 }}>
          {yearStart}–{yearEnd}
        </div>
      )}
    </div>
  );
}

const TrendsTab = ({ company }) => {
  const [activeFilter, setActiveFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/financials/${company.ticker}/trends`);
        if (!res.ok) throw new Error('Failed to load trends');
        setData(await res.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [company.ticker]);

  if (loading) return <div className="text-center py-5"><Spinner animation="border" /></div>;
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (selected) return <TrendDetailView metric={selected} onBack={() => setSelected(null)} />;

  const statements = ['Income Statement', 'Balance Sheet', 'Cash Flow'];
  const visibleStatements = activeFilter === 'All' ? statements : [activeFilter];
  const limit = activeFilter === 'All' ? 6 : 9;

  function getMetrics(stmt) {
    const all = data[stmt] || [];
    const filtered = search
      ? all.filter(m => m.metric.toLowerCase().includes(search.toLowerCase()))
      : all;
    return filtered.slice(0, limit);
  }

  const totalCount = visibleStatements.reduce((sum, s) => sum + getMetrics(s).length, 0);

  return (
    <div>
      {/* Filter pills */}
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            style={{
              padding: '6px 16px',
              borderRadius: 20,
              border: '1px solid',
              borderColor: activeFilter === f ? '#111' : '#d1d5db',
              background: activeFilter === f ? '#111' : '#fff',
              color: activeFilter === f ? '#fff' : '#374151',
              fontWeight: 500,
              fontSize: '0.88rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search metrics..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '7px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: '0.9rem',
            width: 220,
            outline: 'none',
          }}
        />
      </div>

      <div className="mb-4" style={{ fontSize: '0.85rem', color: '#888' }}>
        {totalCount} metrics
      </div>

      {/* Statement sections */}
      {visibleStatements.map(stmt => {
        const metrics = getMetrics(stmt);
        if (!metrics.length) return null;
        return (
          <div key={stmt} className="mb-5">
            <div style={{
              fontSize: '0.73rem',
              fontWeight: 700,
              letterSpacing: '0.09em',
              color: '#6b7280',
              marginBottom: 14,
            }}>
              {STATEMENT_LABELS[stmt]}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}>
              {metrics.map(m => (
                <MetricCard key={m.id || m.metric} metric={m} onClick={() => setSelected(m)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TrendsTab;
