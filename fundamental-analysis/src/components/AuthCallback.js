import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Google redirects the browser here: /auth/callback?token=<jwt>
// We store the token and move the user on to /companies.
const AuthCallback = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      login(token).then(() => navigate('/companies', { replace: true }));
    } else {
      navigate('/login?error=missing_token', { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#6b7280',
      fontSize: '15px',
    }}>
      Signing you in...
    </div>
  );
};

export default AuthCallback;
