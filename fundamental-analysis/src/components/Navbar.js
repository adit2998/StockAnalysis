import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

const AppNavbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isHome = location.pathname === '/';
  const isCompanies = location.pathname.startsWith('/companies');
  const showContextBar = onCompanyPage && company;

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate('/');
  };

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

        <div style={{ flex: 1 }} />

        {/* Bell */}
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
          <Bell size={20} color="#6b7280" strokeWidth={2} />
        </button>

        {/* Avatar / user menu */}
        {user ? (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <div
              onClick={() => setMenuOpen(o => !o)}
              title={user.name}
              style={{
                width: '34px', height: '34px', borderRadius: '50%',
                background: '#2563eb', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '12px',
                flexShrink: 0, cursor: 'pointer', userSelect: 'none',
              }}
            >
              {getInitials(user.name)}
            </div>

            {menuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                background: '#fff', border: '1px solid #e5e7eb',
                borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                minWidth: '180px', overflow: 'hidden', zIndex: 200,
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#111' }}>{user.name}</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>{user.email}</div>
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 16px', background: 'none', border: 'none',
                    fontSize: '14px', color: '#ef4444', cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => navigate('/login')}
            style={{
              background: '#2563eb', color: '#fff',
              border: 'none', borderRadius: '7px',
              padding: '7px 16px', fontSize: '14px', fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Sign in
          </button>
        )}
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
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 0, fontSize: '13px', color: '#374151',
              display: 'flex', alignItems: 'center', gap: '4px',
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
