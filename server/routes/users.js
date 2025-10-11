
const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('./auth');
const notificationRouter = require('./notifications');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Gateway URL for emitting notifications
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8000';

// Search users
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.json([]);
    }

    const result = await pool.query(`
      SELECT id, username, avatar, verified, role, exp, level
      FROM users
      WHERE username ILIKE $1
      LIMIT 10
    `, [`%${query}%`]);

    const searchResults = result.rows.map(user => ({
      id: user.id.toString(),
      name: user.username,
      username: user.username,
      status: 'online',
      lastSeen: 'Active now',
      avatar: user.avatar || user.username?.charAt(0).toUpperCase(),
      level: user.level || 1,
      verified: user.verified,
      role: user.role
    }));

    res.json(searchResults);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile details
router.get('/:userId/profile', async (req, res) => {
  try {
    const { userId } = req.params;

    const isNumeric = /^\d+$/.test(userId);
    let result;

    if (isNumeric) {
      result = await pool.query(`
        SELECT u.id, u.username, u.email, u.bio, u.phone, u.gender, u.birth_date, u.country, u.signature, 
               u.avatar, u.avatar_frame, u.level, u.role, u.verified, u.status, u.is_busy, u.busy_until,
               fi.animation_url as frame_animation_url
        FROM users u
        LEFT JOIN frame_items fi ON u.avatar_frame = fi.image
        WHERE u.id = $1
      `, [userId]);
    } else {
      result = await pool.query(`
        SELECT u.id, u.username, u.email, u.bio, u.phone, u.gender, u.birth_date, u.country, u.signature, 
               u.avatar, u.avatar_frame, u.level, u.role, u.verified, u.status, u.is_busy, u.busy_until,
               fi.animation_url as frame_animation_url
        FROM users u
        LEFT JOIN frame_items fi ON u.avatar_frame = fi.image
        WHERE u.username = $1
      `, [userId]);
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get real followers/following count
    const followersResult = await pool.query(
      'SELECT COUNT(*) FROM user_follows WHERE following_id = $1',
      [user.id]
    );
    const followingResult = await pool.query(
      'SELECT COUNT(*) FROM user_follows WHERE follower_id = $1',
      [user.id]
    );

    const profile = {
      id: user.id.toString(),
      username: user.username,
      bio: user.bio || user.signature || 'tanda tangan: cukup tau aj',
      followers: parseInt(followersResult.rows[0].count),
      following: parseInt(followingResult.rows[0].count),
      avatar: user.avatar,
      avatarFrame: user.avatar_frame,
      frameAnimationUrl: user.frame_animation_url || null,
      level: user.level || 1,
      isOnline: Math.random() > 0.5,
      country: user.country || 'ID',
      role: user.role || 'user',
      verified: user.verified || false,
      status: user.status || 'offline',
      isBusy: user.is_busy || false,
      busyUntil: user.busy_until
    };

    res.json(profile);
  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
router.put('/:userId/profile', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { username, bio, phone, gender, birthDate, country, signature } = req.body;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (username !== undefined) {
      updates.push(`username = $${paramCount}`);
      values.push(username);
      paramCount++;
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramCount}`);
      values.push(bio);
      paramCount++;
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount}`);
      values.push(phone);
      paramCount++;
    }
    if (gender !== undefined) {
      updates.push(`gender = $${paramCount}`);
      values.push(gender);
      paramCount++;
    }
    if (birthDate !== undefined) {
      updates.push(`birth_date = $${paramCount}`);
      values.push(birthDate === null || birthDate === '' ? null : birthDate);
      paramCount++;
    }
    if (country !== undefined) {
      updates.push(`country = $${paramCount}`);
      values.push(country);
      paramCount++;
    }
    if (signature !== undefined) {
      updates.push(`signature = $${paramCount}`);
      values.push(signature);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);
    const query = `
      UPDATE users 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING id, username, email, bio, phone, avatar, avatar_frame, gender, birth_date, country, signature, level, role
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result.rows[0];
    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      bio: updatedUser.bio || '',
      phone: updatedUser.phone || '',
      gender: updatedUser.gender || '',
      birthDate: updatedUser.birth_date,
      country: updatedUser.country || '',
      signature: updatedUser.signature || '',
      avatar: updatedUser.avatar,
      avatarFrame: updatedUser.avatar_frame,
      level: updatedUser.level || 1,
      role: updatedUser.role || 'user'
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Follow/Unfollow user
router.post('/:userId/follow', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { action } = req.body;
    const currentUserId = req.user.id;

    if (!action || !['follow', 'unfollow'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "follow" or "unfollow".' });
    }

    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (currentUserId.toString() === userId.toString()) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    await pool.query('BEGIN');

    try {
      if (action === 'follow') {
        await pool.query(`
          INSERT INTO user_follows (follower_id, following_id, created_at) 
          VALUES ($1, $2, NOW()) 
          ON CONFLICT (follower_id, following_id) DO NOTHING
        `, [currentUserId, userId]);
      } else {
        await pool.query(`
          DELETE FROM user_follows 
          WHERE follower_id = $1 AND following_id = $2
        `, [currentUserId, userId]);
      }

      const followersResult = await pool.query(
        'SELECT COUNT(*) FROM user_follows WHERE following_id = $1',
        [userId]
      );

      const followingResult = await pool.query(
        'SELECT COUNT(*) FROM user_follows WHERE follower_id = $1',
        [currentUserId]
      );

      await pool.query('COMMIT');

      // Create notification for follow action
      if (action === 'follow') {
        const followerUsername = req.user.username;
        const notification = await notificationRouter.sendNotification(
          userId,
          'follow',
          'New Follower',
          `${followerUsername} has followed you`,
          { followerId: currentUserId, followerUsername }
        );

        // Emit real-time notification via gateway
        if (notification) {
          try {
            await fetch(`${GATEWAY_URL}/emit-notification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: userId,
                notification: {
                  id: notification.id,
                  type: 'follow',
                  title: 'New Follower',
                  message: `${followerUsername} has followed you`,
                  data: { followerId: currentUserId, followerUsername },
                  isRead: false,
                  createdAt: notification.created_at
                }
              })
            });
            console.log(`📢 Follow notification sent to user ${userId}`);
          } catch (error) {
            console.error('Error emitting notification:', error);
          }
        }
      }

      res.json({
        success: true,
        action: action,
        message: action === 'follow' ? 'User followed successfully' : 'User unfollowed successfully',
        followers: parseInt(followersResult.rows[0].count),
        following: parseInt(followingResult.rows[0].count)
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error updating follow status:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Check follow status
router.get('/:userId/follow-status', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const result = await pool.query(
      'SELECT COUNT(*) FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [currentUserId, userId]
    );

    const isFollowing = parseInt(result.rows[0].count) > 0;
    res.json({ isFollowing });
  } catch (error) {
    console.error('Error checking follow status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user status
router.get('/:userId/status', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      'SELECT status, is_busy, busy_until FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    let status = user.status || 'offline';

    // Check if user is busy and busy time hasn't expired
    if (user.is_busy && user.busy_until && new Date(user.busy_until) > new Date()) {
      status = 'busy';
    } else if (user.is_busy && !user.busy_until) {
      status = 'busy';
    }

    res.json({ 
      status: status,
      isBusy: user.is_busy || false,
      busyUntil: user.busy_until 
    });
  } catch (error) {
    console.error('Error getting user status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user status (online/away/busy) - NOT for offline (use logout endpoint)
// NOTE: This endpoint is kept for compatibility but clients should prefer using 
// the socket 'update-status' event which both persists AND broadcasts in one atomic operation.
// This REST endpoint only persists - client must emit socket event for broadcasts.
router.post('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.body;

    // Validate status
    const validStatuses = ['online', 'away', 'busy'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be: online, away, or busy' });
    }

    // Update status in database
    await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2',
      [status, userId]
    );

    // Get username for logging
    const userResult = await pool.query(
      'SELECT username FROM users WHERE id = $1',
      [userId]
    );
    const username = userResult.rows[0].username;

    console.log(`✅ [REST] Updated status to ${status.toUpperCase()} for user ${username} (ID: ${userId})`);

    res.json({ 
      success: true, 
      status: status,
      message: `Status updated to ${status}. Emit 'update-status' socket event to broadcast to rooms.` 
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's family badge info
router.get('/:userId/family-badge', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
      SELECT f.name as family_name, f.level as family_level, fm.family_role, fm.joined_at
      FROM families f
      JOIN family_members fm ON f.id = fm.family_id
      WHERE fm.user_id = $1 AND fm.is_active = true
      ORDER BY fm.joined_at DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.json(null);
    }

    const familyBadge = result.rows[0];
    res.json({
      familyName: familyBadge.family_name,
      familyLevel: familyBadge.family_level || 1,
      familyRole: familyBadge.family_role,
      joinedAt: familyBadge.joined_at
    });
  } catch (error) {
    console.error('Error fetching user family badge:', error);
    res.status(500).json({ error: 'Failed to fetch family badge' });
  }
});

// Update user status
router.put('/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.user.id;

    if (!['online', 'offline', 'away', 'busy'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      'UPDATE users SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING status',
      [status, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`User ${userId} status updated to: ${status}`);
    res.json({ 
      success: true, 
      status: result.rows[0].status,
      message: `Status updated to ${status}` 
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get merchants and mentors list
router.get('/merchants-mentors', authenticateToken, async (req, res) => {
  try {
    console.log('📋 Fetching merchants and mentors...');
    
    const merchantsResult = await pool.query(`
      SELECT id, username, role, level, avatar, status
      FROM users
      WHERE role = 'merchant'
      ORDER BY username ASC
    `);

    const mentorsResult = await pool.query(`
      SELECT id, username, role, level, avatar, status
      FROM users
      WHERE role = 'mentor'
      ORDER BY username ASC
    `);

    console.log(`✅ Found ${merchantsResult.rows.length} merchants and ${mentorsResult.rows.length} mentors`);

    res.json({
      merchants: merchantsResult.rows.map(user => ({
        id: user.id,
        username: user.username,
        role: user.role,
        level: user.level || 1,
        avatar: user.avatar,
        status: user.status || 'offline'
      })),
      mentors: mentorsResult.rows.map(user => ({
        id: user.id,
        username: user.username,
        role: user.role,
        level: user.level || 1,
        avatar: user.avatar,
        status: user.status || 'offline'
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching merchants and mentors:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
