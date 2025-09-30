// Central API configuration for the  app
const IS_DEVELOPMENT = __DEV__ || process.env.NODE_ENV === 'development';

// Replit domain base
const BASE_REPLIT_URL = 'https://abed75e4-0074-4553-b02b-0ccf98d04bb1-00-3cbrqb7zslnfk.pike.replit.dev';

// API Configuration  
export const API_BASE_URL = `${BASE_REPLIT_URL}/api`; // API Server now on port 5000 (default Replit port)
export const BASE_URL = BASE_REPLIT_URL; // Base URL without /api for paths that already include /api

// Socket.IO configuration - Proxied through API Server port 5000
export const SOCKET_URL = BASE_REPLIT_URL; // Socket.IO will append /socket.io/ automatically

// Socket.IO config
export const SOCKET_CONFIG = {
  url: SOCKET_URL,
  options: {
    transports: ['websocket', 'polling'], // Allow both transports
    timeout: 20000,
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    autoConnect: true,
    upgrade: true, // Allow upgrade from polling to websocket
    rememberUpgrade: false,
    path: '/socket.io/', // Default Socket.IO path (proxied to Gateway)
    withCredentials: false,
  }
};