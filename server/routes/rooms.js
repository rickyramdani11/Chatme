
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
      SELECT id, name, description, managed_by, type, members, max_members, created_by, created_at
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
      createdAt: row.created_at
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

// Get rooms endpoint
router.get('/', (req, res) => {
  try {
    console.log('GET /api/rooms -', new Date().toISOString());
    console.log('Headers:', req.headers);
    res.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create room endpoint
router.post('/', async (req, res) => {
  console.log('POST /api/rooms -', new Date().toISOString());
  console.log('Headers:', req.headers);
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
  const validCapacities = [25, 40, 80];
  if (!validCapacities.includes(maxMembers)) {
    return res.status(400).json({
      error: 'Invalid capacity. Must be 25, 40, or 80'
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
router.delete('/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;

    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex === -1) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const deletedRoom = rooms.splice(roomIndex, 1)[0];
    console.log('Room deleted:', deletedRoom.name);

    // Clean up participants for the deleted room
    delete roomParticipants[roomId];

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add participant to room
router.post('/:roomId/participants', (req, res) => {
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

      // Update room member count
      const roomIndex = rooms.findIndex(r => r.id === roomId);
      if (roomIndex !== -1) {
        rooms[roomIndex].members = roomParticipants[roomId].length;
      }
    }

    res.status(201).json(participant);
  } catch (error) {
    console.error('Error adding participant to room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get room participants
router.get('/:roomId/participants', (req, res) => {
  try {
    const { roomId } = req.params;
    console.log('=== GET ROOM PARTICIPANTS REQUEST ===');
    console.log('Room ID:', roomId);

    // Return participants from the roomParticipants structure
    const participants = roomParticipants[roomId] || [];
    res.json(participants);
  } catch (error) {
    console.error('Error fetching room participants:', error);
    res.status(500).json({ error: 'Internal server error' });
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

// Initialize rooms on module load
loadRoomsFromDatabase();

module.exports = router;
