// Central API configuration for the app
export const getApiUrl = (): string => {
  // Use Replit domain with HTTPS/WSS support
  return 'https://7f6884e2-7b1d-424f-ae50-4ca71e6a78a3-00-hvqr41f78xg8.sisko.replit.dev';
};

export const getSocketUrl = (): string => {
  // Use same domain for WebSocket with secure connection
  return 'wss://7f6884e2-7b1d-424f-ae50-4ca71e6a78a3-00-hvqr41f78xg8.sisko.replit.dev';
};

export const API_BASE_URL = getApiUrl();
export const SOCKET_URL = getSocketUrl();

// Socket.IO configuration - Using dedicated gateway
export const SOCKET_CONFIG = {
  url: IS_DEVELOPMENT ? 'http://0.0.0.0:5001' : `${API_BASE_URL.replace(':5000', ':5001')}`,
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