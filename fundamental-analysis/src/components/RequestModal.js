import React, { useState } from 'react';
import { Info, Clock, Send } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Callout = ({ icon: Icon, color, children }) => (
  <div style={{
    display: 'flex', gap: '12px', alignItems: 'flex-start',
    background: '#f9fafb', borderRadius: '10px', padding: '14px 16px',
  }}>
    <Icon size={16} color={color} style={{ flexShrink: 0, marginTop: '1px' }} />
    <p style={{ margin: 0, fontSize: '14px', color: '#374151', lineHeight: 1.5 }}>{children}</p>
  </div>
);

const SectionLabel = ({ children }) => (
  <p style={{
    margin: 0, fontSize: '11px', fontWeight: 600, color: '#9ca3af',
    letterSpacing: '0.8px', textTransform: 'uppercase',
  }}>{children}</p>
);

const Checkbox = ({ checked, onChange, label }) => (
  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      style={{ width: '16px', height: '16px', accentColor: '#2563eb', cursor: 'pointer' }}
    />
    <span style={{ fontSize: '14px', fontWeight: 500, color: '#111' }}>{label}</span>
  </label>
);

const RequestModal = ({ company, onClose, onRequested }) => {
  const { authFetch } = useAuth();

  const [include10K,    setInclude10K]    = useState(true);
  const [include10Q,    setInclude10Q]    = useState(false);
  const [includeProxy,  setIncludeProxy]  = useState(false);

  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  const noneSelected = !include10K && !include10Q && !includeProxy;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await authFetch(`${process.env.REACT_APP_API_URL}/api/processing/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: company.ticker,
          name: company.name,
          include10K,
          include10Q,
          includeProxy,
        }),
      });
      setDone(true);
      if (onRequested) onRequested(company.ticker);
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
        width: '100%', maxWidth: '480px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#111' }}>
                Request company processing
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7280' }}>
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

          {/* Filing type selection */}
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

          {/* Info callouts */}
          <Callout icon={Info} color="#2563eb">
            Selected filings will be fetched, financial statements processed, and trends calculated.
            You'll be notified when the company is ready to add to your profile.
          </Callout>
          <Callout icon={Clock} color="#6b7280">
            Processing typically takes a few minutes and runs in the background.
            AI summaries are not included at this stage.
          </Callout>
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #f0f0f0',
          display: 'flex', justifyContent: 'flex-end', gap: '10px',
        }}>
          <button onClick={onClose} style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
            padding: '8px 18px', fontSize: '14px', fontWeight: 500,
            color: '#374151', cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
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
            <Send size={14} />
            {done ? 'Requested!' : loading ? 'Submitting…' : 'Submit request'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RequestModal;
