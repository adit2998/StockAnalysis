import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Spinner } from 'react-bootstrap';
import { ChevronRight, ChevronDown, TrendingUp, BarChart2, Download } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import AnalysisText from './AnalysisText';

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

// Chip shown in report for each piece of embedded data attached to a question
function EmbeddedDataChip({ chart }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '0.15rem 0.6rem',
      borderRadius: 20, background: '#eff6ff',
      border: '1px solid #bfdbfe',
      fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 500,
    }}>
      {chart.icon === 'trend'
        ? <TrendingUp size={10} style={{ flexShrink: 0 }} />
        : <BarChart2 size={10} style={{ flexShrink: 0 }} />
      }
      {chart.label}
    </div>
  );
}

// Key findings callout with blue left border
function KeyFindingsCallout({ findings }) {
  if (!findings?.length) return null;
  return (
    <div style={{
      borderLeft: '4px solid #2563eb',
      paddingLeft: '1rem', marginBottom: '1.25rem',
      paddingTop: '0.6rem', paddingBottom: '0.6rem',
    }}>
      <div style={{
        fontSize: '0.7rem', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.08em',
        color: '#1d4ed8', marginBottom: '0.5rem',
      }}>
        KEY FINDINGS
      </div>
      {findings.map((finding, i) => {
        const isWarning = /\b(risk|concern|caution|pressure|decline|weak|headwind|but|however|note|caveat)\b/i.test(finding);
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: i < findings.length - 1 ? '0.5rem' : 0 }}>
            <span style={{ color: isWarning ? '#d97706' : '#16a34a', fontWeight: 700, flexShrink: 0, lineHeight: 1.6, fontSize: '0.875rem' }}>
              {isWarning ? '⚠' : '✓'}
            </span>
            <span style={{ fontSize: '0.875rem', color: '#111', lineHeight: 1.6 }}>
              {finding}
            </span>
          </div>
        );
      })}
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
  // Set of question indices the user has explicitly collapsed
  const [collapsedQuestions, setCollapsedQuestions] = useState(new Set());

  const pollRef = useRef(null);

  const handleDownloadPDF = () => {
    const saved = new Set(collapsedQuestions);
    setCollapsedQuestions(new Set());
    setTimeout(() => {
      window.print();
      setCollapsedQuestions(saved);
    }, 150);
  };

  const toggleQuestion = (idx) => {
    setCollapsedQuestions(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

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

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .container, .container-fluid { max-width: 100% !important; padding: 0 !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      {/* Breadcrumb */}
      <div className="no-print d-flex align-items-center gap-2 mb-4" style={{ fontSize: '0.875rem', color: '#6b7280' }}>
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
          {analysis?.status === 'completed' && (
            <button
              className="no-print"
              onClick={handleDownloadPDF}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0.4rem 0.85rem', borderRadius: 7,
                background: '#2563eb', color: '#fff',
                border: 'none', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: 600,
              }}
            >
              <Download size={13} />
              Download PDF
            </button>
          )}
        </div>

        <div className="d-flex align-items-center gap-2 mt-2" style={{ fontSize: '0.82rem', color: '#6b7280' }}>
          <span>Created {fmtDate(analysis?.createdAt)}</span>
          {analysis?.completedAt && (
            <><span style={{ color: '#d1d5db' }}>·</span><span>Completed {fmtDate(analysis?.completedAt)}</span></>
          )}
        </div>

        {/* Cost row */}
        <div className="no-print d-flex gap-2 mt-3 flex-wrap">
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

      {/* Completed report */}
      {analysis?.status === 'completed' && Array.isArray(analysis?.report) && (
        <div className="d-flex flex-column gap-3">
          {analysis.report.map((item, idx) => {
            const isCollapsed    = collapsedQuestions.has(idx);
            const embeddedChips  = analysis.questionEmbeddedData?.[idx] ?? [];
            // Support both new format {key_findings, analysis} and legacy format {a}
            const bodyText       = item.analysis ?? item.a ?? '';
            const keyFindings    = item.key_findings ?? [];
            const sources        = item.sources ?? [];

            return (
              <div key={idx} style={{
                background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
                overflow: 'hidden',
              }}>
                {/* Collapsible question header */}
                <button
                  onClick={() => toggleQuestion(idx)}
                  style={{
                    width: '100%', padding: '0.85rem 1.25rem',
                    background: '#f9fafb', border: 'none',
                    borderBottom: isCollapsed ? 'none' : '1px solid #e5e7eb',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                    background: '#f0f4ff', color: '#2563eb',
                    fontSize: '0.72rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    Q{idx + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#111', paddingTop: 4 }}>
                      {item.q}
                    </div>
                    {isCollapsed && (
                      <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 3 }}>
                        Click to expand full question
                      </div>
                    )}
                  </div>
                  {isCollapsed
                    ? <ChevronRight size={14} style={{ color: '#9ca3af', flexShrink: 0, marginTop: 6 }} />
                    : <ChevronDown  size={14} style={{ color: '#9ca3af', flexShrink: 0, marginTop: 6 }} />
                  }
                </button>

                {/* Expanded body */}
                {!isCollapsed && (
                  <div style={{ padding: '1.1rem 1.25rem' }}>

                    {/* Key findings callout */}
                    <KeyFindingsCallout findings={keyFindings} />

                    {/* Embedded data chips */}
                    {embeddedChips.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '1rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontWeight: 500, marginRight: 2 }}>Data:</span>
                        {embeddedChips.map(chart => (
                          <EmbeddedDataChip key={chart.id} chart={chart} />
                        ))}
                        <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontStyle: 'italic' }}>
                          — embedded from report configuration
                        </span>
                      </div>
                    )}

                    {/* Analysis text — markdown-aware renderer */}
                    <AnalysisText text={bodyText} />

                    {/* Source citations */}
                    {sources.length > 0 && (
                      <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.4rem' }}>
                          Sources
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {sources.map((source, sIdx) => (
                            <div key={sIdx} style={{ padding: '0.2rem 0.55rem', borderRadius: 6, background: '#f9fafb', border: '1px solid #e5e7eb', fontSize: '0.72rem', color: '#6b7280' }}>
                              {source}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </Container>
  );
};

export default AnalysisReportPage;
