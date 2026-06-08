import React, { useState } from 'react';
import { DollarSign, Zap, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Counter = ({ value, onChange, min = 1, max = 20 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <button
      onClick={() => onChange(Math.max(min, value - 1))}
      disabled={value <= min}
      style={{
        width: '28px', height: '28px', borderRadius: '6px',
        border: '1px solid #e5e7eb', background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', cursor: value <= min ? 'default' : 'pointer',
        color: value <= min ? '#d1d5db' : '#374151',
      }}
    >−</button>
    <span style={{ fontSize: '15px', fontWeight: 600, minWidth: '20px', textAlign: 'center' }}>
      {value}
    </span>
    <button
      onClick={() => onChange(Math.min(max, value + 1))}
      disabled={value >= max}
      style={{
        width: '28px', height: '28px', borderRadius: '6px',
        border: '1px solid #e5e7eb', background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '16px', cursor: value >= max ? 'default' : 'pointer',
        color: value >= max ? '#d1d5db' : '#374151',
      }}
    >+</button>
  </div>
);

const SectionLabel = ({ children }) => (
  <p style={{
    margin: 0, fontSize: '11px', fontWeight: 600, color: '#9ca3af',
    letterSpacing: '0.8px', textTransform: 'uppercase',
  }}>{children}</p>
);

const Checkbox = ({ checked, onChange, label, disabled }) => (
  <label style={{
    display: 'flex', alignItems: 'center', gap: '10px',
    cursor: disabled ? 'default' : 'pointer', userSelect: 'none',
    opacity: disabled ? 0.4 : 1,
  }}>
    <input
      type="checkbox"
      checked={checked}
      onChange={e => !disabled && onChange(e.target.checked)}
      disabled={disabled}
      style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: disabled ? 'default' : 'pointer' }}
    />
    <span style={{ fontSize: '14px', fontWeight: 500, color: '#111' }}>{label}</span>
  </label>
);

const SubPanel = ({ children }) => (
  <div style={{
    marginLeft: '26px',
    borderLeft: '2px solid #e5e7eb',
    paddingLeft: '14px',
    marginTop: '10px',
  }}>
    {children}
  </div>
);

const AdminProcessModal = ({ company, onClose }) => {
  const { authFetch } = useAuth();

  // Which form types to fetch
  const [include10K,    setInclude10K]    = useState(true);
  const [include10Q,    setInclude10Q]    = useState(false);
  const [includeProxy,  setIncludeProxy]  = useState(false);

  // Summarisation settings (only relevant when corresponding include flag is true)
  const [summarize10K,    setSummarize10K]    = useState(true);
  const [num10K,          setNum10K]          = useState(1);
  const [summarize10Q,    setSummarize10Q]    = useState(false);
  const [num10Q,          setNum10Q]          = useState(1);
  const [summarizeProxy,  setSummarizeProxy]  = useState(true);
  const [numProxy,        setNumProxy]        = useState(1);

  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  const noneSelected = !include10K && !include10Q && !includeProxy;

  // Cost only counts types that are both fetched and summarised
  const estimatedCalls =
    (include10K    && summarize10K    ? num10K    : 0) +
    (include10Q    && summarize10Q    ? num10Q    : 0) +
    (includeProxy  && summarizeProxy  ? numProxy  : 0);

  const costParts = [
    include10K   && summarize10K   && `${num10K} for 10-K`,
    include10Q   && summarize10Q   && `${num10Q} for 10-Q`,
    includeProxy && summarizeProxy && `${numProxy} for proxy`,
  ].filter(Boolean);

  const buildBody = (forceSummarizeOff = false) => ({
    ticker: company.ticker,
    name:   company.name,
    include10K,
    include10Q,
    includeProxy,
    summarize10K:    !forceSummarizeOff && include10K   && summarize10K,
    num10KSummaries: num10K,
    summarize10Q:    !forceSummarizeOff && include10Q   && summarize10Q,
    num10QSummaries: num10Q,
    summarizeProxy:  !forceSummarizeOff && includeProxy && summarizeProxy,
    numProxySummaries: numProxy,
  });

  const submit = async (endpoint) => {
    setLoading(true);
    try {
      await authFetch(`${process.env.REACT_APP_API_URL}/api/processing/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          endpoint === 'queue' ? buildBody(true) : buildBody(false)
        ),
      });
      setDone(true);
      setTimeout(onClose, 1200);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: '14px',
        width: '100%', maxWidth: '520px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#111' }}>
                  Process company
                </h3>
                <span style={{
                  background: '#fef3c7', color: '#92400e',
                  fontSize: '11px', fontWeight: 600,
                  padding: '2px 8px', borderRadius: '5px', letterSpacing: '0.3px',
                }}>Admin</span>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#6b7280' }}>
                {company.name} · {company.ticker}
              </p>
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '20px', color: '#9ca3af', lineHeight: 1, padding: '0 0 0 8px',
            }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Filings to fetch */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <SectionLabel>Filings to fetch</SectionLabel>
            <Checkbox checked={include10K}   onChange={setInclude10K}   label="10-K (Annual report)" />
            <Checkbox checked={include10Q}   onChange={setInclude10Q}   label="10-Q (Quarterly report)" />
            <Checkbox checked={includeProxy} onChange={setIncludeProxy} label="DEF 14A (Proxy statement)" />
            {noneSelected && (
              <p style={{ margin: 0, fontSize: '12px', color: '#ef4444' }}>
                Select at least one filing type to continue.
              </p>
            )}
          </div>

          <div style={{ borderTop: '1px solid #f0f0f0' }} />

          {/* LLM Summarisation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <SectionLabel>LLM Summarisation</SectionLabel>

            {/* 10-K */}
            <div>
              <Checkbox
                checked={summarize10K && include10K}
                onChange={setSummarize10K}
                label="Summarise 10-K filings"
                disabled={!include10K}
              />
              {include10K && summarize10K && (
                <SubPanel>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#f9fafb', borderRadius: '8px', padding: '10px 14px',
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#111' }}>Number to summarise</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>Of all fetched 10-Ks</div>
                    </div>
                    <Counter value={num10K} onChange={setNum10K} />
                  </div>
                </SubPanel>
              )}
            </div>

            {/* 10-Q */}
            <div>
              <Checkbox
                checked={summarize10Q && include10Q}
                onChange={setSummarize10Q}
                label="Summarise 10-Q filings"
                disabled={!include10Q}
              />
              {include10Q && summarize10Q && (
                <SubPanel>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#f9fafb', borderRadius: '8px', padding: '10px 14px',
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#111' }}>Number to summarise</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>Of all fetched 10-Qs</div>
                    </div>
                    <Counter value={num10Q} onChange={setNum10Q} />
                  </div>
                </SubPanel>
              )}
            </div>

            {/* DEF 14A */}
            <div>
              <Checkbox
                checked={summarizeProxy && includeProxy}
                onChange={setSummarizeProxy}
                label="Summarise DEF 14A proxy"
                disabled={!includeProxy}
              />
              {includeProxy && summarizeProxy && (
                <SubPanel>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: '#f9fafb', borderRadius: '8px', padding: '10px 14px',
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#111' }}>Number to summarise</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>Of all fetched proxies</div>
                    </div>
                    <Counter value={numProxy} onChange={setNumProxy} />
                  </div>
                </SubPanel>
              )}
            </div>
          </div>

          {/* Cost estimate */}
          <div style={{
            display: 'flex', gap: '12px', alignItems: 'flex-start',
            background: '#fffbeb', borderRadius: '10px', padding: '14px 16px',
          }}>
            <DollarSign size={16} color="#d97706" style={{ flexShrink: 0, marginTop: '1px' }} />
            <p style={{ margin: 0, fontSize: '13px', color: '#92400e', lineHeight: 1.5 }}>
              {estimatedCalls === 0
                ? 'No summarisation calls — selected filings will still be fetched and chunked.'
                : `Estimated cost: ${costParts.join(' + ')} summarisation call${estimatedCalls !== 1 ? 's' : ''}. All selected filings will still be fetched and chunked regardless of summarisation settings.`
              }
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f0f0f0',
          display: 'flex', justifyContent: 'flex-end', gap: '10px',
        }}>
          <button onClick={onClose} disabled={loading || done} style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
            padding: '8px 18px', fontSize: '14px', fontWeight: 500,
            color: '#374151', cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button
            onClick={() => submit('queue')}
            disabled={loading || done || noneSelected}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              background: '#fff', color: noneSelected ? '#9ca3af' : '#374151',
              border: '1px solid #e5e7eb', borderRadius: '8px',
              padding: '8px 18px', fontSize: '14px', fontWeight: 500,
              cursor: loading || done || noneSelected ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            <Users size={14} />
            Queue for users
          </button>
          <button
            onClick={() => submit('process')}
            disabled={loading || done || noneSelected}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              background: done ? '#16a34a' : noneSelected ? '#d1d5db' : '#111',
              color: '#fff',
              border: 'none', borderRadius: '8px',
              padding: '8px 18px', fontSize: '14px', fontWeight: 500,
              cursor: loading || done || noneSelected ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'background 0.2s',
            }}
          >
            <Zap size={14} />
            {done ? 'Triggered!' : loading ? 'Starting…' : 'Process now'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminProcessModal;
