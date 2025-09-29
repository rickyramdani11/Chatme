// Central API configuration for the app
const IS_DEVELOPMENT = __DEV__ || process.env.NODE_ENV === 'development';

// Replit domain base
const BASE_REPLIT_URL = 'https://abed75e4-0074-4553-b02b-0ccf98d04bb1-00-3cbrqb7zslnfk.pike.replit.dev';

// API Configuration  
export const API_BASE_URL = `${BASE_REPLIT_URL}/api`; // API Server now on port 5000 (default Replit port)

// Socket.IO configuration - Misal socket jalan di /socket atau port 8000
export const SOCKET_URL = `${BASE_REPLIT_URL}/socket`;

// Socket.IO config
export const SOCKET_CONFIG = {
  url: SOCKET_URL,
  options: {
    transports: ['websocket'],
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
    withCredentials: false,
  }
};