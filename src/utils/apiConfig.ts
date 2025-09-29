// Central API configuration for the app
const IS_DEVELOPMENT = __DEV__ || process.env.NODE_ENV === 'development';

// API Configuration - Use different URLs for mobile vs web
const REPLIT_DOMAIN = process.env.REPLIT_DEV_DOMAIN || 'abed75e4-0074-4553-b02b-0ccf98d04bb1-00-3cbrqb7zslnfk.pike.replit.dev';

// For mobile app in development, use localhost
export const API_BASE_URL = `http://localhost:3000/api`;
export const SOCKET_URL = `https://${REPLIT_DOMAIN}:8000`;

// Socket.IO configuration - Using dedicated GATEWAY server  
export const SOCKET_CONFIG = {
  // Connect to GATEWAY server on port 8000 (use https for Socket.IO)
  url: `https://${REPLIT_DOMAIN}:8000`,
  options: {
    transports: ['websocket'], // Only websocket
    timeout: 20000,
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    autoConnect: true,
    upgrade: false,
    rememberUpgrade: false,
    path: '/socket.io/',
    withCredentials: false
  }
};