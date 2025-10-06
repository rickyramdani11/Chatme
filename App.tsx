// Polyfill for findLastIndex (not available in older JS environments)
if (!Array.prototype.findLastIndex) {
  Object.defineProperty(Array.prototype, 'findLastIndex', {
    value: function<T>(
      predicate: (value: T, index: number, obj: T[]) => boolean,
      thisArg?: any
    ): number {
      for (let i = this.length - 1; i >= 0; i--) {
        if (predicate.call(thisArg, this[i], i, this)) {
          return i;
        }
      }
      return -1;
    },
    configurable: true,
    writable: true,
    enumerable: false
  });
}

import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text, BackHandler } from 'react-native';
import { AuthProvider } from './src/contexts/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import SplashScreen from './src/screens/SplashScreen';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [apiStatus, setApiStatus] = useState('Checking...');
  const navigationRef = useRef<any>(null);

  // Web version - show API status only
  if (Platform.OS === 'web') {
    useEffect(() => {
      const checkApiStatus = async () => {
        try {
          const domain = process.env.REPLIT_DEV_DOMAIN || 'abed75e4-0074-4553-b02b-0ccf98d04bb1-00-3cbrqb7zslnfk.pike.replit.dev';
          const response = await fetch(`https://${domain}:3000/api/health`);
          const data = await response.json();
          setApiStatus(`ChatMe is running - ${data.message}`);
        } catch (error) {
          setApiStatus('API connection failed');
        }
      };
      checkApiStatus();
    }, []);

    return (
      <View style={{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: '#1a1a2e',
        padding: 20 
      }}>
        <Text style={{ 
          fontSize: 32, 
          fontWeight: 'bold', 
          color: '#00d4aa', 
          textAlign: 'center',
          marginBottom: 20 
        }}>
          ChatMe API
        </Text>
        <Text style={{ 
          fontSize: 18, 
          color: '#ffffff', 
          textAlign: 'center',
          marginBottom: 10
        }}>
          {apiStatus}
        </Text>
        <Text style={{ 
          fontSize: 14, 
          color: '#888', 
          textAlign: 'center' 
        }}>
          Server Status: /api/health
        </Text>
      </View>
    );
  }

  useEffect(() => {
    if (Platform.OS === 'android') {
      const onBackPress = () => {
        if (navigationRef.current?.canGoBack()) {
          navigationRef.current.goBack();
          return true;
        } else {
          BackHandler.exitApp();
          return true;
        }
      };

      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress
      );

      return () => subscription.remove();
    }
  }, []);

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <AuthProvider>
        <AppNavigator />
        <StatusBar style="auto" />
      </AuthProvider>
    </NavigationContainer>
  );
}
