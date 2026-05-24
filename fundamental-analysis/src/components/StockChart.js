import React, { useEffect, useState, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer,
} from 'recharts';
import { Spinner } from 'react-bootstrap';

const PERIODS = ['1m', '3m', '6m', '1y', '2y', '5y'];

function formatPrice(val) {
  if (val == null || isNaN(val)) return '--';
  return `$${val.toFixed(2)}`;
}

function formatAxisPrice(val) {
  if (val >= 1000) return `$${(val / 1000).toFixed(1)}k`;
  return `$${val.toFixed(0)}`;
}

function formatDateLabel(dateStr, period) {
  const d = new Date(dateStr);
  if (period === '1m') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

const TICK_COUNTS = { '1m': 4, '3m': 3, '6m': 6, '1y': 6, '2y': 8, '5y': 10 };

function pickTicks(data, period) {
  const n = TICK_COUNTS[period] ?? 6;
  if (data.length <= n) return data.map(d => d.date);
  const step = Math.floor(data.length / n);
  return data.filter((_, i) => i % step === 0).map(d => d.date);
}

const StockChart = ({ ticker }) => {
  const [data, setData] = useState([]);
  const [period, setPeriod] = useState('1y');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/api/stock/${ticker}/history?period=${period}`
      );
      if (!res.ok) throw new Error('Failed to load stock data');
      const rows = await res.json();
      setData(rows.map(d => ({ date: d.date, value: d.close })));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [ticker, period]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const first = data[0]?.value;
  const latest = data[data.length - 1]?.value;
  const gain = first != null && latest != null ? latest - first : null;
  const gainPct = gain != null && first ? (gain / first) * 100 : null;
  const isUp = gain == null || gain >= 0;
  const color = isUp ? '#16a34a' : '#dc2626';

  const ticks = pickTicks(data, period);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Period toggle + gain badge */}
      <div className="d-flex gap-1 mb-3 align-items-center">
        {PERIODS.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '3px 10px',
              borderRadius: 20,
              border: '1px solid',
              borderColor: period === p ? '#111' : '#d1d5db',
              background: period === p ? '#111' : '#fff',
              color: period === p ? '#fff' : '#374151',
              fontWeight: 500,
              fontSize: '0.8rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {p.toUpperCase()}
          </button>
        ))}
        {gain != null && (
          <span className="ms-auto" style={{ fontSize: '0.82rem', fontWeight: 600, color }}>
            {isUp ? '+' : ''}{gain.toFixed(2)} ({gainPct >= 0 ? '+' : ''}{gainPct.toFixed(2)}%)
          </span>
        )}
      </div>

      {loading && (
        <div className="d-flex justify-content-center align-items-center flex-grow-1" style={{ minHeight: 260 }}>
          <Spinner animation="border" size="sm" />
        </div>
      )}
      {error && !loading && (
        <div className="text-danger small text-center mt-3">{error}</div>
      )}
      {!loading && !error && (
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 16 }}>
            <defs>
              <linearGradient id={`grad-${ticker}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.15} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              ticks={ticks}
              tickFormatter={d => formatDateLabel(d, period)}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              domain={['auto', 'auto']}
              tickFormatter={formatAxisPrice}
              tick={{ fontSize: 12 }}
              width={64}
            />
            <Tooltip
              formatter={v => [formatPrice(v), 'Price']}
              labelFormatter={d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              labelStyle={{ fontWeight: 600 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#grad-${ticker})`}
              dot={false}
              activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default StockChart;
