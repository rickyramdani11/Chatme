// Central API configuration for the app
export const getApiUrl = (): string => {
  // Use Replit domain without port - external routing is handled automatically
  return 'https://50d2b144-4cff-4054-905e-206f417b8713-00-5390uahnmft5.pike.replit.dev';
};

export const API_BASE_URL = getApiUrl();