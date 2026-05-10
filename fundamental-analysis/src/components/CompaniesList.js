import React, { useEffect, useState } from 'react';
import { Container } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { Search, X, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const BADGE_COLORS = [
  { bg: '#dbeafe', color: '#1e40af' },
  { bg: '#ede9fe', color: '#5b21b6' },
  { bg: '#d1fae5', color: '#065f46' },
  { bg: '#fce7f3', color: '#9d174d' },
  { bg: '#ffedd5', color: '#9a3412' },
];

const getBadgeStyle = (ticker) => {
  const index = ticker.charCodeAt(0) % BADGE_COLORS.length;
  return BADGE_COLORS[index];
};

const CompaniesList = () => {
  const { user, addCompany, removeCompany } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const navigate = useNavigate();

  const savedCompanies = user?.companiesData || [];
  const savedTickers = new Set(user?.companies || []);

  // Debounced search: waits 300ms after the user stops typing before hitting the API
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/api/companies/search?q=${encodeURIComponent(searchQuery)}`
        );
        const data = await res.json();
        // Filter out companies already in the user's list
        setSearchResults(data.filter(c => !savedTickers.has(c.ticker)));
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async (ticker) => {
    await addCompany(ticker);
    // Remove from search results immediately for instant feedback
    setSearchResults(prev => prev.filter(c => c.ticker !== ticker));
  };

  const handleRemove = async (e, ticker) => {
    e.stopPropagation(); // don't navigate to company page
    await removeCompany(ticker);
  };

  return (
    <Container className="mt-5">
      <div className="mb-4">
        <h2 className="fw-bold">My Companies</h2>
        <p className="text-muted">Search for companies to track and analyse</p>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: '24px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          border: '1px solid #e5e7eb',
          borderRadius: '10px',
          padding: '10px 14px',
          background: '#fff',
          boxShadow: searchQuery ? '0 0 0 3px #dbeafe' : 'none',
          transition: 'box-shadow 0.15s',
        }}>
          <Search size={16} color="#9ca3af" strokeWidth={2} />
          <input
            type="text"
            placeholder="Search companies by name or ticker..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              color: '#111',
              background: 'transparent',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); setSearchResults([]); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
            >
              <X size={16} color="#9ca3af" />
            </button>
          )}
        </div>

        {/* Search results dropdown */}
        {searchQuery.trim() && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0, right: 0,
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            background: '#fff',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            zIndex: 50,
            overflow: 'hidden',
          }}>
            {searchLoading && (
              <div style={{ padding: '14px 16px', fontSize: '14px', color: '#9ca3af' }}>Searching...</div>
            )}
            {!searchLoading && searchResults.length === 0 && (
              <div style={{ padding: '14px 16px', fontSize: '14px', color: '#9ca3af' }}>No companies found</div>
            )}
            {!searchLoading && searchResults.map((company, idx) => {
              const badge = getBadgeStyle(company.ticker);
              return (
                <div
                  key={company.ticker}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderTop: idx === 0 ? 'none' : '1px solid #f0f0f0',
                    gap: '12px',
                  }}
                >
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '8px',
                    background: badge.bg, color: badge.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '10px', letterSpacing: '0.5px', flexShrink: 0,
                  }}>
                    {company.ticker.length > 4 ? company.ticker.slice(0, 4) : company.ticker}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#111' }}>{company.name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{company.sicDescription}</div>
                  </div>
                  <button
                    onClick={() => handleAdd(company.ticker)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      background: '#2563eb', color: '#fff',
                      border: 'none', borderRadius: '6px',
                      padding: '6px 12px', fontSize: '13px', fontWeight: 500,
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Saved companies list */}
      {savedCompanies.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          border: '1px dashed #e5e7eb',
          borderRadius: '12px',
          color: '#9ca3af',
        }}>
          <Search size={32} color="#d1d5db" style={{ marginBottom: '12px' }} />
          <p style={{ fontSize: '15px', fontWeight: 500, color: '#6b7280', marginBottom: '4px' }}>
            No companies yet
          </p>
          <p style={{ fontSize: '14px' }}>Search above to add companies to your list</p>
        </div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
          {savedCompanies.map((company, idx) => {
            const badge = getBadgeStyle(company.ticker);
            return (
              <div
                key={company.ticker}
                onClick={() => navigate(`/companies/${company.ticker}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '16px 20px',
                  borderTop: idx === 0 ? 'none' : '1px solid #f0f0f0',
                  cursor: 'pointer',
                  background: idx === 0 ? '#f9f9f8' : '#fff',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={e => e.currentTarget.style.background = idx === 0 ? '#f9f9f8' : '#fff'}
              >
                {/* Ticker badge */}
                <div style={{
                  width: '52px', height: '52px', borderRadius: '10px',
                  background: badge.bg, color: badge.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '11px', letterSpacing: '0.5px',
                  flexShrink: 0, marginRight: '16px',
                }}>
                  {company.ticker.length > 4 ? company.ticker.slice(0, 4) : company.ticker}
                </div>

                {/* Name + industry */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '16px', color: '#111', lineHeight: 1.3 }}>
                    {company.name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                    {company.sicDescription}
                  </div>
                </div>

                {/* Remove button */}
                <button
                  onClick={e => handleRemove(e, company.ticker)}
                  title="Remove from list"
                  style={{
                    background: 'none', border: '1px solid #e5e7eb',
                    borderRadius: '6px', padding: '5px 8px',
                    cursor: 'pointer', marginRight: '12px',
                    display: 'flex', alignItems: 'center',
                    color: '#9ca3af',
                    transition: 'border-color 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#f87171'; e.currentTarget.style.color = '#ef4444'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#9ca3af'; }}
                >
                  <X size={14} />
                </button>

                <div style={{ color: '#9ca3af', fontSize: '18px' }}>›</div>
              </div>
            );
          })}
        </div>
      )}
    </Container>
  );
};

export default CompaniesList;
