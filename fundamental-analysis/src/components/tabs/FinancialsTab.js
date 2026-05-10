import React, { useEffect, useState, useCallback } from 'react';
import { Card, Table, Button, Spinner, Alert, ButtonGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

// Labels that are per-share, ratios, or share counts — not dollar amounts
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

function formatPeriodHeader(dateStr, periodType) {
  const d = new Date(dateStr + 'T00:00:00');
  if (periodType === 'annual') {
    return `FY ${d.getFullYear()}`;
  }
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `${month} '${String(d.getFullYear()).slice(2)}`;
}

function formatValue(val) {
  if (val === null || val === undefined) return '—';
  const millions = val / 1_000_000;
  if (Math.abs(millions) < 0.05) return '—';
  return millions.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

const STATEMENT_OPTIONS = [
  { key: 'income',   label: 'Income Statement' },
  { key: 'balance',  label: 'Balance Sheet' },
  { key: 'cashflow', label: 'Cash Flow' },
];

const FinancialsTab = ({ company }) => {
  const navigate = useNavigate();
  const [activeStatement, setActiveStatement] = useState('income');
  const [activePeriod, setActivePeriod] = useState('annual');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStatement = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const url = `${process.env.REACT_APP_API_URL}/api/financials/${company.ticker}/statements?statement=${activeStatement}&period=${activePeriod}`;
      const res = await fetch(url);
      if (res.status === 404) {
        setError('No financial data found. Run the pipeline to fetch this company\'s statements.');
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
    // drop rows where every value is null or 0
    return Object.values(row.values).some(v => v !== null && v !== 0);
  }) ?? [];

  return (
    <div>
      {/* Statement type selector */}
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
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

        {/* Annual / Quarterly toggle */}
        <ButtonGroup size="sm">
          {['annual', 'quarterly'].map(p => (
            <Button
              key={p}
              variant={activePeriod === p ? 'dark' : 'outline-secondary'}
              onClick={() => setActivePeriod(p)}
              style={{ textTransform: 'capitalize' }}
            >
              {p === 'annual' ? 'Annual' : 'Quarterly'}
            </Button>
          ))}
        </ButtonGroup>
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
              <div className="text-muted small px-3 pt-3 pb-2">
                {activePeriod === 'annual' ? 'Annual' : 'Quarterly'} · USD (millions)
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
                        {data.periods.map(p => (
                          <td key={p} className="text-end" style={{ paddingRight: '1rem', color: '#444' }}>
                            {formatValue(row.values[p])}
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
