import React, { createContext, useState, ReactNode, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { API_BASE_URL } from '../utils/apiConfig';

interface User {
  id: string;
  username: string;
  email: string;
  bio: string;
  phone: string;
  avatar: string | null;
  gender?: string;
  birthDate?: string;
  country?: string;
  signature?: string;
  role?: 'user' | 'merchant' | 'mentor' | 'admin';
  level?: number;
  status?: 'online' | 'offline' | 'away' | 'busy';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email: string, phone: string, country: string, gender: string) => Promise<void>;
  logout: () => void;
  updateProfile: (userData: Partial<User>) => Promise<void>;
  refreshUserData: () => Promise<User | null>;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('token');
      const storedUser = await AsyncStorage.getItem('user');

      if (storedToken && storedUser) {
        // Validate token format before using
        if (typeof storedToken === 'string' && storedToken.split('.').length === 3) {
          console.log('Loading stored token and user');
          setToken(storedToken);
          const userData = JSON.parse(storedUser);
          setUser(userData);

          // Refresh user data from server to get latest role information
          try {
            const response = await fetch(`${API_BASE_URL}/api/users/${userData.id}/profile`, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${storedToken}`,
              },
            });

            if (response.ok) {
            const latestUserData = await response.json();
            console.log('Refreshed user data from server:', latestUserData);

            // Always use server role as authoritative source
            const updatedUserData = {
              ...userData,
              ...latestUserData,
              role: latestUserData.role // Always use server role
            };

            setUser(updatedUserData);
            await AsyncStorage.setItem('user', JSON.stringify(updatedUserData));
            console.log('User role after refresh (server authoritative):', updatedUserData.role);
            } else {
              console.log('Failed to refresh user data, server response not ok:', response.status);
              // Still set the stored user data
              setUser(userData);
            }
          } catch (refreshError) {
            console.log('Failed to refresh user data, using stored data:', refreshError);
            // Still set the stored user data even if refresh fails
            setUser(userData);
          }
        } else {
          console.log('Invalid stored token format, clearing storage');
          await AsyncStorage.removeItem('token');
          await AsyncStorage.removeItem('user');
        }
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
      // Clear potentially corrupted data
      try {
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('user');
      } catch (clearError) {
        console.error('Error clearing storage:', clearError);
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    try {
      console.log('Attempting to login user:', username);
      console.log('API URL:', `${API_BASE_URL}/api/auth/login`);

      // Test API connectivity first
      try {
        const testResponse = await fetch(`${API_BASE_URL}/api/health`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        });
        console.log('Health check response status:', testResponse.status);
      } catch (healthError) {
        console.error('Health check failed:', healthError);
        throw new Error('Server is not reachable. Please check your internet connection and try again.');
      }

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('Login response status:', response.status);
      console.log('Login response headers:', Object.fromEntries(response.headers.entries()));

      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // If the response is not JSON, it might be an HTML error page.
        const errorText = await response.text();
        console.error('Non-JSON response received:', errorText.substring(0, 500)); // Log first 500 chars
        throw new Error(`Server connection failed. Please check if the server is running. Status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Login response data:', data);

      if (!response.ok) {
        throw new Error(data.error || `Login failed with status ${response.status}`);
      }

      // Validate token before storing
      if (!data.token || typeof data.token !== 'string' || data.token.length < 10) {
        throw new Error('Invalid token received from server');
      }

      console.log('Setting token and user data');
      setToken(data.token);
      setUser(data.user);

      await AsyncStorage.setItem('token', data.token);
      await AsyncStorage.setItem('user', JSON.stringify(data.user));

      console.log('Login successful, token stored');
    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout. Please check your internet connection.');
        }
        if (error.message.includes('Failed to fetch') || error.message.includes('Network request failed')) {
          throw new Error('Server connection failed. Please check if the server is running. Status: Network Error');
        }
        throw new Error(error.message);
      } else {
        throw new Error('Network error during login');
      }
    }
  };

  const register = async (username: string, password: string, email: string, phone: string, country: string, gender: string) => {
    try {
      console.log('Attempting to register user:', { username, email, phone, country, gender });
      console.log('API URL:', `${API_BASE_URL}/api/auth/register`);

      const requestBody = { username, password, email, phone, country, gender };
      console.log('Request body:', requestBody);

      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      console.log('Sending fetch request...');

      console.log('Making request to:', `${API_BASE_URL}/api/auth/register`);

      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'ChatMe-Mobile-App',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('Register response received');
      console.log('Register response status:', response.status);
      console.log('Register response OK:', response.ok);
      console.log('Register response URL:', response.url);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      // Check if response is actually JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        // If the response is not JSON, it might be an HTML error page.
        const errorText = await response.text();
        console.error('Non-JSON response received:', errorText.substring(0, 500)); // Log first 500 chars
        throw new Error(`Server returned non-JSON response. Status: ${response.status}. Expected JSON.`);
      }

      let data;
      try {
        data = await response.json();
        console.log('Parsed JSON data:', data);
      } catch (parseError) {
        console.error('Failed to parse JSON response:', parseError);
        throw new Error(`Server returned invalid JSON. Status: ${response.status}`);
      }


      if (!response.ok) {
        throw new Error(data.error || `Registration failed with status ${response.status}: ${data.message || 'Unknown error'}`);
      }

      console.log('Registration successful:', data.message);
      return;

    } catch (error) {
      console.error('Registration error:', error);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout. Please check your internet connection.');
        }
        throw new Error(error.message);
      } else {
        throw new Error('Network error during registration');
      }
    }
  };

  const updateProfile = async (userData: Partial<User> | User) => {
    if (!user) return;

    try {
      // If userData is a complete user object, use it directly
      if ('id' in userData && 'username' in userData && 'email' in userData) {
        setUser(userData as User);
        await AsyncStorage.setItem('user', JSON.stringify(userData));
        return;
      }

      // Otherwise, make API call for partial update
      const response = await fetch(`${API_BASE_URL}/api/users/${user.id}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(userData),
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const errorText = await response.text();
        console.error('Non-JSON response received:', errorText.substring(0, 500));
        throw new Error(`Server returned non-JSON response. Status: ${response.status}. Expected JSON.`);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Profile update failed');
      }

      setUser(data);
      await AsyncStorage.setItem('user', JSON.stringify(data));
    } catch (error) {
      console.error('Profile update error:', error);
      if (error instanceof SyntaxError) {
        throw new Error('Invalid response from server. Please check your connection or try again.');
      } else if (error instanceof Error) {
        throw new Error(error.message);
      } else {
        throw new Error('Network error during profile update');
      }
    }
  };

  const refreshUserData = async () => {
    if (!user || !token) return;

    try {
      console.log('Manually refreshing user data for role sync...');
      const response = await fetch(`${API_BASE_URL}/api/users/${user.id}/profile`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const latestUserData = await response.json();
        console.log('Manual refresh - server user data:', latestUserData);

        // Merge with current user data, prioritizing server role
        const updatedUserData = {
          ...user,
          ...latestUserData,
          role: latestUserData.role // Always use server role
        };

        setUser(updatedUserData);
        await AsyncStorage.setItem('user', JSON.stringify(updatedUserData));
        console.log('User role after manual refresh:', updatedUserData.role);
        return updatedUserData;
      } else {
        console.log('Failed to refresh user data manually:', response.status);
      }
    } catch (error) {
      console.error('Error in manual refresh:', error);
    }
    return user;
  };

  const logout = async () => {
    try {
      // Call server logout endpoint if token exists
      if (token) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          });

          const data = await response.json();
          console.log('Server logout response:', data.message);
        } catch (serverError) {
          console.log('Server logout failed, proceeding with local logout:', serverError);
        }
      }

      // Clear local storage regardless of server response
      setUser(null);
      setToken(null);
      await AsyncStorage.removeItem('token');
      await AsyncStorage.removeItem('user');

      console.log('User logged out successfully');

      // Force a state update to trigger re-render
      setLoading(false);

    } catch (error) {
      console.error('Logout error:', error);
      // Even if there's an error, clear local data
      setUser(null);
      setToken(null);
      try {
        await AsyncStorage.removeItem('token');
        await AsyncStorage.removeItem('user');
      } catch (storageError) {
        console.error('Error clearing storage:', storageError);
      }
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, updateProfile, refreshUserData, loading }}>
      {children}
    </AuthContext.Provider>
  );
};