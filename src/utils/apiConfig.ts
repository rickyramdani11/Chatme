// Central API configuration for the app
const IS_DEVELOPMENT = __DEV__ || process.env.NODE_ENV === 'development';

// API Configuration - Ensure consistent base URL
const REPLIT_URL = `https://${process.env.REPLIT_DEV_DOMAIN || '5e576e71-4f85-4705-be66-7a229774bebd-00-1eb96n9vqg789.sisko.replit.dev'}`;

export const API_BASE_URL = REPLIT_URL;
export const SOCKET_URL = `${REPLIT_URL}:8000`;

// Socket.IO configuration - Using dedicated GATEWAY server  
export const SOCKET_CONFIG = {
  // Connect to GATEWAY server on port 8000 (use https for Socket.IO)
  url: `https://${process.env.REPLIT_DEV_DOMAIN || '5e576e71-4f85-4705-be66-7a229774bebd-00-1eb96n9vqg789.sisko.replit.dev'}:8000`,
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