import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';

/**
 * Configure how notifications are presented when app is in foreground
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register for push notifications and get device token
 */
export async function registerForPushNotifications(): Promise<string | null> {
  let token: string | null = null;

  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices');
    return null;
  }

  try {
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Permission to send notifications was denied');
      return null;
    }

    // Get FCM/APNS token (device push token for Firebase)
    const tokenData = await Notifications.getDevicePushTokenAsync();

    token = tokenData.data;
    console.log('📱 Device token obtained:', token);

    // Configure Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
      });
    }

    return token;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Send device token to backend
 */
export async function sendDeviceTokenToBackend(
  deviceToken: string,
  authToken: string
): Promise<boolean> {
  try {
    const platform = Platform.OS;

    const response = await fetch(`${API_URL}/api/notifications/register-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        deviceToken,
        platform,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Device token registered with backend');
      await AsyncStorage.setItem('deviceToken', deviceToken);
      return true;
    } else {
      console.error('❌ Failed to register device token:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Error sending device token to backend:', error);
    return false;
  }
}

/**
 * Remove device token from backend (e.g., on logout)
 */
export async function removeDeviceTokenFromBackend(
  authToken: string
): Promise<boolean> {
  try {
    const deviceToken = await AsyncStorage.getItem('deviceToken');
    if (!deviceToken) {
      return true; // No token to remove
    }

    const response = await fetch(`${API_URL}/api/notifications/remove-token`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        deviceToken,
      }),
    });

    if (response.ok) {
      console.log('✅ Device token removed from backend');
      await AsyncStorage.removeItem('deviceToken');
      return true;
    } else {
      console.error('❌ Failed to remove device token');
      return false;
    }
  } catch (error) {
    console.error('❌ Error removing device token:', error);
    return false;
  }
}

/**
 * Setup notification listeners
 */
export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void
) {
  // Listener for notifications received while app is in foreground
  const notificationListener = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('🔔 Notification received:', notification);
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    }
  );

  // Listener for when user taps on notification
  const responseListener = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('👆 Notification tapped:', response);
      if (onNotificationTapped) {
        onNotificationTapped(response);
      }
    }
  );

  // Return cleanup function
  return () => {
    notificationListener.remove();
    responseListener.remove();
  };
}

/**
 * Initialize push notifications (call this on app startup after login)
 */
export async function initializePushNotifications(authToken: string): Promise<void> {
  try {
    // Register for push notifications
    const deviceToken = await registerForPushNotifications();

    if (deviceToken) {
      // Send token to backend
      await sendDeviceTokenToBackend(deviceToken, authToken);
    }
  } catch (error) {
    console.error('Error initializing push notifications:', error);
  }
}
