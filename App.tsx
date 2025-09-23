
import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { Platform, View, Text } from 'react-native';
import { AuthProvider } from './src/contexts/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import SplashScreen from './src/screens/SplashScreen';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  // Blokir akses web - hanya izinkan mobile
  if (Platform.OS === 'web') {
    return (
      <View style={{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: '#f0f0f0',
        padding: 20 
      }}>
        <Text style={{ 
          fontSize: 24, 
          fontWeight: 'bold', 
          color: '#333', 
          textAlign: 'center',
          marginBottom: 20 
        }}>
          ChatMe Mobile App
        </Text>
        <Text style={{ 
          fontSize: 16, 
          color: '#666', 
          textAlign: 'center',
          lineHeight: 24 
        }}>
          Aplikasi ini hanya tersedia untuk perangkat mobile.{'\n'}
          Silakan gunakan Expo Go di smartphone Anda.
        </Text>
      </View>
    );
  }

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <NavigationContainer>
      <AuthProvider>
        <AppNavigator />
        <StatusBar style="auto" />
      </AuthProvider>
    </NavigationContainer>
  );
}
