import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';

interface ProtectedRouteProps {
  children: JSX.Element;
}

/**
 * Wraps a route so only authenticated users can access it.
 * Unauthenticated visitors are redirected to /login with a ?redirect= param
 * so they land back on the intended page after signing in.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps): JSX.Element {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  // While the auth state is being restored from localStorage, render nothing
  // to avoid a flash of the login redirect.
  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <div className="loading-hint">Loading...</div>
      </div>
    );
  }

  if (!user) {
    const redirectPath = location.pathname + location.search;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
  }

  return children;
}
