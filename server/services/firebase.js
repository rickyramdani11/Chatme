const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');

let firebaseInitialized = false;
let expo = new Expo();

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebase() {
  if (firebaseInitialized) {
    console.log('🔥 Firebase already initialized');
    return;
  }

  try {
    // Parse Firebase credentials from environment
    const firebaseCredentials = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!firebaseCredentials) {
      console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT not found. Push notifications will not work.');
      return;
    }

    const serviceAccount = JSON.parse(firebaseCredentials);

    // Validate required fields
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      console.error('❌ Invalid Firebase credentials. Missing required fields (project_id, private_key, or client_email)');
      console.error('📝 Please ensure you copied the COMPLETE Firebase service account JSON file');
      return;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    console.log('🔥 Firebase Admin SDK initialized successfully');
    console.log(`📱 Project ID: ${serviceAccount.project_id}`);
  } catch (error) {
    console.error('❌ Failed to initialize Firebase:', error.message);
    if (error instanceof SyntaxError) {
      console.error('📝 Invalid JSON format. Please check your FIREBASE_SERVICE_ACCOUNT secret');
    }
  }
}

/**
 * Check if token is Expo Push Token
 * @param {string} token - Push token
 */
function isExpoPushToken(token) {
  return token && token.startsWith('ExponentPushToken[');
}

/**
 * Send push notification to a specific device token
 * @param {string} token - Device push token (Expo or FCM)
 * @param {object} notification - Notification payload
 * @param {object} data - Additional data payload
 */
async function sendNotificationToDevice(token, notification, data = {}) {
  try {
    // Check if it's an Expo Push Token
    if (isExpoPushToken(token)) {
      // Send via Expo Push Service
      if (!Expo.isExpoPushToken(token)) {
        console.error('❌ Invalid Expo push token:', token);
        return { success: false, error: 'Invalid Expo push token' };
      }

      const message = {
        to: token,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: data,
        priority: 'high',
      };

      const chunks = expo.chunkPushNotifications([message]);
      const tickets = [];
      
      for (const chunk of chunks) {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      }

      console.log('✅ Expo notification sent successfully:', tickets[0]);
      return { success: true, ticket: tickets[0] };
    } else {
      // Send via Firebase FCM
      if (!firebaseInitialized) {
        console.warn('⚠️  Firebase not initialized. Cannot send FCM notification.');
        return { success: false, error: 'Firebase not initialized' };
      }

      const message = {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
          ...(notification.imageUrl && { imageUrl: notification.imageUrl })
        },
        data,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      const response = await admin.messaging().send(message);
      console.log('✅ FCM notification sent successfully:', response);
      return { success: true, messageId: response };
    }
  } catch (error) {
    console.error('❌ Error sending notification:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification to multiple devices
 * @param {string[]} tokens - Array of device tokens (Expo or FCM)
 * @param {object} notification - Notification payload
 * @param {object} data - Additional data payload
 */
async function sendNotificationToMultipleDevices(tokens, notification, data = {}) {
  if (!tokens || tokens.length === 0) {
    return { success: false, error: 'No tokens provided' };
  }

  try {
    // Separate Expo and FCM tokens
    const expoTokens = tokens.filter(token => isExpoPushToken(token));
    const fcmTokens = tokens.filter(token => !isExpoPushToken(token));

    const results = {
      success: true,
      totalSuccess: 0,
      totalFailure: 0,
      expoResults: null,
      fcmResults: null
    };

    // Send to Expo tokens
    if (expoTokens.length > 0) {
      const messages = expoTokens.map(token => ({
        to: token,
        sound: 'default',
        title: notification.title,
        body: notification.body,
        data: data,
        priority: 'high',
      }));

      const chunks = expo.chunkPushNotifications(messages);
      const tickets = [];
      
      for (const chunk of chunks) {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      }

      const expoSuccessCount = tickets.filter(t => t.status === 'ok').length;
      const expoFailureCount = tickets.filter(t => t.status === 'error').length;

      results.expoResults = { successCount: expoSuccessCount, failureCount: expoFailureCount };
      results.totalSuccess += expoSuccessCount;
      results.totalFailure += expoFailureCount;

      console.log(`📱 Expo notifications: ${expoSuccessCount} success, ${expoFailureCount} failed`);
    }

    // Send to FCM tokens
    if (fcmTokens.length > 0 && firebaseInitialized) {
      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
          ...(notification.imageUrl && { imageUrl: notification.imageUrl })
        },
        data,
        tokens: fcmTokens,
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            clickAction: 'FLUTTER_NOTIFICATION_CLICK'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      
      results.fcmResults = { 
        successCount: response.successCount, 
        failureCount: response.failureCount 
      };
      results.totalSuccess += response.successCount;
      results.totalFailure += response.failureCount;

      console.log(`🔥 FCM notifications: ${response.successCount} success, ${response.failureCount} failed`);
    }

    console.log(`✅ Total notifications sent: ${results.totalSuccess} success, ${results.totalFailure} failed`);
    return results;
  } catch (error) {
    console.error('❌ Error sending notifications:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send notification to all devices of a specific user
 * @param {number} userId - User ID
 * @param {object} notification - Notification payload
 * @param {object} data - Additional data payload
 */
async function sendNotificationToUser(pool, userId, notification, data = {}) {
  try {
    // Get all device tokens for the user
    const result = await pool.query(
      'SELECT device_token FROM device_tokens WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return { success: false, error: 'No devices registered for user' };
    }

    const tokens = result.rows.map(row => row.device_token);
    return await sendNotificationToMultipleDevices(tokens, notification, data);
  } catch (error) {
    console.error('❌ Error sending notification to user:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  initializeFirebase,
  sendNotificationToDevice,
  sendNotificationToMultipleDevices,
  sendNotificationToUser
};
