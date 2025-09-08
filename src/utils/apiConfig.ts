// Central API configuration for the app
export const getApiUrl = (): string => {
  // Use Replit domain without port - external routing is handled automatically
  return 'https://dbd92ef9-e6ad-47d3-8c74-e9d5a1774306-00-3iwkt6lu634jh.pike.replit.dev';
};

export const API_BASE_URL = getApiUrl();