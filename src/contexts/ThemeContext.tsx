import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  colors: {
    background: string;
    surface: string;
    card: string;
    text: string;
    textSecondary: string;
    border: string;
    primary: string;
    success: string;
    error: string;
    warning: string;
    info: string;
  };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const lightTheme = {
  background: '#f5f5f5',
  surface: '#ffffff',
  card: '#ffffff',
  text: '#333333',
  textSecondary: '#666666',
  border: '#e0e0e0',
  primary: '#9C27B0',
  success: '#4CAF50',
  error: '#F44336',
  warning: '#FF9800',
  info: '#2196F3',
};

const darkTheme = {
  background: '#121212',
  surface: '#1e1e1e',
  card: '#2a2a2a',
  text: '#ffffff',
  textSecondary: '#b0b0b0',
  border: '#3a3a3a',
  primary: '#BB86FC',
  success: '#03DAC6',
  error: '#CF6679',
  warning: '#FFB74D',
  info: '#64B5F6',
};

const THEME_STORAGE_KEY = '@theme_mode';

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    loadThemePreference();
  }, []);

  const loadThemePreference = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme !== null) {
        setIsDarkMode(savedTheme === 'dark');
      }
    } catch (error) {
      console.error('Error loading theme preference:', error);
    }
  };

  const toggleDarkMode = async () => {
    try {
      const newMode = !isDarkMode;
      setIsDarkMode(newMode);
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newMode ? 'dark' : 'light');
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const colors = isDarkMode ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode, colors }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
