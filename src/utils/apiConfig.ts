// Central API configuration for the app
const IS_DEVELOPMENT = __DEV__ || process.env.NODE_ENV === 'development';

export const getApiUrl = (): string => {
  // Use Replit domain with HTTPS/WSS support
  return 'https://f04796f8-b5cf-4198-88aa-fca437b208bf-00-1l5hkok1g68yq.sisko.replit.dev';
};

export const getSocketUrl = (): string => {
  // Use same domain for WebSocket with secure connection
  return 'wss://f04796f8-b5cf-4198-88aa-fca437b208bf-00-1l5hkok1g68yq.sisko.replit.dev';
};

export const API_BASE_URL = getApiUrl();
export const SOCKET_URL = getSocketUrl();

// Socket.IO configuration - Using dedicated gateway
export const SOCKET_CONFIG = {
  url: 'wss://f04796f8-b5cf-4198-88aa-fca437b208bf-00-1l5hkok1g68yq.sisko.replit.dev:5001',
  options: {
    transports: ['websocket', 'polling'],
    timeout: 20000,
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    autoConnect: false
  }
};