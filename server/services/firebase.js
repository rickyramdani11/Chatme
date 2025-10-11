const admin = require('firebase-admin');

let firebaseInitialized = false;

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
 * Send push notification to a specific device token
 * @param {string} token - FCM device token
 * @param {object} notification - Notification payload
 * @param {object} data - Additional data payload
 */
async function sendNotificationToDevice(token, notification, data = {}) {
  if (!firebaseInitialized) {
    console.warn('⚠️  Firebase not initialized. Cannot send notification.');
    return { success: false, error: 'Firebase not initialized' };
  }

  try {
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
    console.log('✅ Notification sent successfully:', response);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('❌ Error sending notification:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send push notification to multiple devices
 * @param {string[]} tokens - Array of FCM device tokens
 * @param {object} notification - Notification payload
 * @param {object} data - Additional data payload
 */
async function sendNotificationToMultipleDevices(tokens, notification, data = {}) {
  if (!firebaseInitialized) {
    console.warn('⚠️  Firebase not initialized. Cannot send notification.');
    return { success: false, error: 'Firebase not initialized' };
  }

  if (!tokens || tokens.length === 0) {
    return { success: false, error: 'No tokens provided' };
  }

  try {
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
        ...(notification.imageUrl && { imageUrl: notification.imageUrl })
      },
      data,
      tokens, // Send to multiple tokens
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
    console.log(`✅ Notifications sent: ${response.successCount} success, ${response.failureCount} failed`);
    
    return { 
      success: true, 
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses
    };
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
