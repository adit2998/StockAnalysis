import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, TrendingUp } from 'lucide-react';

const Logo = () => (
  <div style={{
    width: 34, height: 34, borderRadius: 8,
    background: '#2563eb',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  }}>
    <TrendingUp size={18} color="white" strokeWidth={2.5} />
  </div>
);

const Chevron = () => (
  <span style={{ color: '#9ca3af', fontSize: '14px', userSelect: 'none' }}>›</span>
);

const NavLink = ({ children, active, onClick }) => (
  <button
    onClick={onClick}
    style={{
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      padding: '0 4px 14px 4px',
      fontSize: '15px',
      fontWeight: active ? 600 : 400,
      color: active ? '#111' : '#6b7280',
      borderBottom: active ? '2px solid #111' : '2px solid transparent',
      transition: 'color 0.15s',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </button>
);

const TickerBadge = ({ children }) => (
  <span style={{
    background: '#dbeafe',
    color: '#2563eb',
    fontWeight: 700,
    fontSize: '11px',
    padding: '2px 7px',
    borderRadius: '5px',
    letterSpacing: '0.3px',
  }}>
    {children}
  </span>
);

const AppNavbar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const pathParts = location.pathname.split('/').filter(Boolean);
  const onCompanyPage = pathParts[0] === 'companies' && pathParts.length >= 2;
  const ticker = onCompanyPage ? pathParts[1] : null;
  const onReportsPage = onCompanyPage && pathParts[2] === 'reports';

  const [company, setCompany] = useState(null);

  useEffect(() => {
    if (!ticker) { setCompany(null); return; }
    fetch(`${process.env.REACT_APP_API_URL}/api/companies/${ticker}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setCompany(data))
      .catch(() => {});
  }, [ticker]);

  const isHome = location.pathname === '/';
  const isCompanies = location.pathname.startsWith('/companies');

  const showContextBar = onCompanyPage && company;

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: '#fff',
      boxShadow: showContextBar ? 'none' : '0 1px 0 #e5e7eb',
    }}>
      {/* ── Main navbar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        height: '58px',
        borderBottom: '1px solid #e5e7eb',
        gap: '28px',
      }}>
        {/* Logo + brand */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flexShrink: 0 }}
          onClick={() => navigate('/')}
        >
          <Logo />
          <span style={{ fontSize: '17px', fontWeight: 700, color: '#111', letterSpacing: '-0.3px' }}>
            DeepVal
          </span>
        </div>

        {/* Nav links */}
        <nav style={{ display: 'flex', alignItems: 'flex-end', gap: '24px', height: '100%', paddingTop: '14px' }}>
          <NavLink active={isHome} onClick={() => navigate('/')}>Home</NavLink>
          <NavLink active={isCompanies} onClick={() => navigate('/companies')}>Companies</NavLink>
        </nav>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Search */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#f3f4f6',
          borderRadius: '8px',
          padding: '7px 12px',
          minWidth: '220px',
        }}>
          <Search size={15} color="#9ca3af" strokeWidth={2} />
          <span style={{ flex: 1, fontSize: '14px', color: '#9ca3af' }}>Search...</span>
          <span style={{
            fontSize: '11px',
            color: '#9ca3af',
            background: '#e5e7eb',
            borderRadius: '4px',
            padding: '1px 5px',
            fontFamily: 'system-ui',
          }}>⌘K</span>
        </div>

        {/* Bell */}
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
          <Bell size={20} color="#6b7280" strokeWidth={2} />
        </button>

        {/* Avatar */}
        <div style={{
          width: '34px',
          height: '34px',
          borderRadius: '50%',
          background: '#2563eb',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '12px',
          flexShrink: 0,
          cursor: 'pointer',
          userSelect: 'none',
        }}>
          JA
        </div>
      </div>

      {/* ── Context / breadcrumb bar ── */}
      {showContextBar && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 24px',
          height: '38px',
          background: '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          fontSize: '13px',
          color: '#374151',
        }}>
          <button
            onClick={() => navigate('/companies')}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              fontSize: '13px',
              color: '#374151',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span style={{ fontSize: '15px', color: '#9ca3af' }}>‹</span>
            {onReportsPage ? (
              <span
                onClick={(e) => { e.stopPropagation(); navigate(`/companies/${ticker}`); }}
                style={{ cursor: 'pointer' }}
              >
                {company.name}
              </span>
            ) : (
              'Companies'
            )}
          </button>

          {!onReportsPage && (
            <>
              <Chevron />
              <TickerBadge>{ticker}</TickerBadge>
              <span style={{ fontWeight: 600 }}>{company.name}</span>
              {company.sicDescription && (
                <>
                  <Chevron />
                  <span style={{ color: '#6b7280' }}>{company.sicDescription}</span>
                </>
              )}
            </>
          )}

          {onReportsPage && (
            <>
              <Chevron />
              <span style={{ fontWeight: 600 }}>Filings</span>
            </>
          )}
        </div>
      )}
    </header>
  );
};

export default AppNavbar;
