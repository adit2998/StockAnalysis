import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Spinner } from 'react-bootstrap';
import { ChevronRight, ChevronDown } from 'lucide-react';

const FORM_TYPES = ['10-K', '10-Q', 'DEF 14A'];
const MAX_QUESTIONS = 10;

const TIER_CONFIGS = [
  {
    tier: 1,
    name: 'Quick scan',
    description: 'High-level health check. Key metrics and immediate red flags.',
    basePrompt:
      'Provide a brief financial health check. Focus on key profitability metrics, balance sheet strength, and any immediate concerns. For each question below, provide a concise, data-backed answer.',
    defaultQuestions: [
      'What is the current profitability trend?',
      'Are there any immediate financial red flags?',
    ],
  },
  {
    tier: 2,
    name: 'Overview',
    description: 'Broad financial overview. Revenue trends, margins, and key ratios.',
    basePrompt:
      'Provide a comprehensive financial overview. Analyze revenue trends, profitability margins, liquidity ratios, and capital structure. For each question below, provide a detailed, data-backed answer.',
    defaultQuestions: [
      'What are the revenue and earnings growth trends over the past 3 years?',
      "How do the company's margins compare to industry benchmarks?",
      'What is the current liquidity and solvency position?',
    ],
  },
  {
    tier: 3,
    name: 'Standard',
    description: 'Standard fundamental analysis. Business model, financials, and risks.',
    basePrompt:
      'Conduct a standard fundamental analysis covering the business model, financial performance, risk factors, and competitive positioning. For each question below, provide a thorough, evidence-based answer.',
    defaultQuestions: [
      "What is the company's core business model and competitive advantage?",
      'How has financial performance evolved over the past 5 years?',
      'What are the primary risk factors disclosed in recent filings?',
      'How is the company positioned relative to its peers?',
    ],
  },
  {
    tier: 4,
    name: 'Deep dive',
    description: 'In-depth analysis. Segment breakdown, management commentary, and forward guidance.',
    basePrompt:
      "Perform an in-depth investment analysis examining business segments, management's strategic commentary, forward guidance, capital allocation decisions, and key financial drivers. Provide detailed, citation-backed answers for each question.",
    defaultQuestions: [
      'What does segment-level performance reveal about the business?',
      "What is management's strategic outlook and key initiatives?",
      'How has the company allocated capital and what are the returns?',
      'What forward guidance has been provided and how credible is it?',
      'What are the key financial drivers and how sustainable are they?',
    ],
  },
  {
    tier: 5,
    name: 'Full research',
    description: 'Comprehensive investment research. Valuation, catalysts, and investment thesis.',
    basePrompt:
      "Produce a comprehensive investment research report covering all material aspects: business quality, financial analysis, competitive dynamics, management assessment, risk/reward profile, valuation considerations, and investment thesis. Provide institutional-grade, citation-backed analysis for each question.",
    defaultQuestions: [
      'What is the quality and durability of the business model?',
      'How do the financials reflect the underlying business performance?',
      'What is the competitive landscape and the company\'s positioning?',
      "How does management's track record compare to stated strategy?",
      'What are the key catalysts and risks to the investment thesis?',
    ],
  },
];

function filingPeriodLabel(formType, filing) {
  const reportDate = filing['Report date'];
  if (!reportDate) return '—';
  if (formType === '10-Q') {
    const month = parseInt(reportDate.slice(5, 7), 10);
    const year = reportDate.slice(0, 4);
    return `Q${Math.ceil(month / 3)} ${year}`;
  }
  return `FY ${reportDate.slice(0, 4)}`;
}

const BADGE_STYLE = {
  display: 'inline-block',
  padding: '0.1rem 0.4rem',
  borderRadius: 4,
  background: '#f3f4f6',
  color: '#374151',
  fontSize: '0.68rem',
  fontWeight: 700,
  letterSpacing: '0.01em',
};

function FilingCheckbox({ state, onClick }) {
  const filled = state !== 'none';
  return (
    <div
      onClick={onClick}
      role="checkbox"
      aria-checked={state === 'all' ? true : state === 'partial' ? 'mixed' : false}
      style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        border: `1.5px solid ${filled ? '#2563eb' : '#d1d5db'}`,
        background: filled ? '#2563eb' : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      {state === 'partial' && (
        <span style={{ color: '#fff', fontSize: 11, lineHeight: 1, fontWeight: 900 }}>−</span>
      )}
      {state === 'all' && (
        <span style={{ color: '#fff', fontSize: 10, lineHeight: 1, fontWeight: 900 }}>✓</span>
      )}
    </div>
  );
}

const NewAnalysisPage = () => {
  const { ticker } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const company = location.state?.company;

  // Left panel
  const [selectedTier, setSelectedTier] = useState(1);
  const tierConfig = TIER_CONFIGS.find(t => t.tier === selectedTier) ?? null;
  const [questions, setQuestions] = useState(TIER_CONFIGS[0].defaultQuestions);
  const [basePrompt, setBasePrompt] = useState(TIER_CONFIGS[0].basePrompt);
  const [basePromptLocked, setBasePromptLocked] = useState(true);
  const [showBasePrompt, setShowBasePrompt] = useState(false);
  const [logoError, setLogoError] = useState(false);

  // Right panel: sources
  const [filingsByType, setFilingsByType] = useState({ '10-K': [], '10-Q': [], 'DEF 14A': [] });
  const [loadingFilings, setLoadingFilings] = useState(true);
  const [expandedFormTypes, setExpandedFormTypes] = useState(new Set());
  const [expandedFilings, setExpandedFilings] = useState(new Set());
  const [sectionsByFile, setSectionsByFile] = useState({});
  const [loadingSections, setLoadingSections] = useState(new Set());
  // { fileName } = whole filing selected
  const [selectedFilings, setSelectedFilings] = useState(new Set());
  // { fileName: Set<sectionKey> } = individual sections selected
  const [selectedSectionsByFile, setSelectedSectionsByFile] = useState({});

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
          } catch {
            results[formType] = [];
          }
        })
      );
      if (!cancelled) {
        setFilingsByType(results);
        setLoadingFilings(false);
      }
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [ticker]);

  const combinedFilings = useMemo(() => {
    const all = [];
    for (const formType of FORM_TYPES) {
      for (const f of filingsByType[formType] ?? []) {
        all.push({ ...f, formType });
      }
    }
    return all.sort((a, b) =>
      (b['Report date'] ?? '').localeCompare(a['Report date'] ?? '')
    );
  }, [filingsByType]);

  const handleTierSelect = (tier) => {
    const config = TIER_CONFIGS.find(t => t.tier === tier);
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
      if (next.has(fileName)) { next.delete(fileName); } else { next.add(fileName); }
      return next;
    });
    if (!sectionsByFile[fileName]) {
      setLoadingSections(prev => new Set([...prev, fileName]));
      try {
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/api/report-details/${encodeURIComponent(fileName)}`
        );
        const data = res.ok ? await res.json() : {};
        setSectionsByFile(prev => ({
          ...prev,
          [fileName]: data.sections ? Object.keys(data.sections) : [],
        }));
      } catch {
        setSectionsByFile(prev => ({ ...prev, [fileName]: [] }));
      } finally {
        setLoadingSections(prev => {
          const next = new Set(prev);
          next.delete(fileName);
          return next;
        });
      }
    }
  }, [sectionsByFile]);

  const toggleFormTypeExpanded = useCallback((formType) => {
    setExpandedFormTypes(prev => {
      const next = new Set(prev);
      if (next.has(formType)) { next.delete(formType); } else { next.add(formType); }
      return next;
    });
  }, []);

  const getFilingCheckState = useCallback((fileName) => {
    if (selectedFilings.has(fileName)) return 'all';
    const sections = selectedSectionsByFile[fileName];
    if (sections && sections.size > 0) return 'partial';
    return 'none';
  }, [selectedFilings, selectedSectionsByFile]);

  const handleFilingCheckboxClick = useCallback((filing) => {
    const fileName = filing['File name'];
    const state = getFilingCheckState(fileName);
    if (state === 'all') {
      setSelectedFilings(prev => { const n = new Set(prev); n.delete(fileName); return n; });
    } else {
      setSelectedFilings(prev => new Set([...prev, fileName]));
      setSelectedSectionsByFile(prev => { const n = { ...prev }; delete n[fileName]; return n; });
    }
  }, [getFilingCheckState]);

  const toggleSectionSelected = useCallback((fileName, sectionKey) => {
    const fileSections = new Set(selectedSectionsByFile[fileName] ?? []);
    if (fileSections.has(sectionKey)) {
      fileSections.delete(sectionKey);
    } else {
      fileSections.add(sectionKey);
      if (selectedFilings.has(fileName)) {
        setSelectedFilings(prev => { const n = new Set(prev); n.delete(fileName); return n; });
      }
    }
    setSelectedSectionsByFile(prev => ({ ...prev, [fileName]: fileSections }));
  }, [selectedSectionsByFile, selectedFilings]);

  const selectedTags = useMemo(() => {
    const tags = [];
    for (const fileName of selectedFilings) {
      const filing = combinedFilings.find(f => f['File name'] === fileName);
      if (!filing) continue;
      tags.push({
        key: fileName,
        formType: filing.formType,
        label: `${ticker} ${filingPeriodLabel(filing.formType, filing)} (all)`,
      });
    }
    for (const [fileName, sections] of Object.entries(selectedSectionsByFile)) {
      const filing = combinedFilings.find(f => f['File name'] === fileName);
      if (!filing) continue;
      for (const section of sections) {
        tags.push({
          key: `${fileName}||${section}`,
          formType: filing.formType,
          label: `${ticker} — ${section}`,
        });
      }
    }
    return tags;
  }, [selectedFilings, selectedSectionsByFile, combinedFilings, ticker]);

  const selectedCount =
    selectedFilings.size +
    Object.values(selectedSectionsByFile).reduce((sum, s) => sum + s.size, 0);

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
              {TIER_CONFIGS.map(({ tier, name }) => {
                const active = selectedTier === tier;
                return (
                  <button
                    key={tier}
                    onClick={() => handleTierSelect(tier)}
                    style={{
                      width: 92,
                      padding: '0.65rem 0.5rem',
                      borderRadius: 8,
                      border: `1.5px solid ${active ? '#2563eb' : '#e5e7eb'}`,
                      background: '#fff',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: active ? '#2563eb' : '#111' }}>{tier}</div>
                    <div style={{ fontSize: '0.7rem', fontWeight: active ? 600 : 400, marginTop: 2, color: active ? '#2563eb' : '#6b7280' }}>
                      {name}
                    </div>
                  </button>
                );
              })}
              <button
                onClick={handleCustomSelect}
                style={{
                  width: 72,
                  padding: '0.65rem 0.5rem',
                  borderRadius: 8,
                  border: `1.5px dashed ${selectedTier === 'custom' ? '#2563eb' : '#d1d5db'}`,
                  background: '#f9fafb',
                  cursor: 'pointer',
                  textAlign: 'center',
                  color: selectedTier === 'custom' ? '#2563eb' : '#9ca3af',
                }}
              >
                <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>+</div>
                <div style={{ fontSize: '0.7rem', marginTop: 2 }}>Custom</div>
              </button>
            </div>

            {/* Tier description */}
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem 1rem',
              background: '#f9fafb',
              borderRadius: 8,
              border: '1px solid #e5e7eb',
            }}>
              {selectedTier === 'custom' ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>Custom</div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                    Fully customized analysis. Define your own questions and base prompt.
                  </div>
                </>
              ) : tierConfig ? (
                <>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 2 }}>
                    Tier {selectedTier} — {tierConfig.name}
                  </div>
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
              <div style={{
                padding: '0.1rem 0.5rem', borderRadius: 999,
                background: '#f3f4f6', fontSize: '0.75rem', fontWeight: 600, color: '#6b7280',
              }}>
                {questions.length}/{MAX_QUESTIONS}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginLeft: 'auto' }}>
                Each becomes a section in your report
              </div>
            </div>

            <div className="d-flex flex-column gap-2">
              {questions.map((q, i) => (
                <div key={i} className="d-flex align-items-center gap-2">
                  <div style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: '#f0f4ff', color: '#2563eb',
                    fontSize: '0.72rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    Q{i + 1}
                  </div>
                  <input
                    type="text"
                    value={q}
                    onChange={e => {
                      const next = [...questions];
                      next[i] = e.target.value;
                      setQuestions(next);
                    }}
                    placeholder={`Question ${i + 1}`}
                    style={{
                      flex: 1,
                      padding: '0.5rem 0.75rem',
                      borderRadius: 8,
                      border: '1.5px solid #e5e7eb',
                      fontSize: '0.9rem',
                      outline: 'none',
                      color: '#111',
                    }}
                  />
                  <button
                    onClick={() => setQuestions(questions.filter((_, idx) => idx !== i))}
                    style={{
                      width: 28, height: 28, borderRadius: 6,
                      border: '1px solid #e5e7eb', background: '#fff',
                      cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: '#9ca3af', fontSize: '1rem', flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {questions.length < MAX_QUESTIONS && (
              <button
                onClick={() => setQuestions([...questions, ''])}
                style={{
                  marginTop: '0.75rem',
                  padding: '0.4rem 0.9rem',
                  borderRadius: 8,
                  border: '1.5px solid #e5e7eb',
                  background: '#fff',
                  fontSize: '0.875rem', fontWeight: 500,
                  color: '#374151', cursor: 'pointer',
                }}
              >
                + Add question
              </button>
            )}
          </div>

          {/* Advanced: base prompt */}
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: '2rem', overflow: 'hidden' }}>
            <button
              onClick={() => setShowBasePrompt(p => !p)}
              style={{
                width: '100%', padding: '0.75rem 1rem',
                background: 'none', border: 'none', textAlign: 'left',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                fontWeight: 600, fontSize: '0.9rem', color: '#111',
              }}
            >
              {showBasePrompt ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Advanced: base prompt
            </button>

            {showBasePrompt && (
              <div style={{ padding: '0 1rem 1rem' }}>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
                  The base prompt sets the analysis style and depth. Your questions above are automatically
                  appended. Edit only if you want to change the fundamental approach.
                </p>
                <textarea
                  value={basePrompt}
                  onChange={e => setBasePrompt(e.target.value)}
                  disabled={basePromptLocked}
                  rows={4}
                  style={{
                    width: '100%', padding: '0.65rem 0.75rem',
                    borderRadius: 8, border: '1.5px solid #e5e7eb',
                    fontSize: '0.875rem', color: '#333', resize: 'vertical',
                    background: basePromptLocked ? '#f9fafb' : '#fff',
                    outline: 'none', marginBottom: '0.5rem',
                  }}
                />
                {basePromptLocked && (
                  <button
                    onClick={() => setBasePromptLocked(false)}
                    style={{
                      padding: '0.35rem 0.9rem', borderRadius: 7,
                      border: '1px solid #e5e7eb', background: '#fff',
                      fontSize: '0.82rem', fontWeight: 500, color: '#374151', cursor: 'pointer',
                    }}
                  >
                    Unlock to edit
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="d-flex align-items-center justify-content-between">
            <div style={{ fontSize: '0.82rem', color: '#9ca3af' }}>
              Triggers a backend process · Results ready in 1–3 min
            </div>
            <button
              style={{
                padding: '0.6rem 1.4rem', borderRadius: 8,
                border: 'none', background: '#1a1a1a',
                color: '#fff', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
              }}
            >
              Run analysis →
            </button>
          </div>
        </div>

        {/* ── RIGHT PANEL: Sources ── */}
        <div style={{
          flex: '0 0 370px', border: '1.5px solid #e5e7eb', borderRadius: 12,
          overflow: 'hidden', background: '#fff', alignSelf: 'flex-start',
        }}>
          {/* Header */}
          <div style={{
            padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb',
            fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.09em', color: '#9ca3af',
          }}>
            SOURCES
          </div>

          {loadingFilings ? (
            <div className="d-flex justify-content-center p-4">
              <Spinner animation="border" size="sm" />
            </div>
          ) : (
            <div>
              {/* Company row */}
              <div className="d-flex align-items-center gap-2" style={{
                padding: '0.65rem 1rem', borderBottom: '1px solid #f3f4f6',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 4,
                  background: '#e8f0fe', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
                }}>
                  {!logoError ? (
                    <img
                      src={logoUrl} alt={ticker}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#2563eb' }}>
                      {ticker.slice(0, 2)}
                    </span>
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>
                  {company?.name ?? ticker}
                </div>
                <ChevronDown size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />
              </div>

              {/* Form-type grouped filings */}
              {FORM_TYPES.every(ft => (filingsByType[ft] ?? []).length === 0) ? (
                <div style={{ padding: '1rem', fontSize: '0.85rem', color: '#9ca3af' }}>
                  No filings found.
                </div>
              ) : (
                FORM_TYPES.map(formType => {
                  const filings = filingsByType[formType] ?? [];
                  if (filings.length === 0) return null;
                  const isFormTypeExpanded = expandedFormTypes.has(formType);
                  const formLabel = formType === 'DEF 14A' ? 'Proxy' : formType;

                  return (
                    <div key={formType} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      {/* Form type header row */}
                      <button
                        onClick={() => toggleFormTypeExpanded(formType)}
                        style={{
                          width: '100%', background: '#f9fafb', border: 'none',
                          padding: '0.5rem 1rem 0.5rem 2rem',
                          display: 'flex', alignItems: 'center', gap: 8,
                          cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        {isFormTypeExpanded
                          ? <ChevronDown size={13} style={{ color: '#6b7280', flexShrink: 0 }} />
                          : <ChevronRight size={13} style={{ color: '#6b7280', flexShrink: 0 }} />}
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#111', flex: 1 }}>
                          {formLabel}
                        </span>
                        <span style={{
                          padding: '0.05rem 0.4rem', borderRadius: 10,
                          background: '#e5e7eb', color: '#6b7280',
                          fontSize: '0.7rem', fontWeight: 600,
                        }}>
                          {filings.length}
                        </span>
                      </button>

                      {/* Filings under this form type */}
                      {isFormTypeExpanded && filings.map(filing => {
                        const fileName = filing['File name'];
                        const isExpanded = expandedFilings.has(fileName);
                        const checkState = getFilingCheckState(fileName);
                        const filingSections = sectionsByFile[fileName] ?? [];
                        const isLoadingSec = loadingSections.has(fileName);
                        const period = filingPeriodLabel(formType, filing);
                        const sectionSet = selectedSectionsByFile[fileName] ?? new Set();

                        return (
                          <div key={fileName} style={{ borderTop: '1px solid #f3f4f6' }}>
                            {/* Filing row */}
                            <div className="d-flex align-items-center gap-2" style={{ padding: '0.45rem 1rem 0.45rem 3rem' }}>
                              <FilingCheckbox
                                state={checkState}
                                onClick={() => handleFilingCheckboxClick(filing)}
                              />
                              <span style={{ fontSize: '0.875rem', fontWeight: 500, flex: 1, color: '#111' }}>
                                {period}
                              </span>
                              <button
                                onClick={() => toggleFilingExpanded(filing)}
                                style={{
                                  background: 'none', border: 'none', padding: 2,
                                  cursor: 'pointer', color: '#9ca3af', display: 'flex', alignItems: 'center',
                                }}
                              >
                                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              </button>
                            </div>

                            {/* Sections */}
                            {isExpanded && (
                              <div style={{ background: '#f9fafb', borderTop: '1px solid #f0f0f0' }}>
                                {isLoadingSec ? (
                                  <div className="d-flex justify-content-center p-3">
                                    <Spinner animation="border" size="sm" />
                                  </div>
                                ) : filingSections.length === 0 ? (
                                  <div style={{ padding: '0.6rem 1rem 0.6rem 4.5rem', fontSize: '0.8rem', color: '#9ca3af' }}>
                                    No sections available.
                                  </div>
                                ) : (
                                  filingSections.map(section => (
                                    <div
                                      key={section}
                                      className="d-flex align-items-center gap-2"
                                      style={{ padding: '0.32rem 1rem 0.32rem 4.5rem' }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={sectionSet.has(section)}
                                        onChange={() => toggleSectionSelected(fileName, section)}
                                        style={{ flexShrink: 0, cursor: 'pointer', accentColor: '#2563eb' }}
                                      />
                                      <span style={{ fontSize: '0.82rem', color: '#333' }}>{section}</span>
                                    </div>
                                  ))
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

              {/* Selected sources summary */}
              {selectedCount > 0 && (
                <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: 500 }}>
                    {selectedCount} source{selectedCount !== 1 ? 's' : ''} selected
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    {selectedTags.map(tag => (
                      <div
                        key={tag.key}
                        className="d-flex align-items-center gap-1"
                        style={{
                          padding: '0.2rem 0.5rem', borderRadius: 6,
                          background: '#fff', border: '1px solid #e5e7eb',
                          fontSize: '0.72rem', color: '#374151',
                        }}
                      >
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
