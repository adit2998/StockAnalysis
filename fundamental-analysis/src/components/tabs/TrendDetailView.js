import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer,
} from 'recharts';

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

function toQuarterLabel(dateStr) {
  const d = new Date(dateStr);
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `Q${q} ${d.getFullYear()}`;
}

function getAnnualValues(values) {
  const byYear = {};
  for (const v of values) {
    const year = new Date(v.date).getFullYear();
    if (!byYear[year] || v.date > byYear[year].date) {
      byYear[year] = v;
    }
  }
  return Object.values(byYear).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function calcStats(annualValues) {
  if (!annualValues.length) return {};
  const latest = annualValues[annualValues.length - 1].value;
  const latestYear = new Date(annualValues[annualValues.length - 1].date).getFullYear();
  const prev = annualValues.length >= 2 ? annualValues[annualValues.length - 2].value : null;
  const change1Y = prev ? ((latest - prev) / Math.abs(prev)) * 100 : null;
  const ago5 = annualValues.length >= 6 ? annualValues[annualValues.length - 6].value : null;
  const cagr5y = ago5 && ago5 !== 0 ? (Math.pow(Math.abs(latest / ago5), 1 / 5) - 1) * 100 : null;
  const last5 = annualValues.slice(-5).map(v => v.value);
  const avg5y = last5.length ? last5.reduce((a, b) => a + b, 0) / last5.length : null;
  return { latest, latestYear, change1Y, cagr5y, avg5y };
}

const TrendDetailView = ({ metric, onBack }) => {
  const [granularity, setGranularity] = useState('annual');
  const [showFullDesc, setShowFullDesc] = useState(false);

  const sorted = (metric.values || []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const annualValues = getAnnualValues(sorted);
  const displayValues = granularity === 'annual' ? annualValues : sorted;

  const stats = calcStats(annualValues);
  const yearStart = annualValues.length ? new Date(annualValues[0].date).getFullYear() : '';
  const yearEnd = annualValues.length ? new Date(annualValues[annualValues.length - 1].date).getFullYear() : '';

  const chartData = displayValues.map(v => ({
    label: granularity === 'annual'
      ? String(new Date(v.date).getFullYear())
      : toQuarterLabel(v.date),
    value: v.value,
  }));

  const statItems = [
    { label: `LATEST (${stats.latestYear || ''})`, value: formatVal(stats.latest) },
    {
      label: '1Y CHANGE',
      value: stats.change1Y != null ? `${stats.change1Y >= 0 ? '+' : ''}${stats.change1Y.toFixed(1)}%` : '--',
      color: stats.change1Y != null ? (stats.change1Y >= 0 ? '#16a34a' : '#dc2626') : '#111',
    },
    {
      label: '5Y CAGR',
      value: stats.cagr5y != null ? `${stats.cagr5y.toFixed(1)}%` : '--',
    },
    { label: '5Y AVG', value: formatVal(stats.avg5y) },
  ];

  const tableRows = [...displayValues].reverse();

  return (
    <div>
      {/* Breadcrumb */}
      <div className="d-flex align-items-center gap-3 mb-4" style={{ fontSize: '0.9rem', color: '#555' }}>
        <button
          onClick={onBack}
          style={{
            background: '#f3f4f6',
            border: 'none',
            borderRadius: 20,
            padding: '5px 14px',
            fontSize: '0.88rem',
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          ← All trends
        </button>
        <span>{metric.statement} · {metric.metric}</span>
      </div>

      {/* Title */}
      <h3 style={{ fontWeight: 700, marginBottom: 4 }}>{metric.metric}</h3>
      <div style={{ color: '#666', fontSize: '0.9rem', marginBottom: 24 }}>
        {metric.statement} · {yearStart}–{yearEnd}
      </div>

      {/* Description */}
      {metric.description && (
        <div style={{
          background: '#f5f5f4',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 24,
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: '1rem', color: '#555', flexShrink: 0, marginTop: 1 }}>⊟</span>
          <div style={{ fontSize: '0.9rem', color: '#444', lineHeight: 1.6 }}>
            <span>
              {showFullDesc
                ? metric.description
                : metric.description.slice(0, 160) + (metric.description.length > 160 ? '...' : '')}
            </span>
            {metric.description.length > 160 && (
              <div>
                <button
                  onClick={() => setShowFullDesc(v => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '0.9rem',
                    fontWeight: 500,
                    marginTop: 4,
                  }}
                >
                  {showFullDesc ? 'Show less' : 'Show full definition'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="d-flex gap-3 flex-wrap mb-4">
        {statItems.map(s => (
          <div
            key={s.label}
            style={{
              background: '#f9fafb',
              borderRadius: 10,
              padding: '12px 20px',
              minWidth: 120,
            }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.07em', color: '#888', marginBottom: 4 }}>
              {s.label}
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: s.color || '#111' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Granularity toggle */}
      <div className="d-flex gap-2 mb-3">
        {['annual', 'quarterly'].map(g => (
          <button
            key={g}
            onClick={() => setGranularity(g)}
            style={{
              padding: '4px 14px',
              borderRadius: 20,
              border: '1px solid',
              borderColor: granularity === g ? '#111' : '#ccc',
              background: granularity === g ? '#111' : '#fff',
              color: granularity === g ? '#fff' : '#555',
              fontSize: '0.82rem',
              fontWeight: 500,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {g.charAt(0).toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 16px', marginBottom: 28 }}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={v => formatVal(v)}
              width={72}
            />
            <Tooltip
              formatter={(v) => [formatVal(v), metric.metric]}
              labelStyle={{ fontWeight: 600 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#2563eb"
              strokeWidth={2}
              dot={{ r: 4, fill: '#2563eb', strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Data table */}
      <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', color: '#888', marginBottom: 12 }}>
        {granularity === 'annual' ? 'ANNUAL DATA' : 'QUARTERLY DATA'}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {tableRows.map((v, i) => {
            const prev = tableRows[i + 1];
            const pct = prev && prev.value ? ((v.value - prev.value) / Math.abs(prev.value)) * 100 : null;
            const label = granularity === 'annual'
              ? String(new Date(v.date).getFullYear())
              : toQuarterLabel(v.date);
            return (
              <tr key={v.date} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td style={{ padding: '10px 0', color: '#555', width: 100 }}>{label}</td>
                <td style={{ padding: '10px 0', fontWeight: 600, textAlign: 'right' }}>
                  {formatVal(v.value)}
                </td>
                <td style={{ padding: '10px 0', textAlign: 'right', width: 90 }}>
                  {pct != null ? (
                    <span style={{ color: pct >= 0 ? '#16a34a' : '#dc2626', fontSize: '0.85rem' }}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                    </span>
                  ) : (
                    <span style={{ color: '#ccc' }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TrendDetailView;
