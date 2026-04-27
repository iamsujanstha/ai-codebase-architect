import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import styles from './Auth.module.css';
import axios from 'axios';
import { ROUTES } from '@/app/constants/routes';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // After login, go back to wherever the user was trying to reach (e.g. /checkout).
  const redirectTo = searchParams.get('redirect') ?? ROUTES.HOME;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await axios.post('/auth/login', { email, password });
      login(response.data.access_token, response.data.user);
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // Pass the redirect destination through so the callback page can honour it.
    window.location.href = `/auth/google?redirect=${encodeURIComponent(redirectTo)}`;
  };

  return (
    <div className={styles.authContainer}>
      <div className={styles.authCard}>
        <h1 className={styles.authTitle}>Welcome Back</h1>
        <p className={styles.authSubtitle}>Enter your details to access your account</p>

        {redirectTo === '/checkout' && (
          <p className={styles.authSubtitle} style={{ color: 'var(--accent)', marginBottom: '1rem' }}>
            Please sign in to continue to checkout.
          </p>
        )}

        <form className={styles.authForm} onSubmit={handleSubmit}>
          <div className={styles.inputGroup}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" className={styles.authButton} disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className={styles.divider}>or</div>

        <button className={styles.googleButton} onClick={handleGoogleLogin}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" width="20" />
          Continue with Google
        </button>

        <p className={styles.authFooter}>
          Don't have an account? <Link to={ROUTES.REGISTER}>Sign Up</Link>
          <br />
          <Link to={ROUTES.FORGOT_PASSWORD} style={{ fontSize: '0.75rem', marginTop: '0.5rem', display: 'inline-block' }}>
            Forgot Password?
          </Link>
        </p>
      </div>
    </div>
  );
};
