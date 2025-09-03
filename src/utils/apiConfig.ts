// Central API configuration for the app
export const getApiUrl = (): string => {
  // For Expo mobile app development, use the Replit domain without port
  // Replit automatically routes external requests to the correct internal port
  return 'https://8eb5191f-4c55-45a2-ad6c-0559db7971c2-00-dbwwa5r6c02f.pike.replit.dev';
};

export const API_BASE_URL = getApiUrl();