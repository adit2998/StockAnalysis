import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Spinner } from 'react-bootstrap';
import { useAuth } from '../context/AuthContext';

const STATUS_POLL_INTERVAL_MS = 3000;

const TIER_COLORS = {
  1: { bg: '#f0f4ff', color: '#2563eb', border: '#c7d7fd' },
  2: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
  3: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  4: { bg: '#fdf2f8', color: '#9333ea', border: '#e9d5ff' },
  5: { bg: '#fff1f2', color: '#e11d48', border: '#fecdd3' },
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
      padding: '0.2rem 0.65rem', borderRadius: 999,
      background: s.bg, color: s.color,
      fontSize: '0.78rem', fontWeight: 600,
    }}>
      {s.label}
    </span>
  );
}

function CostPill({ label, value, highlight }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
      padding: '0.6rem 0.9rem', borderRadius: 8,
      background: highlight ? '#f0f4ff' : '#f9fafb',
      border: `1px solid ${highlight ? '#c7d7fd' : '#e5e7eb'}`,
      minWidth: 120,
    }}>
      <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: '1rem', fontWeight: 700, color: highlight ? '#2563eb' : '#111', marginTop: 2 }}>
        {value}
      </span>
    </div>
  );
}

const AnalysisReportPage = () => {
  const { ticker, analysisId } = useParams();
  const navigate = useNavigate();
  const { authFetch } = useAuth();

  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const pollRef = useRef(null);

  const fetchAnalysis = async () => {
    try {
      const res = await authFetch(
        `${process.env.REACT_APP_API_URL}/api/analyses/${analysisId}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load analysis');
      }
      const data = await res.json();
      setAnalysis(data);
      setLoading(false);

      // Stop polling once terminal state is reached
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    fetchAnalysis();
    // Start polling — we stop it inside fetchAnalysis once status is terminal
    pollRef.current = setInterval(fetchAnalysis, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisId]);

  const tierColors = TIER_COLORS[analysis?.tierLevel] || TIER_COLORS[1];

  const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }) : '—';

  const fmtCost = (val) =>
    val != null ? `£${Number(val).toFixed(4)}` : '—';

  if (loading && !analysis) {
    return (
      <Container className="mt-5 text-center">
        <Spinner animation="border" size="sm" />
        <div style={{ marginTop: 12, color: '#6b7280', fontSize: '0.9rem' }}>Loading analysis…</div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-5">
        <div style={{ color: '#dc2626', fontWeight: 600 }}>Error: {error}</div>
        <button
          onClick={() => navigate(`/companies/${ticker}`, { state: { defaultTab: 'analysis' } })}
          style={{ marginTop: 12, background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0 }}
        >
          ← Back to Analysis
        </button>
      </Container>
    );
  }

  return (
    <Container className="mt-4" style={{ maxWidth: 860 }}>

      {/* Breadcrumb */}
      <div className="d-flex align-items-center gap-2 mb-4" style={{ fontSize: '0.875rem', color: '#6b7280' }}>
        <button
          onClick={() => navigate(`/companies/${ticker}`, { state: { defaultTab: 'analysis' } })}
          style={{ background: 'none', border: 'none', padding: 0, color: '#6b7280', cursor: 'pointer', fontSize: '0.875rem' }}
        >
          Analysis
        </button>
        <span style={{ color: '#d1d5db' }}>›</span>
        <span style={{ color: '#111', fontWeight: 500 }}>
          {analysis?.tierName || 'Report'}
        </span>
      </div>

      {/* Header card */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
        padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
      }}>
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <div style={{
            padding: '0.3rem 0.75rem', borderRadius: 6,
            background: tierColors.bg, color: tierColors.color,
            border: `1px solid ${tierColors.border}`,
            fontSize: '0.8rem', fontWeight: 700,
          }}>
            {analysis?.tierLevel !== 'custom' ? `Tier ${analysis?.tierLevel}` : 'Custom'}
          </div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', flex: 1 }}>
            {analysis?.companyName} ({analysis?.ticker}) — {analysis?.tierName}
          </div>
          <StatusBadge status={analysis?.status} />
        </div>

        <div className="d-flex align-items-center gap-2 mt-2" style={{ fontSize: '0.82rem', color: '#6b7280' }}>
          <span>Created {fmtDate(analysis?.createdAt)}</span>
          {analysis?.completedAt && (
            <><span style={{ color: '#d1d5db' }}>·</span><span>Completed {fmtDate(analysis?.completedAt)}</span></>
          )}
        </div>

        {/* Cost row */}
        <div className="d-flex gap-2 mt-3 flex-wrap">
          <CostPill label="Estimated cost" value={fmtCost(analysis?.estimatedCostGBP)} />
          <CostPill label="Actual cost" value={fmtCost(analysis?.actualCostGBP)} highlight />
          {analysis?.tokenUsage && (
            <CostPill
              label="Tokens used"
              value={`${(analysis.tokenUsage.inputTokens + analysis.tokenUsage.outputTokens).toLocaleString()}`}
            />
          )}
        </div>
      </div>

      {/* Pending / Running state */}
      {(analysis?.status === 'pending' || analysis?.status === 'running') && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '3rem 1rem', background: '#fff',
          border: '1px solid #e5e7eb', borderRadius: 12,
          marginBottom: '1.5rem',
        }}>
          <Spinner animation="border" style={{ color: '#2563eb', width: 36, height: 36 }} />
          <div style={{ marginTop: 16, fontWeight: 600, fontSize: '1rem' }}>
            {analysis?.status === 'pending' ? 'Queued…' : 'Running analysis…'}
          </div>
          <div style={{ marginTop: 6, color: '#6b7280', fontSize: '0.875rem' }}>
            This usually takes 1–3 minutes. This page refreshes automatically.
          </div>
        </div>
      )}

      {/* Failed state */}
      {analysis?.status === 'failed' && (
        <div style={{
          padding: '1.25rem 1.5rem', background: '#fef2f2',
          border: '1px solid #fecaca', borderRadius: 12, marginBottom: '1.5rem',
        }}>
          <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>Analysis failed</div>
          <div style={{ fontSize: '0.875rem', color: '#7f1d1d' }}>
            {analysis?.error || 'An unexpected error occurred.'}
          </div>
        </div>
      )}

      {/* Completed report — Q&A pairs */}
      {analysis?.status === 'completed' && Array.isArray(analysis?.report) && (
        <div className="d-flex flex-column gap-3">
          {analysis.report.map((item, idx) => (
            <div key={idx} style={{
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
              overflow: 'hidden',
            }}>
              {/* Question bar */}
              <div style={{
                padding: '0.85rem 1.25rem',
                background: '#f9fafb', borderBottom: '1px solid #e5e7eb',
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: '#f0f4ff', color: '#2563eb',
                  fontSize: '0.72rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  Q{idx + 1}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111', paddingTop: 4 }}>
                  {item.q}
                </div>
              </div>

              {/* Answer body */}
              <div style={{ padding: '1rem 1.25rem' }}>
                <div style={{
                  fontSize: '0.9rem', color: '#374151', lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                }}>
                  {item.a}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </Container>
  );
};

export default AnalysisReportPage;
