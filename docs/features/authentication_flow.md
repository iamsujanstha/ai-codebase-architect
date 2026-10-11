# Authentication & Authorization Flow

This document outlines the authentication and authorization implementation in the project, covering both traditional and OAuth2-based methods.

## 1. Overview
The project uses a JWT-based authentication system. The backend is built with NestJS and Passport.js, and the frontend uses React with a dedicated `AuthContext`.

## 2. Supported Methods
- **Email/Password**: Standard registration and login using `bcrypt` for password hashing.
- **Google OAuth2**: Single sign-on integration using the Google OAuth2.0 API.
- **Forgot Password**: Token-based recovery flow with email notification (mocked in development).

## 3. Backend Implementation (`/backend/src/auth`)
- **JWT Strategy**: Validates the `Authorization: Bearer <token>` header on protected routes.
- **Google Strategy**: Handles the handshake with Google and maps the Google profile to a local user record.
- **Auth Service**: Contains the business logic for token generation, user validation, and password recovery.

### Key Endpoints:
- `POST /auth/register`: Create a new user.
- `POST /auth/login`: Authenticate and receive a JWT.
- `GET /auth/google`: Initiate Google OAuth flow.
- `GET /auth/google/callback`: Handle the redirect from Google and return to the frontend.
- `POST /auth/forgot-password`: Send a reset link.
- `POST /auth/reset-password`: Update password using a valid reset token.

## 4. Frontend Implementation (`/frontend/src/features/auth`)
- **AuthContext**: A React context provider that manages the `user` and `token` state globally.
- **LocalStorage**: The JWT and basic user info are persisted in `localStorage` to maintain sessions across page refreshes.
- **Auth Pages**:
    - `LoginPage`: Login form and Google button.
    - `RegisterPage`: New user signup.
    - `ForgotPasswordPage`: Password recovery request.
    - `ResetPasswordPage`: Password update form.
    - `AuthCallbackPage`: Handles the redirect from the backend after Google login.

## 5. Security Best Practices Implemented
- **Password Hashing**: Never storing plain-text passwords.
- **Protected Routes**: Ensuring only authenticated users can access the Admin Dashboard.
- **Redirection Safety**: The backend redirects to a pre-configured `FRONTEND_PUBLIC_URL` to prevent open redirect vulnerabilities.
- **JWT Expiry**: Tokens are short-lived to minimize the window for potential abuse.
