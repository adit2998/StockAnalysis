import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Button, Spinner, Alert, ButtonGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const NON_DOLLAR_LABELS = new Set([
  'Tax Rate For Calcs',
  'Tax Effect Of Unusual Items',
  'Diluted EPS',
  'Basic EPS',
  'Diluted Average Shares',
  'Basic Average Shares',
  'Ordinary Shares Number',
  'Share Issued',
  'Treasury Shares Number',
]);

const DENOM_INFO = {
  income:   { rowLabel: 'Total Revenue', displayName: 'Revenue' },
  balance:  { rowLabel: 'Total Assets',  displayName: 'Total Assets' },
  cashflow: { rowLabel: 'Total Revenue', displayName: 'Revenue' },
};

function formatPeriodHeader(dateStr, periodType) {
  const d = new Date(dateStr + 'T00:00:00');
  if (periodType === 'annual') return `FY ${d.getFullYear()}`;
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `${month} '${String(d.getFullYear()).slice(2)}`;
}

function formatValue(val) {
  if (val === null || val === undefined) return '—';
  const millions = val / 1_000_000;
  if (Math.abs(millions) < 0.05) return '—';
  return millions.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPct(val, prevVal) {
  if (val === null || val === undefined) return '—';
  const sign = val < 0 ? '-' : '';
  const text = `${sign}${Math.abs(val).toFixed(1)}%`;
  if (prevVal === null || prevVal === undefined) return <span>{text}</span>;
  const dir = val > prevVal ? 'up' : val < prevVal ? 'down' : null;
  return (
    <span>
      {text}
      {dir === 'up'   && <span style={{ color: '#16a34a', marginLeft: 2, fontSize: '0.75rem' }}>↑</span>}
      {dir === 'down' && <span style={{ color: '#dc2626', marginLeft: 2, fontSize: '0.75rem' }}>↓</span>}
    </span>
  );
}

function formatBillions(val) {
  if (val === null || val === undefined) return null;
  const b = Math.abs(val) / 1e9;
  return `$${b.toFixed(0)}B`;
}

const STATEMENT_OPTIONS = [
  { key: 'income',   label: 'Income Statement' },
  { key: 'balance',  label: 'Balance Sheet' },
  { key: 'cashflow', label: 'Cash Flow' },
];


const FinancialsTab = ({ company }) => {
  const navigate = useNavigate();
  const [activeStatement, setActiveStatement] = useState('income');
  const [activePeriod, setActivePeriod]       = useState('annual');
  const [activeView, setActiveView]           = useState('$');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  const fetchStatement = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const url = `${process.env.REACT_APP_API_URL}/api/financials/${company.ticker}/statements?statement=${activeStatement}&period=${activePeriod}`;
      const res = await fetch(url);
      if (res.status === 404) {
        setError("No financial data found. Run the pipeline to fetch this company's statements.");
        return;
      }
      if (!res.ok) throw new Error('Failed to load data');
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [company.ticker, activeStatement, activePeriod]);

  useEffect(() => { fetchStatement(); }, [fetchStatement]);

  const visibleRows = data?.rows?.filter(row => {
    if (NON_DOLLAR_LABELS.has(row.label)) return false;
    if (activeView === '%') {
      return row.common_sized_values &&
        Object.values(row.common_sized_values).some(v => v !== null);
    }
    return Object.values(row.values).some(v => v !== null && v !== 0);
  }) ?? [];

  const denomInfo        = DENOM_INFO[activeStatement];
  const denomRow         = data?.rows?.find(r => r.label === denomInfo.rowLabel);
  const mostRecentPeriod = data?.periods?.[0];
  const denomBillions    = formatBillions(denomRow?.values?.[mostRecentPeriod]);
  const mostRecentHeader = mostRecentPeriod
    ? formatPeriodHeader(mostRecentPeriod, activePeriod)
    : '';

  return (
    <div>
      {/* All controls in one row */}
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <ButtonGroup size="sm">
          {STATEMENT_OPTIONS.map(({ key, label }) => (
            <Button
              key={key}
              variant={activeStatement === key ? 'dark' : 'outline-secondary'}
              onClick={() => setActiveStatement(key)}
            >
              {label}
            </Button>
          ))}
        </ButtonGroup>

        <div className="d-flex align-items-center gap-2 ms-auto">
        <ButtonGroup size="sm">
          {['$', '%'].map(v => (
            <Button
              key={v}
              variant={activeView === v ? 'dark' : 'outline-secondary'}
              onClick={() => setActiveView(v)}
            >
              {v}
            </Button>
          ))}
        </ButtonGroup>

        <ButtonGroup size="sm">
          {['annual', 'quarterly'].map(p => (
            <Button
              key={p}
              variant={activePeriod === p ? 'dark' : 'outline-secondary'}
              onClick={() => setActivePeriod(p)}
            >
              {p === 'annual' ? 'Annual' : 'Quarterly'}
            </Button>
          ))}
        </ButtonGroup>
        </div>
      </div>

      <Card className="shadow-sm">
        <Card.Body className="p-0">
          {loading && (
            <div className="text-center p-4">
              <Spinner animation="border" size="sm" className="me-2" />
              <span className="text-muted">Loading...</span>
            </div>
          )}

          {error && !loading && (
            <Alert variant="warning" className="m-3 mb-0">{error}</Alert>
          )}

          {data && !loading && (
            <>
              <div className="d-flex justify-content-between align-items-center px-3 pt-3 pb-2">
                <span className="text-muted small">
                  {activePeriod === 'annual' ? 'Annual' : 'Quarterly'}
                  {activeView === '$'
                    ? ' · USD (millions)'
                    : ` · % of ${denomInfo.displayName}`}
                </span>
                {activeView === '%' && denomBillions && (
                  <span className="text-muted small">
                    {`Each value as a % of ${denomInfo.displayName} (${denomBillions} ${mostRecentHeader} est.)`}
                  </span>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <Table hover size="sm" className="mb-0" style={{ minWidth: 500 }}>
                  <thead>
                    <tr className="text-muted" style={{ fontSize: '0.82rem' }}>
                      <th style={{ minWidth: 220, paddingLeft: '1rem' }}>Metric</th>
                      {data.periods.map(p => (
                        <th key={p} className="text-end" style={{ paddingRight: '1rem' }}>
                          {formatPeriodHeader(p, activePeriod)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody style={{ fontSize: '0.85rem' }}>
                    {visibleRows.map(row => (
                      <tr key={row.label}>
                        <td style={{ paddingLeft: '1rem', color: '#333' }}>{row.label}</td>
                        {data.periods.map((p, i) => (
                          <td key={p} className="text-end" style={{ paddingRight: '1rem', color: '#444' }}>
                            {activeView === '$'
                              ? formatValue(row.values[p])
                              : formatPct(
                                  row.common_sized_values?.[p],
                                  row.common_sized_values?.[data.periods[i + 1]]
                                )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      <div className="mt-3">
        <Button variant="outline-dark" size="sm" onClick={() => navigate(`/financials/${company.ticker}`)}>
          View Full Financials
        </Button>
      </div>
    </div>
  );
};

export default FinancialsTab;
