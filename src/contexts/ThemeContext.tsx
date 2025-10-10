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
    successBadgeBg: string;
    successBadgeText: string;
    errorBadgeBg: string;
    errorBadgeText: string;
    infoBadgeBg: string;
    infoBadgeText: string;
    iconDefault: string;
    statusOnline: string;
    badgeTextLight: string;
    avatarBg: string;
    switchThumb: string;
    shadow: string;
    roleAdmin: string;
    roleAdminBg: string;
    roleMentor: string;
    roleMentorBg: string;
    roleMerchant: string;
    roleMerchantBg: string;
    roleUser: string;
    roleUserBg: string;
    roleOwner: string;
    roleOwnerBg: string;
    overlay: string;
    overlayDark: string;
    overlayLight: string;
    avatarOverlay: string;
    textOverlay: string;
    borderOverlay: string;
    cardSubtle: string;
    successSubtle: string;
    callAccept: string;
    callDecline: string;
    textEmphasis: string;
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
  successBadgeBg: '#E8F5E8',
  successBadgeText: '#4CAF50',
  errorBadgeBg: '#FFEBEE',
  errorBadgeText: '#F44336',
  infoBadgeBg: '#E3F2FD',
  infoBadgeText: '#2196F3',
  iconDefault: '#666666',
  statusOnline: '#4CAF50',
  badgeTextLight: '#ffffff',
  avatarBg: '#333333',
  switchThumb: '#ffffff',
  shadow: '#000000',
  roleAdmin: '#FF6B35',
  roleAdminBg: '#FFEBEE',
  roleMentor: '#FF5722',
  roleMentorBg: '#FBE9E7',
  roleMerchant: '#9C27B0',
  roleMerchantBg: '#F3E5F5',
  roleUser: '#2196F3',
  roleUserBg: '#E3F2FD',
  roleOwner: '#e8d31a',
  roleOwnerBg: '#fefce8',
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayDark: 'rgba(0, 0, 0, 0.8)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  avatarOverlay: 'rgba(255, 255, 255, 0.3)',
  textOverlay: 'rgba(255, 255, 255, 0.8)',
  borderOverlay: 'rgba(255, 255, 255, 0.3)',
  cardSubtle: 'rgba(0, 0, 0, 0.05)',
  successSubtle: 'rgba(34, 197, 94, 0.15)',
  callAccept: 'rgba(139, 92, 246, 0.8)',
  callDecline: 'rgba(255, 105, 180, 0.8)',
  textEmphasis: 'rgba(255, 255, 255, 0.9)',
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
  successBadgeBg: '#1B5E20',
  successBadgeText: '#03DAC6',
  errorBadgeBg: '#5D1F1F',
  errorBadgeText: '#CF6679',
  infoBadgeBg: '#1A237E',
  infoBadgeText: '#64B5F6',
  iconDefault: '#b0b0b0',
  statusOnline: '#03DAC6',
  badgeTextLight: '#ffffff',
  avatarBg: '#424242',
  switchThumb: '#ffffff',
  shadow: '#000000',
  roleAdmin: '#FF8A65',
  roleAdminBg: 'rgba(255, 138, 101, 0.2)',
  roleMentor: '#FF7043',
  roleMentorBg: 'rgba(255, 112, 67, 0.2)',
  roleMerchant: '#BA68C8',
  roleMerchantBg: 'rgba(186, 104, 200, 0.2)',
  roleUser: '#64B5F6',
  roleUserBg: 'rgba(100, 181, 246, 0.2)',
  roleOwner: '#fbbf24',
  roleOwnerBg: 'rgba(251, 191, 36, 0.2)',
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayDark: 'rgba(0, 0, 0, 0.9)',
  overlayLight: 'rgba(51, 51, 51, 0.4)',
  avatarOverlay: 'rgba(255, 255, 255, 0.1)',
  textOverlay: 'rgba(255, 255, 255, 0.9)',
  borderOverlay: 'rgba(255, 255, 255, 0.3)',
  cardSubtle: 'rgba(255, 255, 255, 0.05)',
  successSubtle: 'rgba(34, 197, 94, 0.15)',
  callAccept: 'rgba(139, 92, 246, 0.8)',
  callDecline: 'rgba(255, 105, 180, 0.8)',
  textEmphasis: 'rgba(255, 255, 255, 0.9)',
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
