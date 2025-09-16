// Central API configuration for the app
const IS_DEVELOPMENT = __DEV__ || process.env.NODE_ENV === 'development';

export const getApiUrl = (): string => {
  // Use Replit domain with HTTPS/WSS support
  return 'https://67d8e64a-a377-45ed-846e-3375ce0743e9-00-falpjwlvc7lp.pike.replit.dev';
};

export const getSocketUrl = (): string => {
  // Connect to GATEWAY server on port 8000 (use https for Socket.IO)
  return 'https://67d8e64a-a377-45ed-846e-3375ce0743e9-00-falpjwlvc7lp.pike.replit.dev:8000';
};

export const API_BASE_URL = getApiUrl();
export const SOCKET_URL = getSocketUrl();

// Socket.IO configuration - Using dedicated GATEWAY server  
export const SOCKET_CONFIG = {
  // Connect to GATEWAY server on port 8000 (use https for Socket.IO)
  url: 'https://67d8e64a-a377-45ed-846e-3375ce0743e9-00-falpjwlvc7lp.pike.replit.dev:8000',
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