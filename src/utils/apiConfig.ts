// Central API configuration for the app
export const getApiUrl = (): string => {
  // Use the current Replit domain without port for external access
  return 'https://8eb5191f-4c55-45a2-ad6c-0559db7971c2-00-dbwwa5r6c02f.pike.replit.dev';
};

export const API_BASE_URL = getApiUrl();