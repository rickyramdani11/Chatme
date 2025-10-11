const express = require('express');
const router = express.Router();
const { sendNotificationToUser, sendNotificationToDevice } = require('../services/firebase');

/**
 * Register or update device token for push notifications
 * POST /api/notifications/register-token
 * Body: { deviceToken: string, platform: 'ios' | 'android' | 'web' }
 */
router.post('/register-token', async (req, res) => {
  const { deviceToken, platform } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!deviceToken || !platform) {
    return res.status(400).json({ error: 'Device token and platform are required' });
  }

  try {
    const pool = req.app.get('pool');

    // Check if token already exists for this user
    const existingToken = await pool.query(
      'SELECT * FROM device_tokens WHERE user_id = $1 AND device_token = $2',
      [userId, deviceToken]
    );

    if (existingToken.rows.length > 0) {
      // Update existing token
      await pool.query(
        'UPDATE device_tokens SET platform = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2 AND device_token = $3',
        [platform, userId, deviceToken]
      );
      console.log(`✅ Device token updated for user ${userId}`);
    } else {
      // Insert new token
      await pool.query(
        'INSERT INTO device_tokens (user_id, device_token, platform) VALUES ($1, $2, $3)',
        [userId, deviceToken, platform]
      );
      console.log(`✅ New device token registered for user ${userId}`);
    }

    res.json({ success: true, message: 'Device token registered successfully' });
  } catch (error) {
    console.error('❌ Error registering device token:', error);
    res.status(500).json({ error: 'Failed to register device token' });
  }
});

/**
 * Remove device token (e.g., when user logs out)
 * DELETE /api/notifications/remove-token
 * Body: { deviceToken: string }
 */
router.delete('/remove-token', async (req, res) => {
  const { deviceToken } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!deviceToken) {
    return res.status(400).json({ error: 'Device token is required' });
  }

  try {
    const pool = req.app.get('pool');

    await pool.query(
      'DELETE FROM device_tokens WHERE user_id = $1 AND device_token = $2',
      [userId, deviceToken]
    );

    console.log(`✅ Device token removed for user ${userId}`);
    res.json({ success: true, message: 'Device token removed successfully' });
  } catch (error) {
    console.error('❌ Error removing device token:', error);
    res.status(500).json({ error: 'Failed to remove device token' });
  }
});

/**
 * Send notification to a specific user (admin only)
 * POST /api/notifications/send
 * Body: { userId: number, title: string, body: string, data?: object }
 */
router.post('/send', async (req, res) => {
  const { userId, title, body, data } = req.body;
  const requesterRole = req.user?.role;

  // Only admin can send custom notifications
  if (requesterRole !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (!userId || !title || !body) {
    return res.status(400).json({ error: 'userId, title, and body are required' });
  }

  try {
    const pool = req.app.get('pool');

    const result = await sendNotificationToUser(
      pool,
      userId,
      { title, body },
      data || {}
    );

    if (result.success) {
      res.json({ 
        success: true, 
        message: 'Notification sent successfully',
        details: result
      });
    } else {
      res.status(500).json({ error: result.error || 'Failed to send notification' });
    }
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

/**
 * Get all registered devices for current user
 * GET /api/notifications/devices
 */
router.get('/devices', async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const pool = req.app.get('pool');

    const result = await pool.query(
      'SELECT id, platform, created_at, updated_at FROM device_tokens WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );

    res.json({ devices: result.rows });
  } catch (error) {
    console.error('❌ Error fetching devices:', error);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

module.exports = router;
