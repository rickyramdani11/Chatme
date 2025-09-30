
const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('./auth');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize notifications tables
const initNotificationsTables = async () => {
  try {
    // User notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSONB,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP
      )
    `);

    // Notification settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_notification_settings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER UNIQUE NOT NULL,
        email_notifications BOOLEAN DEFAULT true,
        push_notifications BOOLEAN DEFAULT true,
        chat_notifications BOOLEAN DEFAULT true,
        gift_notifications BOOLEAN DEFAULT true,
        follow_notifications BOOLEAN DEFAULT true,
        system_notifications BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Notifications system tables initialized successfully');
  } catch (error) {
    console.error('Error initializing notifications tables:', error);
  }
};

// Initialize tables on module load
initNotificationsTables();

// Helper function to create notification
const createNotification = async (userId, type, title, message, data = null) => {
  try {
    const result = await pool.query(`
      INSERT INTO user_notifications (user_id, type, title, message, data)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [userId, type, title, message, data ? JSON.stringify(data) : null]);

    return result.rows[0];
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

// Get user notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20, type, unread_only = 'false' } = req.query;

    let query = `
      SELECT * FROM user_notifications
      WHERE user_id = $1
    `;
    
    const params = [userId];
    let paramCount = 1;

    if (type) {
      paramCount++;
      query += ` AND type = $${paramCount}`;
      params.push(type);
    }

    if (unread_only === 'true') {
      query += ` AND is_read = false`;
    }

    query += `
      ORDER BY created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await pool.query(query, params);

    // Get unread count
    const unreadResult = await pool.query(
      'SELECT COUNT(*) FROM user_notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );

    const notifications = result.rows.map(row => ({
      id: row.id.toString(),
      type: row.type,
      title: row.title,
      message: row.message,
      data: row.data ? JSON.parse(row.data) : null,
      isRead: row.is_read,
      createdAt: row.created_at,
      readAt: row.read_at
    }));

    console.log(`📨 Fetching notifications for user ${userId}:`, notifications.map(n => ({ 
      id: n.id, 
      type: n.type, 
      title: n.title, 
      message: n.message, 
      hasTitle: !!n.title,
      hasMessage: !!n.message 
    })));

    res.json({
      notifications,
      unreadCount: parseInt(unreadResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
      total: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(`
      UPDATE user_notifications 
      SET is_read = true, read_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      notification: {
        id: result.rows[0].id.toString(),
        isRead: result.rows[0].is_read,
        readAt: result.rows[0].read_at
      }
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      UPDATE user_notifications 
      SET is_read = true, read_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND is_read = false
      RETURNING COUNT(*)
    `, [userId]);

    res.json({
      success: true,
      updatedCount: result.rowCount
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await pool.query(`
      DELETE FROM user_notifications 
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Get notification settings
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM user_notification_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Create default settings
      const defaultSettings = await pool.query(`
        INSERT INTO user_notification_settings (user_id)
        VALUES ($1)
        RETURNING *
      `, [userId]);

      const settings = defaultSettings.rows[0];
      return res.json({
        emailNotifications: settings.email_notifications,
        pushNotifications: settings.push_notifications,
        chatNotifications: settings.chat_notifications,
        giftNotifications: settings.gift_notifications,
        followNotifications: settings.follow_notifications,
        systemNotifications: settings.system_notifications
      });
    }

    const settings = result.rows[0];
    res.json({
      emailNotifications: settings.email_notifications,
      pushNotifications: settings.push_notifications,
      chatNotifications: settings.chat_notifications,
      giftNotifications: settings.gift_notifications,
      followNotifications: settings.follow_notifications,
      systemNotifications: settings.system_notifications
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({ error: 'Failed to fetch notification settings' });
  }
});

// Update notification settings
router.put('/settings', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      emailNotifications,
      pushNotifications,
      chatNotifications,
      giftNotifications,
      followNotifications,
      systemNotifications
    } = req.body;

    const result = await pool.query(`
      INSERT INTO user_notification_settings (
        user_id, email_notifications, push_notifications, 
        chat_notifications, gift_notifications, follow_notifications, system_notifications
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        email_notifications = EXCLUDED.email_notifications,
        push_notifications = EXCLUDED.push_notifications,
        chat_notifications = EXCLUDED.chat_notifications,
        gift_notifications = EXCLUDED.gift_notifications,
        follow_notifications = EXCLUDED.follow_notifications,
        system_notifications = EXCLUDED.system_notifications,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [userId, emailNotifications, pushNotifications, chatNotifications, giftNotifications, followNotifications, systemNotifications]);

    const settings = result.rows[0];
    res.json({
      success: true,
      settings: {
        emailNotifications: settings.email_notifications,
        pushNotifications: settings.push_notifications,
        chatNotifications: settings.chat_notifications,
        giftNotifications: settings.gift_notifications,
        followNotifications: settings.follow_notifications,
        systemNotifications: settings.system_notifications
      }
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

// Send notification to user (internal function for other routes to use)
router.sendNotification = createNotification;

module.exports = router;
