import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// This Vite config stays intentionally small, but it still teaches an important lesson:
// build tools are part of architecture too.
//
// The proxy below is only for local development.
// In Docker/production, Nginx handles that responsibility instead.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/ai': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        timeout: 300000,
        proxyTimeout: 300000,
      },
      '/catalog': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/payments': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/orders': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
