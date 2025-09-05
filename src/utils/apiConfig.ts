// Central API configuration for the app
export const getApiUrl = (): string => {
  // Use Replit domain without port - external routing is handled automatically
  return 'https://f895bc3f-6090-4fb1-8634-672cdba5ced2-00-2h547ujddzy9t.sisko.replit.dev';
};

export const API_BASE_URL = getApiUrl();