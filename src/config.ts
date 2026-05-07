// Environment configuration
// Vite exposes environment variables prefixed with VITE_ to the client bundle

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Helper to check if we're in production
export const isProduction = import.meta.env.PROD;

// Helper to check if we're in development
export const isDevelopment = import.meta.env.DEV;
