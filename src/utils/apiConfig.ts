// Central API configuration for the app
const IS_DEVELOPMENT = __DEV__ || process.env.NODE_ENV === 'development';

export const getApiUrl = (): string => {
  // Use Replit domain with HTTPS/WSS support
  return 'https://d6e74b17-2201-488a-9c5b-495838e72537-00-m2aty8gax61o.sisko.replit.dev';
};

export const getSocketUrl = (): string => {
  // Connect to GATEWAY server on port 8000 (use https for Socket.IO)
  return 'https://d6e74b17-2201-488a-9c5b-495838e72537-00-m2aty8gax61o.sisko.replit.dev:8000';
};

export const API_BASE_URL = getApiUrl();
export const SOCKET_URL = getSocketUrl();

// Socket.IO configuration - Using dedicated GATEWAY server  
export const SOCKET_CONFIG = {
  // Connect to GATEWAY server on port 8000 (use https for Socket.IO)
  url: 'https://d6e74b17-2201-488a-9c5b-495838e72537-00-m2aty8gax61o.sisko.replit.dev:8000',
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