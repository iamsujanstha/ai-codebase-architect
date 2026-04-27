import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { loginWithRedirect } from '@/app/constants/routes';

interface ProtectedRouteProps {
  children: JSX.Element;
}

/**
 * Real-world auth guard — mirrors how Amazon/Shopify protect account pages.
 *
 * - While auth state is being restored from localStorage: shows a full-screen
 *   loading state so there's no flash-redirect to /login on hard refresh.
 * - Unauthenticated: redirects to /login with ?redirect= so the user lands
 *   back on the intended page after signing in.
 * - Authenticated: renders the page normally.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps): JSX.Element {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-loading-spinner" aria-label="Checking authentication…" />
      </div>
    );
  }

  if (!user) {
    const returnTo = location.pathname + location.search;
    return (
      <Navigate
        to={loginWithRedirect(returnTo)}
        replace
        state={{ from: location }}
      />
    );
  }

  return children;
}
