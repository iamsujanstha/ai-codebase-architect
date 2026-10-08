import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { ROUTES } from '@/app/constants/routes';

/**
 * AuthCallbackPage — landing page after Google OAuth redirect.
 *
 * The backend redirects here with ?token=...&user=...&redirect=...
 * We parse the token, store it, then navigate to the intended destination
 * (defaults to home if no redirect param was provided).
 */
export const AuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token    = searchParams.get('token');
    const userStr  = searchParams.get('user');
    // Default to home — this is what the user sees after a normal Google sign-in
    const redirectTo = searchParams.get('redirect') ?? ROUTES.HOME;

    if (token && userStr) {
      try {
        const user = JSON.parse(decodeURIComponent(userStr));
        login(token, user);
        // Replace so the callback URL doesn't stay in browser history
        navigate(redirectTo, { replace: true });
      } catch (err) {
        console.error('Failed to parse Google login response:', err);
        navigate(ROUTES.LOGIN, { replace: true });
      }
    } else {
      // No token — something went wrong, send back to login
      navigate(ROUTES.LOGIN, { replace: true });
    }
  }, [searchParams, login, navigate]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      gap: '16px',
    }}>
      <div className="auth-loading-spinner" aria-label="Completing sign-in…" />
      <p className="loading-hint">Completing sign-in…</p>
    </div>
  );
};
