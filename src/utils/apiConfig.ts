// Central API configuration for the app
export const getApiUrl = (): string => {
  // Use Replit domain without port - external routing is handled automatically
  return 'https://7f6884e2-7b1d-424f-ae50-4ca71e6a78a3-00-hvqr41f78xg8.sisko.replit.dev';
};

export const API_BASE_URL = getApiUrl();