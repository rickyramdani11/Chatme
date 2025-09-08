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