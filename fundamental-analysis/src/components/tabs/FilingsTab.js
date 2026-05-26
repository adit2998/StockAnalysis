import React, { useState, useEffect } from 'react';
import { Card, Spinner, Button } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

const FORM_TYPES = [
  { key: '10-K', label: '10-K · Annual' },
  { key: '10-Q', label: '10-Q · Quarterly' },
  { key: 'DEF 14A', label: 'Proxy · DEF 14A' },
];

function fiscalYear(reportDate) {
  return reportDate ? `FY ${reportDate.slice(0, 4)}` : '—';
}

function filedDate(filingDate) {
  if (!filingDate) return '—';
  const d = new Date(filingDate + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function pageCount(pages) {
  return pages ? `· ${pages} pages` : '';
}

const FilingsTab = ({ company }) => {
  const navigate = useNavigate();
  const [activeFormType, setActiveFormType] = useState('10-K');
  const [filings, setFilings] = useState([]);
  const [selectedFiling, setSelectedFiling] = useState(null);
  const [sections, setSections] = useState({});
  const [selectedSection, setSelectedSection] = useState(null);
  const [filingsLoading, setFilingsLoading] = useState(false);
  const [sectionsLoading, setSectionsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setFilingsLoading(true);
      setSelectedFiling(null);
      setSections({});
      setSelectedSection(null);
      try {
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/api/company-reports/${company.ticker}/${encodeURIComponent(activeFormType)}`
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) {
          setFilings(data);
          if (data.length > 0) setSelectedFiling(data[0]);
        }
      } catch {
        if (!cancelled) setFilings([]);
      } finally {
        if (!cancelled) setFilingsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [activeFormType, company.ticker]);

  useEffect(() => {
    const fileName = selectedFiling?.['File name'];
    if (!fileName) return;
    let cancelled = false;
    const load = async () => {
      setSectionsLoading(true);
      setSections({});
      setSelectedSection(null);
      try {
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/api/report-details/${encodeURIComponent(fileName)}`
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled && data.sections) {
          setSections(data.sections);
          const firstKey = Object.keys(data.sections)[0];
          if (firstKey) setSelectedSection(firstKey);
        }
      } catch {
        if (!cancelled) setSections({});
      } finally {
        if (!cancelled) setSectionsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [selectedFiling]);

  const sectionKeys = Object.keys(sections);
  const formTypeLabel = FORM_TYPES.find(f => f.key === activeFormType)?.label ?? activeFormType;

  return (
    <div>
      {/* Form type tabs */}
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {FORM_TYPES.map(({ key, label }) => {
          const active = activeFormType === key;
          return (
            <button
              key={key}
              onClick={() => setActiveFormType(key)}
              style={{
                padding: '0.4rem 1.1rem',
                borderRadius: 999,
                border: `1.5px solid ${active ? '#1a1a1a' : '#dee2e6'}`,
                background: active ? '#1a1a1a' : '#fff',
                color: active ? '#fff' : '#444',
                fontWeight: active ? 600 : 400,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Three-column browser */}
      <Card className="shadow-sm overflow-hidden" style={{ minHeight: 500 }}>
        <div className="d-flex" style={{ minHeight: 500 }}>

          {/* Column 1: Filings list */}
          <div style={{ width: 220, borderRight: '1px solid #e9ecef', flexShrink: 0, overflowY: 'auto' }}>
            <div style={{
              padding: '0.65rem 1rem',
              borderBottom: '1px solid #e9ecef',
              fontSize: '0.7rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#999',
              letterSpacing: '0.06em',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              {activeFormType} FILINGS
              {filings.length > 0 && (
                <span style={{ fontWeight: 400, color: '#bbb' }}>{filings.length}</span>
              )}
            </div>

            {filingsLoading ? (
              <div className="d-flex justify-content-center p-4">
                <Spinner animation="border" size="sm" />
              </div>
            ) : filings.length === 0 ? (
              <div className="text-muted p-3" style={{ fontSize: '0.85rem' }}>No filings found.</div>
            ) : (
              filings.map((filing) => {
                const isSelected = selectedFiling?.['File name'] === filing['File name'];
                return (
                  <div
                    key={filing['File name']}
                    onClick={() => setSelectedFiling(filing)}
                    style={{
                      padding: '0.85rem 1rem',
                      borderBottom: '1px solid #f2f2f2',
                      borderLeft: `3px solid ${isSelected ? '#0d6efd' : 'transparent'}`,
                      background: isSelected ? '#f0f4ff' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      fontWeight: 600,
                      fontSize: '0.92rem',
                      color: isSelected ? '#0d6efd' : '#111',
                    }}>
                      {fiscalYear(filing['Report date'])}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#999', marginTop: 2 }}>
                      Filed {filedDate(filing['Filing date'])}
                    </div>
                    {isSelected && (
                      <div className="d-flex gap-1" style={{ marginTop: '0.5rem' }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/report-details/${encodeURIComponent(filing['File name'])}`);
                          }}
                          style={{
                            padding: '0.2rem 0.75rem',
                            borderRadius: 6,
                            border: '1px solid #ccc',
                            background: '#fff',
                            fontSize: '0.78rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            color: '#333',
                          }}
                        >
                          Read →
                        </button>
                        {filing.url && (
                          <a
                            href={filing.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              padding: '0.2rem 0.75rem',
                              borderRadius: 6,
                              border: '1px solid #ccc',
                              background: '#fff',
                              fontSize: '0.78rem',
                              fontWeight: 500,
                              cursor: 'pointer',
                              color: '#333',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                          >
                            SEC ↗
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Column 2: Sections */}
          <div style={{ width: 260, borderRight: '1px solid #e9ecef', flexShrink: 0, overflowY: 'auto' }}>
            {!selectedFiling ? (
              <div className="text-muted p-3" style={{ fontSize: '0.85rem' }}>
                Select a filing to view sections.
              </div>
            ) : (
              <>
                <div style={{ padding: '0.65rem 1rem', borderBottom: '1px solid #e9ecef' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                    {fiscalYear(selectedFiling['Report date'])} · {formTypeLabel.split(' · ')[1] ?? formTypeLabel} report
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#999', marginTop: 2 }}>
                    Filed {filedDate(selectedFiling['Filing date'])} {pageCount(selectedFiling['pages'])}
                  </div>
                </div>

                {sectionsLoading ? (
                  <div className="d-flex justify-content-center p-4">
                    <Spinner animation="border" size="sm" />
                  </div>
                ) : sectionKeys.length === 0 ? (
                  <div className="text-muted p-3" style={{ fontSize: '0.85rem' }}>No sections available.</div>
                ) : (
                  sectionKeys.map((key) => {
                    const active = selectedSection === key;
                    return (
                      <div
                        key={key}
                        onClick={() => setSelectedSection(key)}
                        style={{
                          padding: '0.75rem 1rem',
                          borderBottom: '1px solid #f2f2f2',
                          cursor: 'pointer',
                          background: active ? '#f0f4ff' : 'transparent',
                          color: active ? '#0d6efd' : '#222',
                          fontWeight: active ? 600 : 400,
                          fontSize: '0.875rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span>{key}</span>
                      </div>
                    );
                  })
                )}
              </>
            )}
          </div>

          {/* Column 3: Section content preview */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }}>
            {selectedSection && sections[selectedSection] ? (
              <>
                <div style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: '#999',
                  letterSpacing: '0.07em',
                  marginBottom: '0.6rem',
                }}>
                  {selectedSection}
                </div>
                <p style={{
                  fontSize: '0.95rem',
                  color: '#222',
                  lineHeight: 1.75,
                  marginBottom: '1.5rem',
                  whiteSpace: 'pre-wrap',
                }}>
                  {sections[selectedSection]}
                </p>
                <hr style={{ borderColor: '#e9ecef' }} />
                <div className="d-flex align-items-center gap-3 flex-wrap">
                  <Button
                    variant="outline-dark"
                    size="sm"
                    onClick={() => navigate(`/report-details/${encodeURIComponent(selectedFiling['File name'])}`)}
                  >
                    Open full document →
                  </Button>
                  {selectedFiling.url && (
                    <a
                      href={selectedFiling.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.85rem', color: '#555', textDecoration: 'none' }}
                    >
                      View on SEC ↗
                    </a>
                  )}
                  <span style={{ fontSize: '0.82rem', color: '#bbb' }}>or select any section to read</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize: '0.88rem', color: '#aaa', marginTop: '1rem' }}>
                {selectedFiling ? 'Select a section to preview.' : 'Select a filing to get started.'}
              </div>
            )}
          </div>

        </div>
      </Card>
    </div>
  );
};

export default FilingsTab;
