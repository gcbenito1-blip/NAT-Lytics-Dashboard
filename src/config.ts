// Environment configuration
// Vite exposes environment variables prefixed with VITE_ to the client bundle

// In production (Vercel monorepo), backend is at /_/backend
// In development, use localhost:5000
export const API_BASE_URL = import.meta.env.PROD
    ? '/_/backend'  // Use relative path to backend in monorepo
    : (import.meta.env.VITE_API_URL || 'http://localhost:5000');

// Helper to check if we're in production
export const isProduction = import.meta.env.PROD;

// Helper to check if we're in development
export const isDevelopment = import.meta.env.DEV;

// Debug logging (only in development)
if (!import.meta.env.PROD) {
    console.log('🔧 API_BASE_URL (development):', API_BASE_URL);
    console.log('📦 Environment:', import.meta.env.MODE);
}