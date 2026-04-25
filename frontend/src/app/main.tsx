import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/app/App';
import '@/app/styles.css';
import { ThemeProvider } from '@/shared/theme/ThemeContext';

// This is the true runtime entry point for the browser application.
// Think of it as the bootstrap function of the frontend.
//
// Why use StrictMode?
// - It helps catch lifecycle and side-effect mistakes during development.
// - It encourages safer React code that behaves more predictably in production.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);

