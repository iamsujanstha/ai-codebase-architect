import { Route } from 'react-router-dom';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage';
import { AuthCallbackPage } from '@/features/auth/AuthCallbackPage';
import { ROUTES } from '../constants/routes';

/**
 * Auth route definitions — login, register, password recovery, OAuth callback.
 *
 * Exported as a plain array of <Route> elements so they can be spread
 * directly inside <Routes> in App.tsx.
 */
export const authRoutes = [
  <Route key="login"           path={ROUTES.LOGIN}           element={<LoginPage />} />,
  <Route key="register"        path={ROUTES.REGISTER}        element={<RegisterPage />} />,
  <Route key="forgot-password" path={ROUTES.FORGOT_PASSWORD} element={<ForgotPasswordPage />} />,
  <Route key="reset-password"  path={ROUTES.RESET_PASSWORD}  element={<ResetPasswordPage />} />,
  <Route key="auth-callback"   path={ROUTES.AUTH_CALLBACK}   element={<AuthCallbackPage />} />,
];
