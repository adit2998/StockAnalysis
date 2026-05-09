import React, { useEffect, useState } from 'react';
import { Container } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';

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
  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/companies`);
        if (!response.ok) throw new Error('Failed to fetch tickers');
        const data = await response.json();
        setCompanies(data);
      } catch (err) {
        setError(err.message);
      }
    };
    fetchCompanies();
  }, []);

  if (error) return <div>Error: {error}</div>;

  return (
    <Container className="mt-5">
      <div className="mb-4">
        <h2 className="fw-bold">Companies Dashboard</h2>
        <p className="text-muted">Browse companies, view reports, and analyze financials</p>
      </div>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', background: '#fff' }}>
        {companies.map((company, idx) => {
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
                width: '52px',
                height: '52px',
                borderRadius: '10px',
                background: badge.bg,
                color: badge.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '11px',
                letterSpacing: '0.5px',
                flexShrink: 0,
                marginRight: '16px',
              }}>
                {company.ticker.length > 4 ? company.ticker.slice(0, 4) : company.ticker}
              </div>

              {/* Name + description */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', fontSize: '16px', color: '#111', lineHeight: 1.3 }}>
                  {company.name}
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>
                  {company.sicDescription}
                </div>
              </div>

              {/* Chevron */}
              <div style={{ color: '#9ca3af', fontSize: '18px', marginLeft: '12px' }}>›</div>
            </div>
          );
        })}
      </div>
    </Container>
  );
};

export default CompaniesList;
