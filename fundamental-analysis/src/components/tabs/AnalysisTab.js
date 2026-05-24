import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';

const POLL_INTERVAL_MS = 3000;

const TIER_COLORS = {
  1: { bg: '#f0f4ff', color: '#2563eb' },
  2: { bg: '#f0fdf4', color: '#16a34a' },
  3: { bg: '#fffbeb', color: '#d97706' },
  4: { bg: '#fdf2f8', color: '#9333ea' },
  5: { bg: '#fff1f2', color: '#e11d48' },
};

function StatusBadge({ status }) {
  const styles = {
    pending:   { bg: '#f3f4f6', color: '#6b7280', label: 'Pending' },
    running:   { bg: '#eff6ff', color: '#2563eb', label: 'Running…' },
    completed: { bg: '#f0fdf4', color: '#16a34a', label: 'Completed' },
    failed:    { bg: '#fef2f2', color: '#dc2626', label: 'Failed' },
  };
  const s = styles[status] || styles.pending;
  return (
    <span style={{
      padding: '0.15rem 0.6rem', borderRadius: 999,
      background: s.bg, color: s.color,
      fontSize: '0.75rem', fontWeight: 600,
    }}>
      {s.label}
    </span>
  );
}

const AnalysisTab = ({ company }) => {
  const navigate = useNavigate();
  const { authFetch } = useAuth();

  const [analyses,  setAnalyses]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const pollRef = useRef(null);

  const fetchAnalyses = useCallback(async () => {
    try {
      const res = await authFetch(
        `${process.env.REACT_APP_API_URL}/api/analyses/user?ticker=${company.ticker}`
      );
      if (res.ok) setAnalyses(await res.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [authFetch, company.ticker]);

  // Poll while any analysis is still in-flight
  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  useEffect(() => {
    const hasActive = analyses.some(a => a.status === 'pending' || a.status === 'running');
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(fetchAnalyses, POLL_INTERVAL_MS);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {};
  }, [analyses, fetchAnalyses]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const handleNewAnalysis = () => {
    navigate(`/companies/${company.ticker}/new-analysis`, { state: { company } });
  };

  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }) : '—';

  return (
    <div>
      {/* Header */}
      <div className="d-flex align-items-start justify-content-between mb-3">
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Analysis reports</div>
          <div className="text-muted" style={{ fontSize: '0.875rem', marginTop: 2 }}>
            AI-generated fundamental analysis of {company.name} filings
          </div>
        </div>
        <button onClick={handleNewAnalysis} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1.1rem', borderRadius: 8, border: '1.5px solid #dee2e6', background: '#fff', fontWeight: 500, fontSize: '0.9rem', cursor: 'pointer', color: '#111', whiteSpace: 'nowrap' }}>
          + New analysis
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="d-flex justify-content-center py-5">
          <Spinner animation="border" size="sm" />
        </div>
      )}

      {/* Empty state */}
      {!loading && analyses.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '3rem 1.5rem', textAlign: 'center' }}>
          <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.3rem', color: '#111' }}>No analyses yet</div>
          <div className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            Run your first analysis to get AI-powered insights from {company.name} filings.
          </div>
          <button onClick={handleNewAnalysis} style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: 'none', background: '#1a1a1a', color: '#fff', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer' }}>
            + New analysis
          </button>
        </div>
      )}

      {/* Analyses list */}
      {!loading && analyses.length > 0 && (
        <div className="d-flex flex-column gap-2">
          {analyses.map(analysis => {
            const tc = TIER_COLORS[analysis.tierLevel] || TIER_COLORS[1];
            const isActive = analysis.status === 'pending' || analysis.status === 'running';

            return (
              <div key={analysis._id} style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
                padding: '1rem 1.25rem',
                display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
              }}>
                {/* Tier badge */}
                <div style={{
                  padding: '0.25rem 0.65rem', borderRadius: 6,
                  background: tc.bg, color: tc.color,
                  fontSize: '0.75rem', fontWeight: 700, flexShrink: 0,
                }}>
                  {analysis.tierLevel !== 'custom' ? `Tier ${analysis.tierLevel}` : 'Custom'}
                </div>

                {/* Name + date */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {analysis.tierName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2 }}>
                    {fmtDate(analysis.createdAt)}
                    {analysis.actualCostGBP != null && (
                      <> · <span style={{ color: '#374151', fontWeight: 500 }}>£{Number(analysis.actualCostGBP).toFixed(4)}</span></>
                    )}
                  </div>
                </div>

                {/* Spinning indicator for in-flight analyses */}
                {isActive && (
                  <Spinner animation="border" size="sm" style={{ color: '#2563eb', flexShrink: 0 }} />
                )}

                {/* Status badge */}
                <StatusBadge status={analysis.status} />

                {/* View report button (completed only) */}
                {analysis.status === 'completed' && (
                  <button
                    onClick={() => navigate(`/companies/${company.ticker}/analyses/${analysis._id}`)}
                    style={{
                      padding: '0.4rem 0.9rem', borderRadius: 7,
                      border: '1.5px solid #2563eb', background: '#fff',
                      color: '#2563eb', fontWeight: 600, fontSize: '0.82rem',
                      cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                    }}
                  >
                    View report →
                  </button>
                )}

                {/* Retry / error note for failed */}
                {analysis.status === 'failed' && (
                  <span style={{ fontSize: '0.78rem', color: '#dc2626', flexShrink: 0 }}>
                    Failed
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AnalysisTab;
