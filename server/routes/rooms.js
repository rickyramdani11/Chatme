
const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('./auth');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize rooms array and room participants (these should be moved to database in the future)
let rooms = [];
let roomParticipants = {};

// Load existing rooms from database on startup
const loadRoomsFromDatabase = async () => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, managed_by, type, members, max_members, created_by, created_at, broadcast_message
      FROM rooms 
      ORDER BY created_at ASC
    `);

    rooms = result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      managedBy: row.managed_by,
      type: row.type,
      members: row.members || 0,
      maxMembers: row.max_members || 25,
      createdBy: row.created_by,
      createdAt: row.created_at,
      broadcastMessage: row.broadcast_message
    }));

    console.log(`Loaded ${rooms.length} rooms from database`);

    // Initialize room participants for each room
    rooms.forEach(room => {
      roomParticipants[room.id] = [];
    });

  } catch (loadError) {
    console.error('Error loading rooms from database:', loadError);
    rooms = []; // Initialize empty array on error
  }
};

// Function to generate room description
const generateRoomDescription = (roomName, creatorUsername) => {
  return `${roomName} - Welcome to merchant official chatroom. This room is managed by ${creatorUsername}`;
};

// Get rooms endpoint - Query database directly for fresh data
router.get('/', async (req, res) => {
  try {
    console.log('GET /api/rooms -', new Date().toISOString());
    console.log('Headers:', {
      authorization: req.headers.authorization ? 'Present (masked)' : 'Missing',
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'] ? 'Present' : 'Missing'
    });
    
    // Query database for real-time room data (not in-memory cache)
    const result = await pool.query(`
      SELECT id, name, description, managed_by, type, members, max_members, created_by, created_at, broadcast_message
      FROM rooms 
      ORDER BY created_at ASC
    `);

    const freshRooms = result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      managedBy: row.managed_by,
      type: row.type,
      members: row.members || 0,
      maxMembers: row.max_members || 25,
      createdBy: row.created_by,
      createdAt: row.created_at,
      broadcastMessage: row.broadcast_message
    }));

    res.json(freshRooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create room endpoint
router.post('/', async (req, res) => {
  console.log('POST /api/rooms -', new Date().toISOString());
  console.log('Headers:', {
    authorization: req.headers.authorization ? 'Present (masked)' : 'Missing',
    'content-type': req.headers['content-type'],
    'user-agent': req.headers['user-agent'] ? 'Present' : 'Missing'
  });
  console.log('Body:', req.body);

  const { name, description, type, maxMembers, createdBy } = req.body;
  const creatorUsername = createdBy || 'admin';

  // Validate required fields
  if (!name || !description) {
    return res.status(400).json({
      error: 'Room name and description are required'
    });
  }

  // Validate capacity
  if (!maxMembers || typeof maxMembers !== 'number' || maxMembers < 1 || maxMembers > 9999) {
    return res.status(400).json({
      error: 'Invalid capacity. Must be between 1 and 9999'
    });
  }

  try {
    // Check if room name already exists (case-insensitive)
    const existingRoom = await pool.query(
      'SELECT id, name FROM rooms WHERE LOWER(name) = LOWER($1)',
      [name.trim()]
    );

    if (existingRoom.rows.length > 0) {
      return res.status(400).json({
        error: `Room name "${name.trim()}" already exists. Please choose a different name.`
      });
    }

    // Save room to database
    const result = await pool.query(`
      INSERT INTO rooms (name, description, managed_by, type, members, max_members, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name.trim(), description.trim(), creatorUsername, type || 'room', 1, maxMembers, creatorUsername]);

    const dbRoom = result.rows[0];

    const newRoom = {
      id: dbRoom.id.toString(),
      name: dbRoom.name,
      description: dbRoom.description,
      managedBy: dbRoom.managed_by,
      type: dbRoom.type,
      members: dbRoom.members,
      maxMembers: dbRoom.max_members,
      createdBy: dbRoom.created_by,
      createdAt: dbRoom.created_at
    };

    // Add to in-memory rooms array
    rooms.push(newRoom);
    console.log('Room created and saved to database:', newRoom);
    res.json(newRoom);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Join room endpoint
router.post('/:roomId/join', (req, res) => {
  try {
    const { roomId } = req.params;
    const { password } = req.body;

    console.log(`Join room request for ID: ${roomId}`);
    console.log('Available rooms:', rooms.map(r => ({ id: r.id, name: r.name })));

    const room = rooms.find(r => r.id === roomId);
    if (!room) {
      console.log(`Room ${roomId} not found. Available rooms:`, rooms.map(r => r.id));
      return res.status(404).json({ error: `Room with ID ${roomId} not found` });
    }

    // Check if room is locked and requires password
    if (room.type === 'locked' && global.roomLocks && global.roomLocks[roomId]) {
      if (!password || password !== global.roomLocks[roomId]) {
        return res.status(403).json({
          error: 'Room is password protected',
          requiresPassword: true,
          message: 'This room is locked. Please enter the correct password to join.'
        });
      }
    }

    // Check if room is at capacity
    if (room.members >= room.maxMembers) {
      return res.status(400).json({ error: 'Room is at maximum capacity' });
    }

    console.log(`User attempting to join room: ${room.name} (ID: ${room.id})`);

    res.json({
      message: 'Successfully joined room',
      room: room
    });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete room endpoint
router.delete('/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex === -1) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const deletedRoom = rooms.splice(roomIndex, 1)[0];
    
    // Delete from database
    await pool.query('DELETE FROM rooms WHERE id = $1', [roomId]);
    console.log('Room deleted from database and memory:', deletedRoom.name);

    // Clean up participants for the deleted room
    delete roomParticipants[roomId];

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add participant to room
router.post('/:roomId/participants', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username, role = 'user' } = req.body;

    console.log('=== ADD PARTICIPANT TO ROOM REQUEST ===');
    console.log('Room ID:', roomId);
    console.log('Username:', username);
    console.log('Role:', role);

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Initialize participants array for room if not exists
    if (!roomParticipants[roomId]) {
      roomParticipants[roomId] = [];
    }

    // Check if user is already a participant
    let participant = roomParticipants[roomId].find(p => p.username === username);
    if (participant) {
      // Update existing participant
      participant.role = role;
      participant.isOnline = true;
      participant.lastSeen = new Date().toISOString();
      console.log('Updated existing participant:', username);
    } else {
      // Add new participant
      participant = {
        id: Date.now().toString(),
        username,
        role,
        isOnline: true,
        joinedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      roomParticipants[roomId].push(participant);
      console.log('Added new participant:', username);

      // Update room member count in memory AND database
      const roomIndex = rooms.findIndex(r => r.id === roomId);
      if (roomIndex !== -1) {
        const newMemberCount = roomParticipants[roomId].length;
        rooms[roomIndex].members = newMemberCount;
        
        // Update database
        await pool.query('UPDATE rooms SET members = $1 WHERE id = $2', [newMemberCount, roomId]);
        console.log(`Updated room ${roomId} member count in database: ${newMemberCount}`);
      }
    }

    res.status(201).json(participant);
  } catch (error) {
    console.error('Error adding participant to room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get room participants (fetch from socket gateway)
router.get('/:roomId/participants', async (req, res) => {
  try {
    const { roomId } = req.params;
    console.log('=== GET ROOM PARTICIPANTS REQUEST (from rooms router) ===');
    console.log('Room ID:', roomId);

    // Fetch participants from socket gateway
    const GATEWAY_PORT = process.env.GATEWAY_PORT || 8000;
    const gatewayUrl = `http://localhost:${GATEWAY_PORT}/gateway/rooms/${roomId}/participants`;
    console.log('Fetching from gateway URL:', gatewayUrl);
    
    const response = await fetch(gatewayUrl);
    console.log('Gateway response status:', response.status);
    
    if (!response.ok) {
      console.error('Gateway response not OK:', response.status, response.statusText);
      return res.json([]); // Return empty array instead of error for compatibility
    }
    
    const participants = await response.json();
    console.log(`✅ Fetched ${participants.length} participants from gateway for room ${roomId}`);
    res.json(participants);
  } catch (error) {
    console.error('❌ Error fetching room participants:', error);
    console.error('Error stack:', error.stack);
    res.json([]); // Return empty array on error for compatibility
  }
});

// Get message history with pagination
router.get('/:roomId/messages/history', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { limit = 50, before, after } = req.query;

    let query = `
      SELECT
        cm.*,
        u.avatar,
        u.verified
      FROM chat_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.room_id = $1
    `;

    let params = [roomId];
    let paramCount = 1;

    if (before) {
      paramCount++;
      query += ` AND cm.created_at < $${paramCount}`;
      params.push(before);
    }

    if (after) {
      paramCount++;
      query += ` AND cm.created_at > $${paramCount}`;
      params.push(after);
    }

    query += ` ORDER BY cm.created_at DESC LIMIT $${paramCount + 1}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    const messages = result.rows.map(row => ({
      id: row.id.toString(),
      sender: row.username,
      content: row.content,
      timestamp: row.created_at,
      roomId: row.room_id,
      role: row.user_role,
      level: row.user_level,
      type: row.message_type,
      userRole: row.user_role,
      media: row.media_data ? JSON.parse(row.media_data) : null,
      avatar: row.avatar,
      verified: row.verified,
      isPrivate: row.is_private
    }));

    res.json({
      messages: messages.reverse(),
      hasMore: messages.length === parseInt(limit),
      oldest: messages.length > 0 ? messages[0].timestamp : null,
      newest: messages.length > 0 ? messages[messages.length - 1].timestamp : null
    });
  } catch (error) {
    console.error('Error fetching message history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get room moderators
router.get('/:roomId/moderators', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const result = await pool.query(`
      SELECT rm.*, u.username, u.role as user_role
      FROM room_moderators rm
      LEFT JOIN users u ON rm.user_id = u.id
      WHERE rm.room_id = $1 AND rm.is_active = true
      ORDER BY rm.assigned_at DESC
    `, [roomId]);

    const moderators = result.rows.map(row => ({
      id: row.id.toString(),
      username: row.username,
      role: row.role,
      assigned_by_username: row.assigned_by_username,
      assigned_at: row.assigned_at,
      can_ban: row.can_ban,
      can_kick: row.can_kick,
      can_mute: row.can_mute
    }));

    res.json(moderators);
  } catch (error) {
    console.error('Error fetching room moderators:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add room moderator
router.post('/:roomId/moderators', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username, can_ban = true, can_kick = true, can_mute = true } = req.body;
    const currentUserId = req.user.userId;

    // Check if current user can add moderators
    const hasPermission = await checkRoomPermission(currentUserId, roomId, 'manage_moderators');
    if (!hasPermission) {
      return res.status(403).json({ error: 'You do not have permission to add moderators' });
    }

    // Get target user
    const userResult = await pool.query('SELECT id, username FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];

    // Check if user is already a moderator
    const existingMod = await pool.query(`
      SELECT id FROM room_moderators 
      WHERE room_id = $1 AND user_id = $2 AND is_active = true
    `, [roomId, targetUser.id]);

    if (existingMod.rows.length > 0) {
      return res.status(400).json({ error: 'User is already a moderator' });
    }

    // Get current user info
    const currentUserResult = await pool.query('SELECT username FROM users WHERE id = $1', [currentUserId]);
    const currentUsername = currentUserResult.rows[0]?.username || 'admin';

    // Add moderator
    const result = await pool.query(`
      INSERT INTO room_moderators (
        room_id, user_id, username, assigned_by_id, assigned_by_username,
        can_ban, can_kick, can_mute
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [roomId, targetUser.id, targetUser.username, currentUserId, currentUsername, can_ban, can_kick, can_mute]);

    res.status(201).json({
      id: result.rows[0].id.toString(),
      username: targetUser.username,
      assigned_by_username: currentUsername,
      assigned_at: result.rows[0].assigned_at,
      can_ban,
      can_kick,
      can_mute
    });

  } catch (error) {
    console.error('Error adding room moderator:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove room moderator
router.delete('/:roomId/moderators/:moderatorIdentifier', authenticateToken, async (req, res) => {
  try {
    const { roomId, moderatorIdentifier } = req.params;
    const currentUserId = req.user.userId;

    // Check if current user can remove moderators
    const hasPermission = await checkRoomPermission(currentUserId, roomId, 'manage_moderators');
    if (!hasPermission) {
      return res.status(403).json({ error: 'You do not have permission to remove moderators' });
    }

    // Remove moderator by username (client sends username, not ID)
    const result = await pool.query(`
      UPDATE room_moderators 
      SET is_active = false 
      WHERE username = $1 AND room_id = $2 AND is_active = true
      RETURNING username
    `, [moderatorIdentifier, roomId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Moderator not found' });
    }

    res.json({ message: 'Moderator removed successfully' });

  } catch (error) {
    console.error('Error removing room moderator:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get banned users
router.get('/:roomId/banned', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM room_banned_users 
      WHERE room_id = $1 AND is_active = true
      ORDER BY banned_at DESC
    `, [roomId]);

    const bannedUsers = result.rows.map(row => ({
      id: row.id.toString(),
      banned_username: row.banned_username,
      banned_by_username: row.banned_by_username,
      ban_reason: row.ban_reason,
      banned_at: row.banned_at,
      expires_at: row.expires_at
    }));

    res.json(bannedUsers);
  } catch (error) {
    console.error('Error fetching banned users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unban user
router.delete('/:roomId/banned/:bannedId', authenticateToken, async (req, res) => {
  try {
    const { roomId, bannedId } = req.params;
    const currentUserId = req.user.userId;

    // Check if current user can unban users
    const hasPermission = await checkRoomPermission(currentUserId, roomId, 'ban');
    if (!hasPermission) {
      return res.status(403).json({ error: 'You do not have permission to unban users' });
    }

    // Unban user
    const result = await pool.query(`
      UPDATE room_banned_users 
      SET is_active = false 
      WHERE id = $1 AND room_id = $2
      RETURNING banned_username
    `, [bannedId, roomId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Banned user not found' });
    }

    res.json({ message: 'User unbanned successfully' });

  } catch (error) {
    console.error('Error unbanning user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to check room permissions
const checkRoomPermission = async (userId, roomId, action) => {
  try {
    // Get user role
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) return false;

    const userRole = userResult.rows[0].role;

    // Global admins can do anything
    if (userRole === 'admin') return true;

    // Check if user is room owner
    const roomResult = await pool.query('SELECT created_by FROM rooms WHERE id = $1', [roomId]);
    if (roomResult.rows.length > 0) {
      const roomOwner = roomResult.rows[0].created_by;
      const userNameResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
      if (userNameResult.rows.length > 0 && userNameResult.rows[0].username === roomOwner) {
        return true; // Room owner has all permissions
      }
    }

    // Check if user is moderator with specific permissions
    const modResult = await pool.query(`
      SELECT * FROM room_moderators 
      WHERE room_id = $1 AND user_id = $2 AND is_active = true
    `, [roomId, userId]);

    if (modResult.rows.length > 0) {
      const moderator = modResult.rows[0];
      switch (action) {
        case 'ban':
          return moderator.can_ban;
        case 'kick':
          return moderator.can_kick;
        case 'mute':
          return moderator.can_mute;
        case 'manage_moderators':
          return false; // Only room owners and admins can manage moderators
        default:
          return false;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking room permission:', error);
    return false;
  }
};

// Initialize rooms on module load
loadRoomsFromDatabase();

module.exports = router;
