import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Spinner } from 'react-bootstrap';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const FORM_TYPES = ['10-K', '10-Q', 'DEF 14A'];
const MAX_QUESTIONS  = 10;
const MAX_SELECTIONS = 5;
const MAX_COST_GBP   = 0.50;

const FINANCIAL_STATEMENTS = [
  { key: 'income',   label: 'Income Statement' },
  { key: 'balance',  label: 'Balance Sheet' },
  { key: 'cashflow', label: 'Cash Flow Statement' },
];

function filingPeriodLabel(formType, filing) {
  const reportDate = filing['Report date'];
  if (!reportDate) return '—';
  if (formType === '10-Q') {
    const month = parseInt(reportDate.slice(5, 7), 10);
    const year  = reportDate.slice(0, 4);
    return `Q${Math.ceil(month / 3)} ${year}`;
  }
  return `FY ${reportDate.slice(0, 4)}`;
}

const BADGE_STYLE = {
  display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: 4,
  background: '#f3f4f6', color: '#374151',
  fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.01em',
};

function FilingCheckbox({ state, onClick, disabled }) {
  const filled = state !== 'none';
  return (
    <div
      onClick={disabled && state === 'none' ? undefined : onClick}
      role="checkbox"
      aria-checked={state === 'all' ? true : state === 'partial' ? 'mixed' : false}
      style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: `1.5px solid ${filled ? '#2563eb' : disabled ? '#e5e7eb' : '#d1d5db'}`,
        background: filled ? '#2563eb' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled && state === 'none' ? 'not-allowed' : 'pointer',
        opacity: disabled && state === 'none' ? 0.45 : 1,
      }}
    >
      {state === 'partial' && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1, fontWeight: 900 }}>−</span>}
      {state === 'all'     && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1, fontWeight: 900 }}>✓</span>}
    </div>
  );
}

const NewAnalysisPage = () => {
  const { ticker }   = useParams();
  const navigate     = useNavigate();
  const location     = useLocation();
  const { authFetch } = useAuth();
  const company      = location.state?.company;

  // ── Left panel ─────────────────────────────────────────────────────────────
  const [tierConfigs,     setTierConfigs]     = useState([]);
  const [selectedTier,    setSelectedTier]    = useState(1);
  const tierConfig = tierConfigs.find(t => t.tier === selectedTier) ?? null;
  const [questions,       setQuestions]       = useState([]);
  const [basePrompt,      setBasePrompt]      = useState('');
  const [basePromptLocked,setBasePromptLocked]= useState(true);
  const [showBasePrompt,  setShowBasePrompt]  = useState(false);
  const [logoError,       setLogoError]       = useState(false);

  // ── Right panel: sources ───────────────────────────────────────────────────
  const [filingsByType,    setFilingsByType]   = useState({ '10-K': [], '10-Q': [], 'DEF 14A': [] });
  const [loadingFilings,   setLoadingFilings]  = useState(true);
  const [expandedFormTypes,setExpandedFormTypes]= useState(new Set());
  const [expandedFilings,  setExpandedFilings] = useState(new Set());
  const [sectionsByFile,   setSectionsByFile]  = useState({});
  const [loadingSections,  setLoadingSections] = useState(new Set());
  const [selectedFilings,         setSelectedFilings]          = useState(new Set());
  const [selectedSectionsByFile,  setSelectedSectionsByFile]   = useState({});
  const [expandedReports,         setExpandedReports]          = useState(false);
  const [expandedStatements,      setExpandedStatements]       = useState(new Set());
  const [selectedReportPeriods,   setSelectedReportPeriods]    = useState(new Set());
  const [reportAvailability,      setReportAvailability]       = useState(null);
  const [loadingReportAvailability,setLoadingReportAvailability]= useState(false);

  // ── Cost estimate ──────────────────────────────────────────────────────────
  const [costEstimate,    setCostEstimate]    = useState(null);
  const [loadingCost,     setLoadingCost]     = useState(false);
  const estimateTimerRef  = useRef(null);

  // ── Submission ─────────────────────────────────────────────────────────────
  const [isSubmitting,    setIsSubmitting]    = useState(false);
  const [submitError,     setSubmitError]     = useState(null);

  // ── Fetch tier templates ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchTemplates = async () => {
      try {
        const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/tier-templates`);
        const data = res.ok ? await res.json() : [];
        if (!cancelled && data.length) {
          setTierConfigs(data);
          setQuestions([...data[0].defaultQuestions]);
          setBasePrompt(data[0].basePrompt);
        }
      } catch { /* network failure — tier configs still work via fallback */ }
    };
    fetchTemplates();
    return () => { cancelled = true; };
  }, []);

  // ── Fetch filings ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoadingFilings(true);
      const results = {};
      await Promise.all(
        FORM_TYPES.map(async (formType) => {
          try {
            const res = await fetch(
              `${process.env.REACT_APP_API_URL}/api/company-reports/${ticker}/${encodeURIComponent(formType)}`
            );
            results[formType] = res.ok ? await res.json() : [];
          } catch { results[formType] = []; }
        })
      );
      if (!cancelled) { setFilingsByType(results); setLoadingFilings(false); }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [ticker]);

  const combinedFilings = useMemo(() => {
    const all = [];
    for (const formType of FORM_TYPES) {
      for (const f of filingsByType[formType] ?? []) all.push({ ...f, formType });
    }
    return all.sort((a, b) => (b['Report date'] ?? '').localeCompare(a['Report date'] ?? ''));
  }, [filingsByType]);

  // ── Selection counting ─────────────────────────────────────────────────────
  const selectedCount = useMemo(() =>
    selectedFilings.size +
    Object.values(selectedSectionsByFile).reduce((sum, s) => sum + s.size, 0) +
    selectedReportPeriods.size
  , [selectedFilings, selectedSectionsByFile, selectedReportPeriods]);

  const atLimit = selectedCount >= MAX_SELECTIONS;

  // ── Cost estimation (debounced 600 ms after selection changes) ─────────────
  useEffect(() => {
    if (selectedCount === 0) { setCostEstimate(null); return; }

    clearTimeout(estimateTimerRef.current);
    estimateTimerRef.current = setTimeout(async () => {
      setLoadingCost(true);
      try {
        const sources = buildSources();
        const res = await authFetch(
          `${process.env.REACT_APP_API_URL}/api/analyses/estimate`,
          {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ ticker, sources, questions }),
          }
        );
        if (res.ok) setCostEstimate(await res.json());
      } catch { /* silently ignore */ }
      finally { setLoadingCost(false); }
    }, 600);

    return () => clearTimeout(estimateTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCount, selectedFilings, selectedSectionsByFile, selectedReportPeriods, questions]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  // Builds the sources payload from current selection state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  function buildSources() {
    return {
      filings: [
        ...Array.from(selectedFilings).map(fileName => ({ fileName, sections: null })),
        ...Object.entries(selectedSectionsByFile)
          .filter(([, s]) => s.size > 0)
          .map(([fileName, s]) => ({ fileName, sections: Array.from(s) })),
      ],
      reportPeriods: Array.from(selectedReportPeriods),
    };
  }

  const handleTierSelect = (tier) => {
    const config = tierConfigs.find(t => t.tier === tier);
    if (!config) return;
    setSelectedTier(tier);
    setQuestions([...config.defaultQuestions]);
    setBasePrompt(config.basePrompt);
    setBasePromptLocked(true);
  };

  const handleCustomSelect = () => {
    setSelectedTier('custom');
    setQuestions([]);
    setBasePrompt('');
    setBasePromptLocked(false);
  };

  const toggleFilingExpanded = useCallback(async (filing) => {
    const fileName = filing['File name'];
    setExpandedFilings(prev => {
      const next = new Set(prev);
      next.has(fileName) ? next.delete(fileName) : next.add(fileName);
      return next;
    });
    if (!sectionsByFile[fileName]) {
      setLoadingSections(prev => new Set([...prev, fileName]));
      try {
        const res  = await fetch(`${process.env.REACT_APP_API_URL}/api/report-details/${encodeURIComponent(fileName)}`);
        const data = res.ok ? await res.json() : {};
        setSectionsByFile(prev => ({ ...prev, [fileName]: data.sections ? Object.keys(data.sections) : [] }));
      } catch {
        setSectionsByFile(prev => ({ ...prev, [fileName]: [] }));
      } finally {
        setLoadingSections(prev => { const n = new Set(prev); n.delete(fileName); return n; });
      }
    }
  }, [sectionsByFile]);

  const toggleFormTypeExpanded = useCallback((formType) => {
    setExpandedFormTypes(prev => {
      const next = new Set(prev);
      next.has(formType) ? next.delete(formType) : next.add(formType);
      return next;
    });
  }, []);

  const toggleReportsExpanded = useCallback(async () => {
    const next = !expandedReports;
    setExpandedReports(next);
    if (next && reportAvailability === null && !loadingReportAvailability) {
      setLoadingReportAvailability(true);
      const stmts = ['income', 'balance', 'cashflow'];
      const periods = ['annual', 'quarterly'];
      const availability = {};
      await Promise.all(
        stmts.flatMap(stmt =>
          periods.map(async (period) => {
            try {
              const res = await fetch(
                `${process.env.REACT_APP_API_URL}/api/financials/${ticker}/statements?statement=${stmt}&period=${period}`
              );
              availability[`${stmt}_${period}`] = res.ok;
            } catch { availability[`${stmt}_${period}`] = false; }
          })
        )
      );
      setReportAvailability(availability);
      setLoadingReportAvailability(false);
    }
  }, [expandedReports, reportAvailability, loadingReportAvailability, ticker]);

  const toggleStatementExpanded = useCallback((stmtKey) => {
    setExpandedStatements(prev => {
      const next = new Set(prev);
      next.has(stmtKey) ? next.delete(stmtKey) : next.add(stmtKey);
      return next;
    });
  }, []);

  const toggleReportPeriod = useCallback((stmtKey, period) => {
    const key = `${stmtKey}_${period}`;
    setSelectedReportPeriods(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); return next; }
      if (next.size + selectedFilings.size + Object.values(selectedSectionsByFile).reduce((s, v) => s + v.size, 0) >= MAX_SELECTIONS) return prev;
      next.add(key);
      return next;
    });
  }, [selectedFilings, selectedSectionsByFile]);

  const getFilingCheckState = useCallback((fileName) => {
    if (selectedFilings.has(fileName)) return 'all';
    const sections = selectedSectionsByFile[fileName];
    if (sections && sections.size > 0) return 'partial';
    return 'none';
  }, [selectedFilings, selectedSectionsByFile]);

  const handleFilingCheckboxClick = useCallback((filing) => {
    const fileName = filing['File name'];
    const state    = getFilingCheckState(fileName);
    if (state === 'all') {
      setSelectedFilings(prev => { const n = new Set(prev); n.delete(fileName); return n; });
    } else {
      // Only allow if under limit
      if (atLimit) return;
      setSelectedFilings(prev => new Set([...prev, fileName]));
      setSelectedSectionsByFile(prev => { const n = { ...prev }; delete n[fileName]; return n; });
    }
  }, [getFilingCheckState, atLimit]);

  const toggleSectionSelected = useCallback((fileName, sectionKey) => {
    setSelectedSectionsByFile(prev => {
      const fileSections = new Set(prev[fileName] ?? []);
      if (fileSections.has(sectionKey)) {
        fileSections.delete(sectionKey);
      } else {
        if (atLimit) return prev;
        fileSections.add(sectionKey);
        // Deselect the whole-filing if we're now selecting individual sections
        if (selectedFilings.has(fileName)) {
          setSelectedFilings(f => { const n = new Set(f); n.delete(fileName); return n; });
        }
      }
      return { ...prev, [fileName]: fileSections };
    });
  }, [atLimit, selectedFilings]);

  const selectedTags = useMemo(() => {
    const tags = [];
    for (const fileName of selectedFilings) {
      const filing = combinedFilings.find(f => f['File name'] === fileName);
      if (!filing) continue;
      tags.push({ key: fileName, formType: filing.formType, label: `${ticker} ${filingPeriodLabel(filing.formType, filing)} (all)` });
    }
    for (const [fileName, sections] of Object.entries(selectedSectionsByFile)) {
      const filing = combinedFilings.find(f => f['File name'] === fileName);
      if (!filing) continue;
      for (const section of sections) {
        tags.push({ key: `${fileName}||${section}`, formType: filing.formType, label: `${ticker} — ${section}` });
      }
    }
    for (const key of selectedReportPeriods) {
      const [stmtKey, period] = key.split('_');
      const stmt = FINANCIAL_STATEMENTS.find(s => s.key === stmtKey);
      if (stmt) tags.push({ key: `report_${key}`, formType: 'Reports', label: `${ticker} — ${stmt.label} (${period === 'annual' ? 'Annual' : 'Quarterly'})` });
    }
    return tags;
  }, [selectedFilings, selectedSectionsByFile, combinedFilings, ticker, selectedReportPeriods]);

  // ── Run analysis ───────────────────────────────────────────────────────────
  const handleRunAnalysis = async () => {
    setSubmitError(null);

    if (questions.filter(q => q.trim()).length === 0) {
      setSubmitError('Add at least one question before running.');
      return;
    }
    if (selectedCount === 0) {
      setSubmitError('Select at least one source before running.');
      return;
    }

    setIsSubmitting(true);
    try {
      const sources = buildSources();
      const res = await authFetch(
        `${process.env.REACT_APP_API_URL}/api/analyses`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticker,
            companyName: company?.name ?? ticker,
            tierLevel:   selectedTier,
            tierName:    selectedTier === 'custom' ? 'Custom' : (tierConfig?.name ?? 'Custom'),
            questions:   questions.filter(q => q.trim()),
            basePrompt,
            sources,
          }),
        }
      );

      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error || 'Failed to start analysis.');
        return;
      }

      // Redirect to the analysis tab — the AnalysisTab will show the running status
      navigate(`/companies/${ticker}`, { state: { defaultTab: 'analysis' } });
    } catch (err) {
      setSubmitError('Network error — please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canRun = !isSubmitting && selectedCount > 0 && questions.filter(q => q.trim()).length > 0;
  const overBudget = costEstimate?.estimatedCostGBP > MAX_COST_GBP;

  const logoUrl = `https://financialmodelingprep.com/image-stock/${ticker}.png`;

  return (
    <Container className="mt-4" style={{ maxWidth: 1120 }}>
      {/* Breadcrumb */}
      <div className="d-flex align-items-center gap-2 mb-4" style={{ fontSize: '0.875rem', color: '#6b7280' }}>
        <button
          onClick={() => navigate(`/companies/${ticker}`, { state: { defaultTab: 'analysis' } })}
          style={{ background: 'none', border: 'none', padding: 0, color: '#6b7280', cursor: 'pointer', fontSize: '0.875rem' }}
        >
          Analysis
        </button>
        <span style={{ color: '#d1d5db' }}>›</span>
        <span style={{ color: '#111', fontWeight: 500 }}>New analysis</span>
      </div>

      <div className="d-flex gap-4 align-items-start">

        {/* ── LEFT PANEL ── */}
        <div style={{ flex: '1 1 0', minWidth: 0 }}>

          {/* Analysis Depth */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9ca3af', marginBottom: '0.75rem' }}>
              ANALYSIS DEPTH
            </div>
            <div className="d-flex gap-2 flex-wrap">
              {tierConfigs.map(({ tier, name }) => {
                const active = selectedTier === tier;
                return (
                  <button key={tier} onClick={() => handleTierSelect(tier)} style={{
                    width: 92, padding: '0.65rem 0.5rem', borderRadius: 8,
                    border: `1.5px solid ${active ? '#2563eb' : '#e5e7eb'}`,
                    background: '#fff', cursor: 'pointer', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: active ? '#2563eb' : '#111' }}>{tier}</div>
                    <div style={{ fontSize: '0.7rem', fontWeight: active ? 600 : 400, marginTop: 2, color: active ? '#2563eb' : '#6b7280' }}>{name}</div>
                  </button>
                );
              })}
              <button onClick={handleCustomSelect} style={{
                width: 72, padding: '0.65rem 0.5rem', borderRadius: 8,
                border: `1.5px dashed ${selectedTier === 'custom' ? '#2563eb' : '#d1d5db'}`,
                background: '#f9fafb', cursor: 'pointer', textAlign: 'center',
                color: selectedTier === 'custom' ? '#2563eb' : '#9ca3af',
              }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>+</div>
                <div style={{ fontSize: '0.7rem', marginTop: 2 }}>Custom</div>
              </button>
            </div>

            <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              {selectedTier === 'custom' ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>Custom</div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Fully customized analysis. Define your own questions and base prompt.</div>
                </>
              ) : tierConfig ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>Tier {selectedTier} — {tierConfig.name}</div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{tierConfig.description}</div>
                </>
              ) : null}
            </div>
          </div>

          {/* Analysis Questions */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="d-flex align-items-center gap-2 mb-3">
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9ca3af' }}>
                ANALYSIS QUESTIONS
              </div>
              <div style={{ padding: '0.1rem 0.5rem', borderRadius: 999, background: '#f3f4f6', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>
                {questions.length}/{MAX_QUESTIONS}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginLeft: 'auto' }}>Each becomes a section in your report</div>
            </div>

            <div className="d-flex flex-column gap-2">
              {questions.map((q, i) => (
                <div key={i} className="d-flex align-items-center gap-2">
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f0f4ff', color: '#2563eb', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    Q{i + 1}
                  </div>
                  <input
                    type="text" value={q}
                    onChange={e => { const next = [...questions]; next[i] = e.target.value; setQuestions(next); }}
                    placeholder={`Question ${i + 1}`}
                    style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.9rem', outline: 'none', color: '#111' }}
                  />
                  <button onClick={() => setQuestions(questions.filter((_, idx) => idx !== i))} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '1rem', flexShrink: 0 }}>×</button>
                </div>
              ))}
            </div>

            {questions.length < MAX_QUESTIONS && (
              <button onClick={() => setQuestions([...questions, ''])} style={{ marginTop: '0.75rem', padding: '0.4rem 0.9rem', borderRadius: 8, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: '0.875rem', fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
                + Add question
              </button>
            )}
          </div>

          {/* Advanced: base prompt */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: '2rem', overflow: 'hidden' }}>
            <button onClick={() => setShowBasePrompt(p => !p)} style={{ width: '100%', padding: '0.75rem 1rem', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.9rem', color: '#111' }}>
              {showBasePrompt ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Advanced: base prompt
            </button>
            {showBasePrompt && (
              <div style={{ padding: '0 1rem 1rem' }}>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                  The base prompt sets the analysis style and depth. Your questions above are automatically appended. Edit only if you want to change the fundamental approach.
                </p>
                <textarea value={basePrompt} onChange={e => setBasePrompt(e.target.value)} disabled={basePromptLocked} rows={4}
                  style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.875rem', color: '#333', resize: 'vertical', background: basePromptLocked ? '#f9fafb' : '#fff', outline: 'none', marginBottom: '0.5rem' }}
                />
                {basePromptLocked && (
                  <button onClick={() => setBasePromptLocked(false)} style={{ padding: '0.35rem 0.9rem', borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', fontSize: '0.82rem', fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
                    Unlock to edit
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div>
            {/* Cost estimate display */}
            {selectedCount > 0 && (
              <div style={{ marginBottom: '0.75rem', padding: '0.75rem 1rem', background: overBudget ? '#fef2f2' : '#f0f4ff', border: `1px solid ${overBudget ? '#fecaca' : '#c7d7fd'}`, borderRadius: 8 }}>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: overBudget ? '#dc2626' : '#2563eb' }}>
                    Estimated cost:
                  </span>
                  {loadingCost ? (
                    <Spinner animation="border" size="sm" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  ) : costEstimate ? (
                    <>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: overBudget ? '#dc2626' : '#111' }}>
                        £{costEstimate.estimatedCostGBP.toFixed(4)}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                        (~{costEstimate.inputTokensEstimate.toLocaleString()} input tokens · ~{costEstimate.outputTokensEstimate.toLocaleString()} output tokens)
                      </span>
                      {overBudget && (
                        <span style={{ fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>
                          Exceeds £{MAX_COST_GBP.toFixed(2)} limit — reduce selections
                        </span>
                      )}
                    </>
                  ) : null}
                </div>
              </div>
            )}

            {/* Error message */}
            {submitError && (
              <div style={{ marginBottom: '0.75rem', padding: '0.6rem 0.9rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: '0.875rem', color: '#dc2626' }}>
                {submitError}
              </div>
            )}

            <div className="d-flex align-items-center justify-content-between">
              <div style={{ fontSize: '0.82rem', color: '#9ca3af' }}>
                Triggers a backend process · Results ready in 1–3 min
              </div>
              <button
                onClick={handleRunAnalysis}
                disabled={!canRun || overBudget}
                style={{
                  padding: '0.6rem 1.4rem', borderRadius: 8, border: 'none',
                  background: canRun && !overBudget ? '#1a1a1a' : '#9ca3af',
                  color: '#fff', fontWeight: 600, fontSize: '0.9rem',
                  cursor: canRun && !overBudget ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {isSubmitting ? <><Spinner animation="border" size="sm" style={{ width: 14, height: 14, borderWidth: 2 }} /> Starting…</> : 'Run analysis →'}
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL: Sources ── */}
        <div style={{ flex: '0 0 370px', border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', background: '#fff', alignSelf: 'flex-start' }}>
          {/* Header */}
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>SOURCES</span>
            <span style={{
              padding: '0.1rem 0.55rem', borderRadius: 999,
              background: atLimit ? '#fef9c3' : '#f3f4f6',
              color: atLimit ? '#92400e' : '#6b7280',
              fontSize: '0.7rem', fontWeight: 700,
            }}>
              {selectedCount}/{MAX_SELECTIONS}
            </span>
          </div>

          {atLimit && (
            <div style={{ padding: '0.5rem 1rem', background: '#fffbeb', borderBottom: '1px solid #fde68a', fontSize: '0.78rem', color: '#92400e', fontWeight: 500 }}>
              Maximum {MAX_SELECTIONS} selections reached. Deselect one to add another.
            </div>
          )}

          {loadingFilings ? (
            <div className="d-flex justify-content-center p-4"><Spinner animation="border" size="sm" /></div>
          ) : (
            <div>
              {/* Company row */}
              <div className="d-flex align-items-center gap-2" style={{ padding: '0.65rem 1rem', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ width: 22, height: 22, borderRadius: 4, background: '#e8f0fe', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {!logoError ? (
                    <img src={logoUrl} alt={ticker} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={() => setLogoError(true)} />
                  ) : (
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#2563eb' }}>{ticker.slice(0, 2)}</span>
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{company?.name ?? ticker}</div>
                <ChevronDown size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
              </div>

              {/* Filings grouped by form type */}
              {FORM_TYPES.every(ft => (filingsByType[ft] ?? []).length === 0) ? (
                <div style={{ padding: '1rem', fontSize: '0.85rem', color: '#9ca3af' }}>No filings found.</div>
              ) : (
                FORM_TYPES.map(formType => {
                  const filings = filingsByType[formType] ?? [];
                  if (filings.length === 0) return null;
                  const isExpanded = expandedFormTypes.has(formType);
                  const formLabel  = formType === 'DEF 14A' ? 'Proxy' : formType;

                  return (
                    <div key={formType} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <button onClick={() => toggleFormTypeExpanded(formType)} style={{ width: '100%', background: '#f9fafb', border: 'none', padding: '0.5rem 1rem 0.5rem 2rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' }}>
                        {isExpanded ? <ChevronDown size={13} style={{ color: '#6b7280', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: '#6b7280', flexShrink: 0 }} />}
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#111', flex: 1 }}>{formLabel}</span>
                        <span style={{ padding: '0.05rem 0.4rem', borderRadius: 10, background: '#e5e7eb', color: '#6b7280', fontSize: '0.7rem', fontWeight: 600 }}>{filings.length}</span>
                      </button>

                      {isExpanded && filings.map(filing => {
                        const fileName       = filing['File name'];
                        const isFileExpanded = expandedFilings.has(fileName);
                        const checkState     = getFilingCheckState(fileName);
                        const filingSections = sectionsByFile[fileName] ?? [];
                        const isLoadingSec   = loadingSections.has(fileName);
                        const period         = filingPeriodLabel(formType, filing);
                        const sectionSet     = selectedSectionsByFile[fileName] ?? new Set();

                        return (
                          <div key={fileName} style={{ borderTop: '1px solid #f3f4f6' }}>
                            <div className="d-flex align-items-center gap-2" style={{ padding: '0.45rem 1rem 0.45rem 3rem' }}>
                              <FilingCheckbox
                                state={checkState}
                                onClick={() => handleFilingCheckboxClick(filing)}
                                disabled={atLimit}
                              />
                              <span style={{ fontSize: '0.875rem', fontWeight: 500, flex: 1, color: '#111' }}>{period}</span>
                              <button onClick={() => toggleFilingExpanded(filing)} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center' }}>
                                {isFileExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              </button>
                            </div>

                            {isFileExpanded && (
                              <div style={{ background: '#f9fafb', borderTop: '1px solid #f0f0f0' }}>
                                {isLoadingSec ? (
                                  <div className="d-flex justify-content-center p-3"><Spinner animation="border" size="sm" /></div>
                                ) : filingSections.length === 0 ? (
                                  <div style={{ padding: '0.6rem 1rem 0.6rem 4.5rem', fontSize: '0.8rem', color: '#9ca3af' }}>No sections available.</div>
                                ) : (
                                  filingSections.map(section => {
                                    const isChecked  = sectionSet.has(section);
                                    const isDisabled = atLimit && !isChecked;
                                    return (
                                      <div key={section} className="d-flex align-items-center gap-2" style={{ padding: '0.32rem 1rem 0.32rem 4.5rem' }}>
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => toggleSectionSelected(fileName, section)}
                                          disabled={isDisabled}
                                          style={{ flexShrink: 0, cursor: isDisabled ? 'not-allowed' : 'pointer', accentColor: '#2563eb', opacity: isDisabled ? 0.45 : 1 }}
                                        />
                                        <span style={{ fontSize: '0.82rem', color: isDisabled ? '#9ca3af' : '#333' }}>{section}</span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}

              {/* Reports section */}
              <div style={{ borderBottom: '1px solid #e5e7eb' }}>
                <button onClick={toggleReportsExpanded} style={{ width: '100%', background: '#f9fafb', border: 'none', padding: '0.5rem 1rem 0.5rem 2rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' }}>
                  {expandedReports ? <ChevronDown size={13} style={{ color: '#6b7280', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: '#6b7280', flexShrink: 0 }} />}
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#111', flex: 1 }}>Reports</span>
                  {selectedReportPeriods.size > 0 && (
                    <span style={{ padding: '0.05rem 0.4rem', borderRadius: 10, background: '#dbeafe', color: '#1d4ed8', fontSize: '0.7rem', fontWeight: 600 }}>{selectedReportPeriods.size}</span>
                  )}
                </button>

                {expandedReports && (
                  loadingReportAvailability ? (
                    <div className="d-flex justify-content-center p-3"><Spinner animation="border" size="sm" /></div>
                  ) : (
                    FINANCIAL_STATEMENTS.map(({ key: stmtKey, label: stmtLabel }) => {
                      const hasAnnual    = reportAvailability?.[`${stmtKey}_annual`];
                      const hasQuarterly = reportAvailability?.[`${stmtKey}_quarterly`];
                      if (!hasAnnual && !hasQuarterly) return null;
                      const isStmtExpanded = expandedStatements.has(stmtKey);

                      return (
                        <div key={stmtKey} style={{ borderTop: '1px solid #f3f4f6' }}>
                          <button onClick={() => toggleStatementExpanded(stmtKey)} style={{ width: '100%', background: 'none', border: 'none', padding: '0.45rem 1rem 0.45rem 3rem', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textAlign: 'left' }}>
                            {isStmtExpanded ? <ChevronDown size={12} style={{ color: '#6b7280', flexShrink: 0 }} /> : <ChevronRight size={12} style={{ color: '#6b7280', flexShrink: 0 }} />}
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111' }}>{stmtLabel}</span>
                          </button>

                          {isStmtExpanded && (
                            <div style={{ background: '#f9fafb', borderTop: '1px solid #f0f0f0' }}>
                              {[['annual', 'Annual', hasAnnual], ['quarterly', 'Quarterly', hasQuarterly]].map(([period, label, available]) => {
                                if (!available) return null;
                                const key        = `${stmtKey}_${period}`;
                                const isChecked  = selectedReportPeriods.has(key);
                                const isDisabled = atLimit && !isChecked;
                                return (
                                  <div key={period} className="d-flex align-items-center gap-2" style={{ padding: '0.32rem 1rem 0.32rem 4.5rem' }}>
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => toggleReportPeriod(stmtKey, period)}
                                      disabled={isDisabled}
                                      style={{ flexShrink: 0, cursor: isDisabled ? 'not-allowed' : 'pointer', accentColor: '#2563eb', opacity: isDisabled ? 0.45 : 1 }}
                                    />
                                    <span style={{ fontSize: '0.82rem', color: isDisabled ? '#9ca3af' : '#333' }}>{label}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )
                )}
              </div>

              {/* Selected sources summary */}
              {selectedCount > 0 && (
                <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: 500 }}>
                    {selectedCount} of {MAX_SELECTIONS} sources selected
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    {selectedTags.map(tag => (
                      <div key={tag.key} className="d-flex align-items-center gap-1" style={{ padding: '0.2rem 0.5rem', borderRadius: 6, background: '#fff', border: '1px solid #e5e7eb', fontSize: '0.72rem', color: '#374151' }}>
                        <span style={BADGE_STYLE}>{tag.formType === 'DEF 14A' ? 'Proxy' : tag.formType}</span>
                        <span>{tag.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
};

export default NewAnalysisPage;
