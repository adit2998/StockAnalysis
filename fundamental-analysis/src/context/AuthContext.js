import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On app load, check if a token is already stored and validate it with the backend
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (!token) { setLoading(false); return; }

    fetch(`${process.env.REACT_APP_API_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setUser(data);
        else localStorage.removeItem('authToken');
      })
      .catch(() => localStorage.removeItem('authToken'))
      .finally(() => setLoading(false));
  }, []);

  // Called by AuthCallback after Google redirects back with a token in the URL
  const login = async (token) => {
    localStorage.setItem('authToken', token);
    const res = await fetch(`${process.env.REACT_APP_API_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) setUser(await res.json());
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    setUser(null);
  };

  // Wrapper around fetch that automatically attaches the Authorization header
  const authFetch = (url, options = {}) => {
    const token = localStorage.getItem('authToken');
    return fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });
  };

  const addCompany = async (ticker) => {
    const res = await authFetch(
      `${process.env.REACT_APP_API_URL}/api/users/companies/${ticker}`,
      { method: 'POST' }
    );
    if (res.ok) {
      const { company } = await res.json();
      setUser(prev => ({
        ...prev,
        companies: [...(prev.companies || []), ticker],
        companiesData: [...(prev.companiesData || []), company],
      }));
    }
  };

  const removeCompany = async (ticker) => {
    const res = await authFetch(
      `${process.env.REACT_APP_API_URL}/api/users/companies/${ticker}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      setUser(prev => ({
        ...prev,
        companies: prev.companies.filter(t => t !== ticker),
        companiesData: prev.companiesData.filter(c => c.ticker !== ticker),
      }));
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, authFetch, addCompany, removeCompany, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
