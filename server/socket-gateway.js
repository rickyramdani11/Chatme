
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import pkg from 'pg';
const { Pool } = pkg;
import crypto from 'crypto';

// Import LowCard bot
import { processLowCardCommand } from './games/lowcard.js';

// Import ChatMe AI Bot
import { processBotMessage, BOT_USERNAME } from './bot/chatme-bot.js';

const app = express();
const server = createServer(app);

// Socket.IO Gateway Configuration
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e6
});

const GATEWAY_PORT = process.env.GATEWAY_PORT || 8000;
// Generate a secure random secret if JWT_SECRET is not provided
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('⚠️  WARNING: Using default JWT secret. Set JWT_SECRET environment variable for production!');
  return 'your_super_secret_key_for_development_only';
})();
const MAIN_API_URL = process.env.MAIN_API_URL || 'http://0.0.0.0:5000';

// Daily.co configuration
const DAILY_API_KEY = process.env.DAILY_API_KEY || '';
const DAILY_DOMAIN = process.env.DAILY_DOMAIN || '';

// Function to create Daily.co room
async function createDailyRoom(roomName) {
  if (!DAILY_API_KEY) {
    console.error('❌ DAILY_API_KEY not configured');
    throw new Error('Daily.co API key not configured');
  }

  try {
    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          exp: Math.floor(Date.now() / 1000) + 86400, // Expires in 24 hours
          max_participants: 2, // 1v1 calls only
          enable_chat: false,
          enable_screenshare: false
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Failed to create Daily.co room:', error);
      throw new Error(`Failed to create Daily.co room: ${error.error || 'Unknown error'}`);
    }

    const room = await response.json();
    console.log('✅ Created Daily.co room:', room.url);
    return room;
  } catch (error) {
    console.error('❌ Error creating Daily.co room:', error);
    throw error;
  }
}

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Gateway: Error connecting to database:', err);
  } else {
    console.log('Gateway: Successfully connected to PostgreSQL database');
    release();
  }
});

// Initialize room security tables
const initRoomSecurityTables = async () => {
  try {
    // Table for banned users per room
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_banned_users (
        id BIGSERIAL PRIMARY KEY,
        room_id VARCHAR(50) NOT NULL,
        banned_user_id INTEGER,
        banned_username VARCHAR(50) NOT NULL,
        banned_by_id INTEGER NOT NULL,
        banned_by_username VARCHAR(50) NOT NULL,
        ban_reason TEXT,
        banned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        UNIQUE(room_id, banned_username)
      )
    `);

    // Table for room locks and passwords
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_security (
        room_id VARCHAR(50) PRIMARY KEY,
        is_locked BOOLEAN DEFAULT false,
        password_hash TEXT,
        locked_by_id INTEGER,
        locked_by_username VARCHAR(50),
        locked_at TIMESTAMP,
        max_members INTEGER DEFAULT 100,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Table for room moderators and permissions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_moderators (
        id BIGSERIAL PRIMARY KEY,
        room_id VARCHAR(50) NOT NULL,
        user_id INTEGER NOT NULL,
        username VARCHAR(50) NOT NULL,
        role VARCHAR(20) DEFAULT 'moderator',
        assigned_by_id INTEGER,
        assigned_by_username VARCHAR(50),
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        can_ban BOOLEAN DEFAULT true,
        can_kick BOOLEAN DEFAULT true,
        can_mute BOOLEAN DEFAULT true,
        can_lock_room BOOLEAN DEFAULT false,
        UNIQUE(room_id, user_id)
      )
    `);

    // Add indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_room_moderators_room_id ON room_moderators(room_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_room_banned_users_room_id ON room_banned_users(room_id);
    `);

    console.log('✅ Room security tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing room security tables:', error);
  }
};

// Create private_messages table if it doesn't exist
const initPrivateMessagesTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS private_messages (
        id SERIAL PRIMARY KEY,
        chat_id VARCHAR(255) NOT NULL,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_read BOOLEAN DEFAULT false
      )
    `);

    // Add is_read column if it doesn't exist (for existing databases)
    try {
      await pool.query(`
        ALTER TABLE private_messages 
        ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false
      `);
    } catch (error) {
      // Column might already exist, ignore error
      console.log('is_read column might already exist:', error.message);
    }
  } catch (error) {
    console.error('Error initializing private messages table:', error);
  }
};

// Create bot_room_members table if it doesn't exist
const initBotRoomMembersTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_room_members (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(50) NOT NULL,
        bot_user_id INTEGER NOT NULL,
        bot_username VARCHAR(50) NOT NULL,
        added_by_id INTEGER NOT NULL,
        added_by_username VARCHAR(50) NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        UNIQUE(room_id, bot_user_id)
      )
    `);

    // Add index for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_bot_room_members_room_id ON bot_room_members(room_id);
    `);

    console.log('✅ Bot room members table initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing bot room members table:', error);
  }
};

// Initialize tables on startup
initRoomSecurityTables();
initPrivateMessagesTable();
initBotRoomMembersTable();

// Server-side permission verification functions
const hasPermission = async (userId, username, roomId, action) => {
  try {
    // Get user's role from database (authoritative source)
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return false;
    }

    const userRole = userResult.rows[0].role;

    // Global admins can do anything
    if (userRole === 'admin') {
      return true;
    }

    // Check if user is room moderator
    const moderatorResult = await pool.query(`
      SELECT * FROM room_moderators 
      WHERE room_id = $1 AND user_id = $2 AND is_active = true
    `, [roomId, userId]);

    if (moderatorResult.rows.length > 0) {
      const moderator = moderatorResult.rows[0];

      // Check specific permissions for this moderator
      switch (action) {
        case 'ban':
          return moderator.can_ban;
        case 'kick':
          return moderator.can_kick;
        case 'mute':
          return moderator.can_mute;
        case 'lock_room':
          return moderator.can_lock_room;
        case 'add_bot':
        case 'remove_bot':
          return true; // Moderators can manage bots
        default:
          return false;
      }
    }

    // Check if user is room owner (created the room)
    const roomResult = await pool.query('SELECT created_by FROM rooms WHERE id = $1', [roomId]);
    if (roomResult.rows.length > 0 && roomResult.rows[0].created_by === username) {
      return true; // Room owners have all permissions
    }

    return false; // Regular users have no moderation permissions
  } catch (error) {
    console.error('Error checking permissions:', error);
    return false;
  }
};

const isUserBanned = async (roomId, userId, username) => {
  try {
    const result = await pool.query(`
      SELECT * FROM room_banned_users 
      WHERE room_id = $1 AND (banned_user_id = $2 OR banned_username = $3) 
      AND is_active = true 
      AND (expires_at IS NULL OR expires_at > NOW())
    `, [roomId, userId, username]);

    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking ban status:', error);
    return false;
  }
};

const isRoomLocked = async (roomId) => {
  try {
    const result = await pool.query('SELECT is_locked, password_hash FROM room_security WHERE room_id = $1', [roomId]);

    if (result.rows.length === 0) {
      return { locked: false, passwordRequired: false };
    }

    const roomSecurity = result.rows[0];
    return {
      locked: roomSecurity.is_locked,
      passwordRequired: roomSecurity.is_locked && roomSecurity.password_hash !== null
    };
  } catch (error) {
    console.error('Error checking room lock status:', error);
    return { locked: false, passwordRequired: false };
  }
};

const verifyRoomPassword = async (roomId, password) => {
  try {
    const bcrypt = await import('bcrypt');

    const result = await pool.query('SELECT password_hash FROM room_security WHERE room_id = $1', [roomId]);

    if (result.rows.length === 0 || !result.rows[0].password_hash) {
      return false;
    }

    return await bcrypt.default.compare(password, result.rows[0].password_hash);
  } catch (error) {
    console.error('Error verifying room password:', error);
    return false;
  }
};

// Ban management functions
const addBanToDatabase = async (roomId, bannedUserId, bannedUsername, bannedById, bannedByUsername, reason = null, expiresInHours = null) => {
  try {
    let expiresAt = null;
    if (expiresInHours) {
      expiresAt = new Date(Date.now() + (expiresInHours * 60 * 60 * 1000));
    }

    const result = await pool.query(`
      INSERT INTO room_banned_users (
        room_id, banned_user_id, banned_username, banned_by_id, banned_by_username, 
        ban_reason, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (room_id, banned_username) 
      DO UPDATE SET 
        banned_by_id = $4,
        banned_by_username = $5,
        ban_reason = $6,
        expires_at = $7,
        banned_at = NOW(),
        is_active = true
      RETURNING *
    `, [roomId, bannedUserId, bannedUsername, bannedById, bannedByUsername, reason, expiresAt]);

    console.log(`✅ User ${bannedUsername} banned from room ${roomId} by ${bannedByUsername}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error adding ban to database:', error);
    return null;
  }
};

const removeBanFromDatabase = async (roomId, unbannedUsername, unbannedById, unbannedByUsername) => {
  try {
    const result = await pool.query(`
      UPDATE room_banned_users 
      SET is_active = false 
      WHERE room_id = $1 AND banned_username = $2 AND is_active = true
      RETURNING *
    `, [roomId, unbannedUsername]);

    if (result.rows.length > 0) {
      console.log(`✅ User ${unbannedUsername} unbanned from room ${roomId} by ${unbannedByUsername}`);
      return result.rows[0];
    } else {
      console.log(`⚠️  No active ban found for ${unbannedUsername} in room ${roomId}`);
      return null;
    }
  } catch (error) {
    console.error('Error removing ban from database:', error);
    return null;
  }
};

const cleanupExpiredBans = async () => {
  try {
    const result = await pool.query(`
      UPDATE room_banned_users 
      SET is_active = false 
      WHERE expires_at IS NOT NULL AND expires_at <= NOW() AND is_active = true
      RETURNING room_id, banned_username
    `);

    if (result.rows.length > 0) {
      console.log(`✅ Cleaned up ${result.rows.length} expired bans`);
      return result.rows;
    }
    return [];
  } catch (error) {
    console.error('Error cleaning up expired bans:', error);
    return [];
  }
};

// Run cleanup every hour
setInterval(cleanupExpiredBans, 60 * 60 * 1000);

// Room lock management functions
const lockRoom = async (roomId, lockingUserId, lockingUsername, password = null) => {
  try {
    const bcrypt = await import('bcrypt');
    let passwordHash = null;

    if (password) {
      passwordHash = await bcrypt.default.hash(password, 10);
    }

    const result = await pool.query(`
      INSERT INTO room_security (room_id, is_locked, password_hash, locked_by_id, locked_by_username, locked_at)
      VALUES ($1, true, $2, $3, $4, NOW())
      ON CONFLICT (room_id) 
      DO UPDATE SET 
        is_locked = true,
        password_hash = $2,
        locked_by_id = $3,
        locked_by_username = $4,
        locked_at = NOW(),
        updated_at = NOW()
      RETURNING *
    `, [roomId, passwordHash, lockingUserId, lockingUsername]);

    console.log(`🔒 Room ${roomId} locked by ${lockingUsername}${password ? ' with password' : ''}`);
    return result.rows[0];
  } catch (error) {
    console.error('Error locking room:', error);
    return null;
  }
};

const unlockRoom = async (roomId, unlockingUserId, unlockingUsername) => {
  try {
    const result = await pool.query(`
      UPDATE room_security 
      SET is_locked = false, password_hash = null, updated_at = NOW()
      WHERE room_id = $1
      RETURNING *
    `, [roomId]);

    if (result.rows.length > 0) {
      console.log(`🔓 Room ${roomId} unlocked by ${unlockingUsername}`);
      return result.rows[0];
    } else {
      console.log(`⚠️  Room ${roomId} was not locked`);
      return null;
    }
  } catch (error) {
    console.error('Error unlocking room:', error);
    return null;
  }
};

// Function to save chat message to database
const saveChatMessage = async (roomId, username, content, media = null, messageType = 'message', userRole = 'user', userLevel = 1, isPrivate = false) => {
  try {
    // Get user ID by username
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;

    const result = await pool.query(`
      INSERT INTO chat_messages (
        room_id, user_id, username, content, media_data,
        message_type, user_role, user_level, is_private
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      roomId,
      userId,
      username,
      content,
      media ? JSON.stringify(media) : null,
      messageType,
      userRole,
      userLevel,
      isPrivate
    ]);

    console.log(`💾 Gateway: Message saved to database from ${username} in room ${roomId}`);
    return result.rows[0];
  } catch (error) {
    console.error('Gateway: Error saving chat message:', error);
    return null;
  }
};

// Middleware
app.use(cors());
app.use(express.json());

// Simple health check for gateway
app.get('/health', (req, res) => {
  res.json({ 
    message: 'Socket Gateway is running!',
    port: GATEWAY_PORT,
    timestamp: new Date().toISOString()
  });
});

// HTTP endpoint to emit notifications from API server
app.post('/emit-notification', express.json(), (req, res) => {
  try {
    const { userId, notification } = req.body;
    
    if (!userId || !notification) {
      return res.status(400).json({ error: 'userId and notification are required' });
    }

    // Emit notification to user's personal room
    const personalRoom = `user_${userId}`;
    io.to(personalRoom).emit('new_notification', notification);
    
    console.log(`🔔 Notification emitted to ${personalRoom}:`, notification.type);
    res.json({ success: true, message: 'Notification emitted successfully' });
  } catch (error) {
    console.error('Error emitting notification:', error);
    res.status(500).json({ error: 'Failed to emit notification' });
  }
});

// HTTP endpoint to notify user about new private chat
app.post('/gateway/notify-private-chat', express.json(), (req, res) => {
  try {
    const { chatId, recipientId, recipientUsername, initiatorId, initiatorUsername, isNewChat } = req.body;
    
    if (!chatId || !recipientId || !initiatorUsername) {
      return res.status(400).json({ error: 'chatId, recipientId, and initiatorUsername are required' });
    }

    // Send notification to recipient's personal room to open private chat tab
    const personalRoom = `user_${recipientId}`;
    const notification = {
      type: 'private_chat',
      chatId,
      fromUserId: initiatorId,
      fromUsername: initiatorUsername,
      message: `${initiatorUsername} ${isNewChat ? 'started' : 'sent you'} a private chat`,
      timestamp: new Date().toISOString()
    };

    io.to(personalRoom).emit('open_private_chat', notification);
    
    console.log(`📨 Private chat notification sent to ${recipientUsername} (room: ${personalRoom})`);
    console.log(`   Chat ID: ${chatId}, Initiator: ${initiatorUsername}`);
    res.json({ success: true, message: 'Private chat notification sent' });
  } catch (error) {
    console.error('Error sending private chat notification:', error);
    res.status(500).json({ error: 'Failed to send private chat notification' });
  }
});

// HTTP endpoint to get room participants for API server
app.get('/gateway/rooms/:roomId/participants', (req, res) => {
  try {
    const { roomId } = req.params;
    const participants = roomParticipants[roomId] || [];
    res.json(participants);
  } catch (error) {
    console.error('Error fetching room participants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// In-memory storage for active rooms and participants
const roomParticipants = {}; // { roomId: [ { id, username, role, socketId }, ... ] }
const connectedUsers = new Map(); // socketId -> { userId, username, roomId }
// Track recent leave broadcasts to prevent duplicates (key: "userId_roomId", value: timestamp)
const recentLeaveBroadcasts = new Map();
// Track announced joins per user per room (key: "userId_roomId", value: timestamp) - GLOBAL tracking
const announcedJoins = new Map();
// Removed global joinedRoomsRef - caused join suppression bugs across users

// Debounce system for join/leave broadcasts to prevent spam
const pendingBroadcasts = new Map(); // key: "userId_roomId", value: { type: 'join'|'leave', timeout: timeoutId, data: {...} }

// Helper function to schedule debounced join/leave broadcast
function scheduleBroadcast(io, type, userId, roomId, username, role, socket) {
  const key = `${userId}_${roomId}`;
  const DEBOUNCE_DELAY = 2000; // 2 seconds delay
  
  // If there's a pending broadcast of opposite type, cancel it
  const pending = pendingBroadcasts.get(key);
  if (pending) {
    if (pending.type !== type) {
      // Cancel opposite broadcast (e.g., join cancels leave, leave cancels join)
      clearTimeout(pending.timeout);
      pendingBroadcasts.delete(key);
      console.log(`🚫 Cancelled pending ${pending.type} broadcast for ${username} in room ${roomId} (replaced by ${type})`);
      
      // If this is a join after a pending leave, don't broadcast anything (user just reconnected)
      if (type === 'join' && pending.type === 'leave') {
        console.log(`↩️ User ${username} reconnected to room ${roomId} - no broadcast needed`);
        return;
      }
      // If this is a leave after a pending join, don't broadcast anything (user left immediately)
      if (type === 'leave' && pending.type === 'join') {
        console.log(`⚡ User ${username} left room ${roomId} immediately - no broadcast needed`);
        return;
      }
    } else {
      // Same type already pending, just reset the timer
      clearTimeout(pending.timeout);
      console.log(`🔄 Resetting ${type} broadcast timer for ${username} in room ${roomId}`);
    }
  }
  
  // Schedule new broadcast
  const timeout = setTimeout(() => {
    const message = {
      id: `${type}_${Date.now()}_${username}_${roomId}`,
      sender: username,
      content: `${username} ${type === 'join' ? 'joined' : 'left'} the room`,
      timestamp: new Date().toISOString(),
      roomId: roomId,
      type: type,
      userRole: role
    };
    
    if (type === 'join') {
      socket.to(roomId).emit('user-joined', message);
      console.log(`✅ Broadcasting JOIN for ${username} in room ${roomId}`);
    } else {
      io.to(roomId).emit('user-left', message);
      console.log(`✅ Broadcasting LEAVE for ${username} in room ${roomId}`);
    }
    
    pendingBroadcasts.delete(key);
  }, DEBOUNCE_DELAY);
  
  pendingBroadcasts.set(key, { type, timeout, username, roomId });
  console.log(`⏳ Scheduled ${type} broadcast for ${username} in room ${roomId} (${DEBOUNCE_DELAY}ms delay)`);
}

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

  if (!token) {
    console.log('Socket connection rejected: No token provided');
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    // Add more detailed JWT validation
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (!decoded.userId) {
      console.log('Socket authentication failed: Invalid token payload');
      return next(new Error('Authentication error: Invalid token payload'));
    }

    // Get complete user information from database
    const userResult = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [decoded.userId]);

    if (userResult.rows.length === 0) {
      console.log('Socket authentication failed: User not found in database');
      return next(new Error('Authentication error: User not found'));
    }

    const user = userResult.rows[0];

    // Store authenticated user information on socket
    socket.userId = user.id;
    socket.username = user.username;
    socket.userRole = user.role; // This is the authoritative role from database
    socket.authenticated = true;

    console.log(`Socket authenticated for user: ${user.username} (ID: ${user.id}, Role: ${user.role})`);
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.log('Socket authentication failed: Token expired');
      return next(new Error('Authentication error: Token expired'));
    } else if (error.name === 'JsonWebTokenError') {
      console.log('Socket authentication failed: Invalid token');
      return next(new Error('Authentication error: Invalid token'));
    } else {
      console.log('Socket authentication failed:', error.message);
      return next(new Error('Authentication error: Token validation failed'));
    }
  }
};

// Apply authentication middleware
io.use(authenticateSocket);

// Handle connection errors with better session management
io.engine.on("connection_error", (err) => {
  console.log('❌ Socket connection error:', err.req ? 'Request object present' : 'No request object');
  console.log('❌ Error code:', err.code);
  console.log('❌ Error message:', err.message);
  console.log('❌ Error context:', err.context);
  
  // Handle session ID errors specifically
  if (err.message === 'Session ID unknown' && err.context?.sid) {
    console.log(`🔄 Clearing unknown session: ${err.context.sid}`);
    // Let the client reconnect with a fresh session
  }
});

// Add engine error handling for unknown sessions
io.engine.on("initial_headers", (headers, req) => {
  headers["Access-Control-Allow-Origin"] = "*";
  headers["Access-Control-Allow-Credentials"] = "true";
});

// Handle session validation
io.engine.on("headers", (headers, req) => {
  headers["Access-Control-Allow-Origin"] = "*";
});

io.on('connection', (socket) => {
  console.log(`🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀`);
  console.log(`🚀 GATEWAY CONNECTION ESTABLISHED! THIS IS THE GATEWAY SERVER!`);
  console.log(`🚀 User connected to DEDICATED GATEWAY: ${socket.id}, User ID: ${socket.userId}`);
  console.log(`🚀 Total gateway connections: ${io.sockets.sockets.size}`);
  console.log(`🚀 Time: ${new Date().toISOString()}`);
  console.log(`🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀`);

  // Store connected user info with session tracking
  connectedUsers.set(socket.id, { 
    userId: socket.userId,
    announcedRooms: new Set() // Track rooms where join was already announced
  });

  // Join user to their personal notification room
  const personalRoom = `user_${socket.userId}`;
  socket.join(personalRoom);
  console.log(`🔔 User ${socket.username} joined personal notification room: ${personalRoom}`);

  // Join room event
  socket.on('join-room', async (data) => {
    const { roomId, username, role, password, silent } = data;

    if (!roomId || !username) {
      console.log('❌ Invalid join-room data:', data);
      socket.emit('join-room-error', { error: 'Invalid room data provided' });
      return;
    }

    // SECURITY: Validate that client-provided username matches authenticated identity
    if (username !== socket.username) {
      console.log(`⚠️ Security: User ${socket.username} attempted to join as ${username} in room ${roomId}`);
      socket.emit('join-room-error', { 
        error: 'Authentication mismatch', 
        reason: 'identity_mismatch' 
      });
      return;
    }

    try {
      // 1. Check if user is banned from this room
      const isBanned = await isUserBanned(roomId, socket.userId, socket.username);
      if (isBanned) {
        console.log(`🚫 Banned user ${socket.username} attempted to join room ${roomId}`);
        socket.emit('join-room-error', { 
          error: 'You are banned from this room',
          reason: 'banned'
        });
        return;
      }

      // 2. Check if room is locked
      const roomLockStatus = await isRoomLocked(roomId);
      if (roomLockStatus.locked) {
        if (roomLockStatus.passwordRequired) {
          // Password is required
          if (!password) {
            console.log(`🔒 User ${socket.username} attempted to join locked room ${roomId} without password`);
            socket.emit('join-room-error', { 
              error: 'This room is locked and requires a password',
              reason: 'password_required'
            });
            return;
          }

          // Verify password
          const passwordValid = await verifyRoomPassword(roomId, password);
          if (!passwordValid) {
            console.log(`🔒 User ${socket.username} provided incorrect password for room ${roomId}`);
            socket.emit('join-room-error', { 
              error: 'Incorrect room password',
              reason: 'invalid_password'
            });
            return;
          }
        } else {
          // Room is locked but no password required (admin only)
          const canBypassLock = await hasPermission(socket.userId, socket.username, roomId, 'lock_room');
          if (!canBypassLock && socket.userRole !== 'admin') {
            console.log(`🔒 User ${socket.username} attempted to join locked room ${roomId} without permission`);
            socket.emit('join-room-error', { 
              error: 'This room is locked',
              reason: 'room_locked'
            });
            return;
          }
        }
      }

      // 3. Check if already in room and prevent multiple joins from same user
      const isAlreadyInRoom = socket.rooms.has(roomId);
      const existingParticipant = roomParticipants[roomId]?.find(p => p.userId === socket.userId);

      // Get user's session tracking info
      let userInfo = connectedUsers.get(socket.id);
      if (!userInfo) {
        userInfo = {
          userId: socket.userId,
          announcedRooms: new Set()
        };
        connectedUsers.set(socket.id, userInfo);
      }

      // Check GLOBAL tracking: has this user EVER announced join for this room (from any connection)?
      const joinKey = `${socket.userId}_${roomId}`;
      const hasAnnouncedJoinGlobally = announcedJoins.has(joinKey);

      // Log the join attempt with more detail (use authenticated username)
      if (silent || hasAnnouncedJoinGlobally) {
        console.log(`🔄 ${socket.username} reconnecting to room ${roomId} via gateway (silent)`);
      } else {
        console.log(`🚪 ${socket.username} joining room ${roomId} via gateway (new join)`);
      }

      // Always join the socket room (this is safe to call multiple times)
      socket.join(roomId);

      // Update connected user info (use authenticated identity, not client payload)
      userInfo.roomId = roomId;
      userInfo.username = socket.username; // Use authenticated username
      userInfo.role = socket.userRole;     // Use authenticated role

      // Socket info is already set from authentication - don't overwrite
      // socket.userId and socket.username are set during authentication

      // Add participant to room
      if (!roomParticipants[roomId]) {
        roomParticipants[roomId] = [];
      }

      // Use authenticated identity for participant management
      let participant = roomParticipants[roomId].find(p => p.userId === socket.userId);
      const wasAlreadyParticipant = !!participant;

      // Check if participant was already online BEFORE updating the status
      const wasAlreadyOnline = wasAlreadyParticipant && participant?.isOnline;

      if (participant) {
        // Update existing participant
        participant.isOnline = true;
        participant.socketId = socket.id;
        participant.lastSeen = new Date().toISOString();
        participant.lastActivityTime = Date.now(); // Track activity for 8-hour timeout
        console.log(`✅ Updated existing participant: ${socket.username} in room ${roomId}`);
      } else {
        // Add new participant using authenticated identity
        participant = {
          id: Date.now().toString(),
          userId: socket.userId,        // Use authenticated userId
          username: socket.username,    // Use authenticated username
          role: socket.userRole,        // Use authenticated role
          isOnline: true,
          socketId: socket.id,
          joinedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          lastActivityTime: Date.now()  // Track activity for 8-hour timeout
        };
        roomParticipants[roomId].push(participant);
        console.log(`➕ Added new participant: ${socket.username} to room ${roomId}`);
      }

      // Check if this is a private chat room
      const isPrivateChat = roomId.startsWith('private_');

      // Only broadcast join message if:
      // 1. Not silent (not a reconnection)
      // 2. User was not already online 
      // 3. Join hasn't been announced GLOBALLY for this user+room
      // 4. Not a private chat
      const shouldBroadcastJoin = !silent && !wasAlreadyOnline && !hasAnnouncedJoinGlobally && !isPrivateChat;

      if (shouldBroadcastJoin) {
        // Use debounced broadcast to prevent spam from rapid reconnects
        scheduleBroadcast(io, 'join', socket.userId, roomId, socket.username, socket.userRole, socket);
        
        // Mark as announced GLOBALLY for this user+room (prevents duplicate across all connections)
        announcedJoins.set(joinKey, Date.now());
        userInfo.announcedRooms.add(roomId);
      } else {
        if (silent) {
          console.log(`🔇 Silent join - no broadcast for ${socket.username} in room ${roomId}`);
        } else if (isPrivateChat) {
          console.log(`💬 Private chat join - no broadcast for ${socket.username} in room ${roomId}`);
        } else if (hasAnnouncedJoinGlobally) {
          console.log(`🚫 Skipping duplicate join broadcast for ${socket.username} in room ${roomId} (already announced globally)`);
        } else if (wasAlreadyOnline) {
          console.log(`🚫 Skipping duplicate join broadcast for ${socket.username} in room ${roomId} (already online)`);
        }
      }

      // Always update participants list
      io.to(roomId).emit('participants-updated', roomParticipants[roomId]);

      // Emit successful join confirmation to the user
      socket.emit('join-room-success', { roomId, username });

    } catch (error) {
      console.error('Error in join-room handler:', error);
      socket.emit('join-room-error', { 
        error: 'Internal server error',
        reason: 'server_error'
      });
    }
  });

  // Leave room event
  socket.on('leave-room', (data) => {
    const { roomId, username, role } = data;

    // SECURITY: Validate that client-provided username matches authenticated identity
    if (username !== socket.username) {
      console.log(`⚠️ Security: User ${socket.username} attempted to leave room as ${username} in room ${roomId}`);
      socket.emit('leave-room-error', { 
        error: 'Authentication mismatch', 
        reason: 'identity_mismatch' 
      });
      return;
    }

    // Validate user is actually in the Socket.IO room
    if (!socket.rooms.has(roomId)) {
      console.log(`⚠️ User ${socket.username} attempted to leave room ${roomId} but is not in Socket.IO room`);
      socket.emit('leave-room-error', { 
        error: 'You are not in this room', 
        reason: 'not_in_room' 
      });
      return;
    }

    // Check if this is a private chat room
    const isPrivateChat = roomId.startsWith('private_');

    // IMPORTANT: Use debounced broadcast to prevent spam from rapid reconnects
    if (!isPrivateChat) {
      // Use debounced broadcast to prevent spam
      scheduleBroadcast(io, 'leave', socket.userId, roomId, socket.username, socket.userRole, socket);
    } else {
      console.log(`💬 Private chat leave - no broadcast for ${socket.username} in room ${roomId}`);
    }

    // NOW leave the Socket.IO room (after emit so sender receives the message)
    socket.leave(roomId);
    console.log(`${socket.username} left room ${roomId} via gateway`);

    // Remove participant from room (use authenticated userId for security)
    if (roomParticipants[roomId]) {
      roomParticipants[roomId] = roomParticipants[roomId].filter(p => p.userId !== socket.userId);
      io.to(roomId).emit('participants-updated', roomParticipants[roomId]);
    }

    // Update connected user info and clear join tracking
    const userInfo = connectedUsers.get(socket.id);
    if (userInfo) {
      userInfo.roomId = null;
      // Remove from announced rooms when leaving
      userInfo.announcedRooms?.delete(roomId);
    }
  });

  // Join support room event
  socket.on('join-support-room', async (data) => {
    const { supportRoomId, isAdmin, silent } = data;

    if (!supportRoomId) {
      console.log('❌ Invalid join-support-room data:', data);
      socket.emit('join-support-room-error', { error: 'Invalid support room data provided' });
      return;
    }

    try {
      socket.join(supportRoomId);
      console.log(`🚪 ${socket.username} joined support room ${supportRoomId} via gateway`);

      // Update connected user info
      let userInfo = connectedUsers.get(socket.id);
      if (userInfo) {
        userInfo.roomId = supportRoomId;
      }

      // Only broadcast join message if not silent
      if (!silent && isAdmin) {
        const adminJoinMessage = {
          id: Date.now().toString(),
          sender: 'System',
          content: `Admin ${socket.username} has joined the support chat`,
          timestamp: new Date().toISOString(),
          roomId: supportRoomId,
          type: 'join'
        };

        socket.to(supportRoomId).emit('admin-joined', { message: adminJoinMessage.content });
      }

      // Emit successful join confirmation
      socket.emit('join-support-room-success', { supportRoomId });

    } catch (error) {
      console.error('Error in join-support-room handler:', error);
      socket.emit('join-support-room-error', { 
        error: 'Internal server error',
        reason: 'server_error'
      });
    }
  });

  // Lock/Unlock room event
  socket.on('lock-room', async (data) => {
    try {
      const { roomId, action, password } = data; // action: 'lock' or 'unlock'

      if (!roomId || !action) {
        console.log('❌ Invalid lock-room data:', data);
        socket.emit('lock-room-error', { error: 'Invalid lock data provided' });
        return;
      }

      // Verify user has permission to lock/unlock rooms
      const hasLockPermission = await hasPermission(socket.userId, socket.username, roomId, 'lock_room');

      if (!hasLockPermission) {
        console.log(`🚫 User ${socket.username} attempted to ${action} room ${roomId} without permission`);
        socket.emit('lock-room-error', { 
          error: 'You do not have permission to lock/unlock this room',
          reason: 'no_permission'
        });
        return;
      }

      if (action === 'lock') {
        // Lock the room
        const result = await lockRoom(roomId, socket.userId, socket.username, password);

        if (result) {
          // Broadcast lock event to room
          io.to(roomId).emit('room-locked', {
            roomId,
            lockedBy: socket.username,
            hasPassword: !!password,
            timestamp: new Date().toISOString()
          });

          // Send system message
          const lockMessage = {
            id: Date.now().toString(),
            sender: 'System',
            content: `🔒 Room locked by ${socket.username}${password ? ' with password' : ''}`,
            timestamp: new Date().toISOString(),
            roomId: roomId,
            type: 'lock'
          };

          io.to(roomId).emit('new-message', lockMessage);
          socket.emit('lock-room-success', { action: 'lock', roomId });

          console.log(`🔒 Room ${roomId} locked by ${socket.username}`);
        } else {
          socket.emit('lock-room-error', { 
            error: 'Failed to lock room',
            reason: 'server_error'
          });
        }

      } else if (action === 'unlock') {
        // Unlock the room
        const result = await unlockRoom(roomId, socket.userId, socket.username);

        if (result) {
          // Broadcast unlock event to room
          io.to(roomId).emit('room-unlocked', {
            roomId,
            unlockedBy: socket.username,
            timestamp: new Date().toISOString()
          });

          // Send system message
          const unlockMessage = {
            id: Date.now().toString(),
            sender: 'System',
            content: `🔓 Room unlocked by ${socket.username}`,
            timestamp: new Date().toISOString(),
            roomId: roomId,
            type: 'unlock'
          };

          io.to(roomId).emit('new-message', unlockMessage);
          socket.emit('lock-room-success', { action: 'unlock', roomId });

          console.log(`🔓 Room ${roomId} unlocked by ${socket.username}`);
        } else {
          socket.emit('lock-room-error', { 
            error: 'Failed to unlock room or room was not locked',
            reason: 'not_locked_or_error'
          });
        }
      }

    } catch (error) {
      console.error('Error in lock-room handler:', error);
      socket.emit('lock-room-error', { 
        error: 'Internal server error',
        reason: 'server_error'
      });
    }
  });

  // Send message event
  socket.on('sendMessage', async (messageData) => {
    try {
      let { roomId, sender, content, role, level, type, gift, tempId, commandType } = messageData;

      if (!roomId || !sender || !content) {
        console.log('❌ Invalid message data:', messageData);
        return;
      }

      console.log(`📨 Gateway relaying message from ${sender} in room ${roomId}: "${content}"`);

      // Check if this is a private chat
      const isPrivateChat = roomId.startsWith('private_');

      // For private chats, check target user status
      if (isPrivateChat) {
        try {
          // Extract user IDs from room ID (format: private_id1_id2)
          const roomParts = roomId.split('_');
          if (roomParts.length >= 3) {
            const userId1 = parseInt(roomParts[1]);
            const userId2 = parseInt(roomParts[2]);
            const targetUserId = userId1 === socket.userId ? userId2 : userId1;

            // Get target user status
            const targetUserResult = await pool.query('SELECT username, status FROM users WHERE id = $1', [targetUserId]);

            if (targetUserResult.rows.length > 0) {
              const targetUser = targetUserResult.rows[0];
              const targetStatus = targetUser.status || 'online';

              // Send system message based on user status
              if (targetStatus === 'offline') {
                const systemMessage = {
                  id: `system_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  sender: 'System',
                  content: `${targetUser.username} is currently offline`,
                  timestamp: new Date().toISOString(),
                  roomId,
                  role: 'system',
                  level: 1,
                  type: 'system'
                };

                io.to(roomId).emit('new-message', systemMessage);
              } else if (targetStatus === 'away') {
                const systemMessage = {
                  id: `system_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  sender: 'System',
                  content: `${targetUser.username} is currently away`,
                  timestamp: new Date().toISOString(),
                  roomId,
                  role: 'system',
                  level: 1,
                  type: 'system'
                };

                io.to(roomId).emit('new-message', systemMessage);
              } else if (targetStatus === 'busy') {
                // Don't allow message sending if user is busy
                const errorMessage = {
                  id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  sender: 'System',
                  content: `${targetUser.username} is currently busy and cannot receive messages`,
                  timestamp: new Date().toISOString(),
                  roomId,
                  role: 'system',
                  level: 1,
                  type: 'error'
                };

                socket.emit('new-message', errorMessage);
                return; // Don't process the original message
              }
            }
          }
        } catch (statusError) {
          console.error('Error checking user status:', statusError);
          // Continue with message sending if status check fails
        }
      }

      // For non-private chats, validate user is properly in room
      if (!isPrivateChat) {
        // Check if user is in participant list (using userId for security)
        const userInRoom = roomParticipants[roomId]?.find(p => p.userId === socket.userId && p.isOnline);
        
        if (!userInRoom) {
          console.log(`⚠️ User ${socket.username} (ID: ${socket.userId}) attempted to send message but is not in room ${roomId} participant list`);
          
          const errorMessage = {
            id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sender: 'System',
            content: 'You are not in the room. Please join the room first to send messages.',
            timestamp: new Date().toISOString(),
            roomId,
            role: 'system',
            level: 1,
            type: 'error'
          };
          
          socket.emit('new-message', errorMessage);
          return;
        }
        
        // Check if socket is in Socket.IO room, if not, re-join automatically
        // This handles the case when user switches apps and comes back
        if (!socket.rooms.has(roomId)) {
          console.log(`🔄 Auto-rejoining ${socket.username} to Socket.IO room ${roomId} (was in participant list but not in socket room)`);
          socket.join(roomId);
          // Update participant's socket ID
          userInRoom.socketId = socket.id;
          userInRoom.lastSeen = new Date().toISOString();
        }

        // Check 3: Ensure sender matches authenticated identity
        if (sender !== socket.username) {
          console.log(`⚠️ Security: User ${socket.username} attempted to send message as ${sender} in room ${roomId}`);
          
          const errorMessage = {
            id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sender: 'System',
            content: 'Authentication error. Please refresh and try again.',
            timestamp: new Date().toISOString(),
            roomId,
            role: 'system',
            level: 1,
            type: 'error'
          };
          
          socket.emit('new-message', errorMessage);
          return;
        }
      }

      // Update user's last activity time for 8-hour inactivity timeout
      if (roomParticipants[roomId]) {
        const participant = roomParticipants[roomId].find(p => p.userId === socket.userId);
        if (participant) {
          participant.lastActivityTime = Date.now();
        }
      }

      // Check if this is a special command that needs server-side handling
      const trimmedContent = content.trim();

      // Handle /addbot or /botadd command - Add ChatMe Bot to room
      if (trimmedContent === '/addbot' || trimmedContent === '/addbot chatme_bot' || trimmedContent === '/botadd' || trimmedContent === '/botadd chatme_bot') {
        console.log(`🤖 Processing /addbot command in room ${roomId} by ${sender}`);
        
        try {
          // Get user info
          const userInfo = connectedUsers.get(socket.id);
          if (!userInfo || !userInfo.userId) {
            socket.emit('system-message', {
              content: '❌ Unable to identify user. Please reconnect.',
              timestamp: new Date().toISOString()
            });
            return;
          }

          // Check permissions - only room owner/moderators/admins can add bot
          const hasAddPermission = await hasPermission(userInfo.userId, sender, roomId, 'add_bot');
          if (!hasAddPermission) {
            socket.emit('system-message', {
              content: '❌ Only room owners, moderators, and admins can add the bot.',
              timestamp: new Date().toISOString()
            });
            return;
          }

          // Check if bot is already in room
          const existingMember = await pool.query(`
            SELECT 1 FROM bot_room_members 
            WHERE room_id = $1 AND bot_user_id = $2 AND is_active = true
          `, [roomId, 43]);

          if (existingMember.rows.length > 0) {
            socket.emit('system-message', {
              content: '⚠️ ChatMe Bot is already in this room!',
              timestamp: new Date().toISOString()
            });
            return;
          }

          // Add bot to room
          await pool.query(`
            INSERT INTO bot_room_members (room_id, bot_user_id, bot_username, added_by_id, added_by_username)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (room_id, bot_user_id) 
            DO UPDATE SET is_active = true, added_by_id = $4, added_by_username = $5, added_at = CURRENT_TIMESTAMP
          `, [roomId, 43, 'chatme_bot', userInfo.userId, sender]);

          // Broadcast success message to room
          io.to(roomId).emit('system-message', {
            content: `🤖 ChatMe Bot has joined the room! (Added by ${sender})`,
            timestamp: new Date().toISOString()
          });

          console.log(`✅ ChatMe Bot added to room ${roomId} by ${sender}`);
        } catch (error) {
          console.error('Error adding bot to room:', error);
          socket.emit('system-message', {
            content: '❌ Failed to add ChatMe Bot to room.',
            timestamp: new Date().toISOString()
          });
        }
        return; // Don't process as regular message
      }

      // Handle /removebot or /botremove command - Remove ChatMe Bot from room
      if (trimmedContent === '/removebot' || trimmedContent === '/removebot chatme_bot' || trimmedContent === '/botremove' || trimmedContent === '/botremove chatme_bot') {
        console.log(`🤖 Processing /removebot command in room ${roomId} by ${sender}`);
        
        try {
          // Get user info
          const userInfo = connectedUsers.get(socket.id);
          if (!userInfo || !userInfo.userId) {
            socket.emit('system-message', {
              content: '❌ Unable to identify user. Please reconnect.',
              timestamp: new Date().toISOString()
            });
            return;
          }

          // Check permissions - only room owner/moderators/admins can remove bot
          const hasRemovePermission = await hasPermission(userInfo.userId, sender, roomId, 'remove_bot');
          if (!hasRemovePermission) {
            socket.emit('system-message', {
              content: '❌ Only room owners, moderators, and admins can remove the bot.',
              timestamp: new Date().toISOString()
            });
            return;
          }

          // Check if bot is in room
          const existingMember = await pool.query(`
            SELECT 1 FROM bot_room_members 
            WHERE room_id = $1 AND bot_user_id = $2 AND is_active = true
          `, [roomId, 43]);

          if (existingMember.rows.length === 0) {
            socket.emit('system-message', {
              content: '⚠️ ChatMe Bot is not in this room.',
              timestamp: new Date().toISOString()
            });
            return;
          }

          // Remove bot from room
          await pool.query(`
            UPDATE bot_room_members 
            SET is_active = false 
            WHERE room_id = $1 AND bot_user_id = $2
          `, [roomId, 43]);

          // Broadcast success message to room
          io.to(roomId).emit('system-message', {
            content: `👋 ChatMe Bot has left the room. (Removed by ${sender})`,
            timestamp: new Date().toISOString()
          });

          console.log(`✅ ChatMe Bot removed from room ${roomId} by ${sender}`);
        } catch (error) {
          console.error('Error removing bot from room:', error);
          socket.emit('system-message', {
            content: '❌ Failed to remove ChatMe Bot from room.',
            timestamp: new Date().toISOString()
          });
        }
        return; // Don't process as regular message
      }

      // Handle /roll command
      if (trimmedContent.startsWith('/roll')) {
        console.log(`🎲 Processing /roll command: ${trimmedContent}`);
        const args = trimmedContent.split(' ');
        const max = args[1] ? parseInt(args[1]) : 100;
        const rolled = Math.floor(Math.random() * max) + 1;

        // Create roll result message
        const rollMessage = {
          id: `roll_${Date.now()}_${sender}_${Math.random().toString(36).substr(2, 9)}`,
          sender: 'System',
          content: `🎲 ${sender} rolled: ${rolled} (1-${max})`,
          timestamp: new Date().toISOString(),
          roomId,
          role: 'system',
          level: 1,
          type: 'system'
        };

        // Broadcast roll result to room
        io.to(roomId).emit('new-message', rollMessage);
        console.log(`Roll result broadcasted to room ${roomId}: ${rolled}`);
        return; // Don't process as regular message
      }

      // Handle /f (follow) command
      if (trimmedContent.startsWith('/f ')) {
        console.log(`👥 Processing /f (follow) command from ${sender}: "${trimmedContent}"`);
        const args = trimmedContent.split(/\s+/); // Use regex to split by any whitespace
        const targetUsername = args[1]?.trim();

        console.log(`  - Parsed args:`, args);
        console.log(`  - Target username:`, targetUsername);

        if (!targetUsername) {
          // Send error message privately to sender
          console.log(`  ❌ No target username specified`);
          const userInfo = connectedUsers.get(socket.id);
          if (userInfo && userInfo.userId) {
            socket.emit('new-message', {
              id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              sender: 'System',
              content: '❌ Please specify a username. Usage: /f username',
              timestamp: new Date().toISOString(),
              roomId: roomId,
              type: 'system',
              role: 'system',
              isPrivate: true
            });
          }
          return;
        }

        try {
          // Get sender's user ID
          const userInfo = connectedUsers.get(socket.id);
          if (!userInfo || !userInfo.userId) {
            console.error('User info not found for socket:', socket.id);
            return;
          }

          const followerId = userInfo.userId;

          // Find target user by username
          const targetUserResult = await pool.query(
            'SELECT id, username FROM users WHERE LOWER(username) = LOWER($1)',
            [targetUsername]
          );

          if (targetUserResult.rows.length === 0) {
            // User not found
            socket.emit('new-message', {
              id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              sender: 'System',
              content: `❌ User "${targetUsername}" not found.`,
              timestamp: new Date().toISOString(),
              roomId: roomId,
              type: 'system',
              role: 'system',
              isPrivate: true
            });
            return;
          }

          const targetUser = targetUserResult.rows[0];
          const targetUserId = targetUser.id;

          // Check if user is trying to follow themselves
          if (followerId === targetUserId) {
            socket.emit('new-message', {
              id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              sender: 'System',
              content: '❌ You cannot follow yourself.',
              timestamp: new Date().toISOString(),
              roomId: roomId,
              type: 'system',
              role: 'system',
              isPrivate: true
            });
            return;
          }

          // Check if already following
          const existingFollow = await pool.query(
            'SELECT id FROM user_follows WHERE follower_id = $1 AND following_id = $2',
            [followerId, targetUserId]
          );

          if (existingFollow.rows.length > 0) {
            // Already following
            socket.emit('new-message', {
              id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              sender: 'System',
              content: `ℹ️ You are already following ${targetUser.username}.`,
              timestamp: new Date().toISOString(),
              roomId: roomId,
              type: 'system',
              role: 'system',
              isPrivate: true
            });
            return;
          }

          // Insert follow relationship
          await pool.query(
            'INSERT INTO user_follows (follower_id, following_id, created_at) VALUES ($1, $2, NOW())',
            [followerId, targetUserId]
          );

          console.log(`✅ ${sender} (ID: ${followerId}) followed ${targetUser.username} (ID: ${targetUserId})`);

          // Send success message to sender
          socket.emit('new-message', {
            id: `success_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sender: 'System',
            content: `✅ You are now following ${targetUser.username}.`,
            timestamp: new Date().toISOString(),
            roomId: roomId,
            type: 'system',
            role: 'system',
            isPrivate: true
          });

          // Send notification to target user
          const notification = {
            id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'follow',
            message: `${sender} is followed you`,
            timestamp: new Date().toISOString(),
            data: {
              followerUsername: sender,
              followerId: followerId
            }
          };

          // Emit notification via user's personal room
          io.to(`user_${targetUserId}`).emit('new_notification', notification);
          
          console.log(`🔔 Follow notification sent to ${targetUser.username} (ID: ${targetUserId})`);

        } catch (error) {
          console.error('❌ Error processing /f command:', error);
          console.error('  - Error details:', error.message);
          console.error('  - Stack trace:', error.stack);
          socket.emit('new-message', {
            id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            sender: 'System',
            content: `❌ Failed to follow user. Error: ${error.message || 'Unknown error'}`,
            timestamp: new Date().toISOString(),
            roomId: roomId,
            type: 'system',
            role: 'system',
            isPrivate: true
          });
        }

        console.log(`✅ /f command processing completed for ${sender}`);
        return; // Don't process as regular message
      }

      // Handle bot commands
      if (trimmedContent.startsWith('/bot lowcard add') || 
          trimmedContent.startsWith('/add') || 
          trimmedContent.startsWith('/init_bot') ||
          trimmedContent.startsWith('/bot off') ||
          trimmedContent.startsWith('!')) {

        console.log(`🤖 Processing bot command: ${trimmedContent}`);

        // Get user info from connected users
        const userInfo = connectedUsers.get(socket.id);
        if (userInfo && userInfo.userId) {
          // Process the command through LowCard bot
          processLowCardCommand(io, roomId, trimmedContent, userInfo.userId, sender);
        } else {
          console.error('User info not found for socket:', socket.id);
        }

        // Don't broadcast bot commands as regular messages - make them all private
        return;
      }

      // Create message with unique ID
      const messageId = tempId ? tempId.replace('temp_', '') + '_confirmed' : `${Date.now()}_${sender}_${Math.random().toString(36).substr(2, 9)}`;

      const newMessage = {
        id: messageId,
        sender,
        content,
        timestamp: new Date().toISOString(),
        roomId,
        role: role || 'user',
        level: level || 1,
        type: type || 'message',
        commandType: commandType || null,
        gift: gift || null
      };

      // Save private chat messages to database
      if (isPrivateChat) {
        await saveChatMessage(
          roomId,
          sender,
          content,
          gift, // media data (for gifts)
          type || 'message',
          role || 'user',
          level || 1,
          true // isPrivate
        );
        console.log(`💾 Private chat message saved to database: ${roomId}`);

        // Save to private_messages table for notification tracking
        try {
          const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [sender]);
          const senderId = userResult.rows.length > 0 ? userResult.rows[0].id : null;

          if (senderId) {
            await pool.query(`
              INSERT INTO private_messages (chat_id, sender_id, message, is_read)
              VALUES ($1, $2, $3, false)
            `, [roomId, senderId, content]);
            console.log(`💾 Private message saved for notifications: ${roomId}`);
          }
        } catch (error) {
          console.error('Error saving private message for notifications:', error);
        }
      }

      // Broadcast message to room
      io.to(roomId).emit('new-message', newMessage);

      // If it's a gift, also broadcast animation
      if (type === 'gift' && gift) {
        io.to(roomId).emit('gift-animation', {
          gift,
          sender,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`Message broadcasted to room ${roomId} from ${sender}`);

      // ChatMe AI Bot Integration
      // Check if bot should respond to this message
      if (sender !== BOT_USERNAME) { // Don't respond to bot's own messages
        try {
          const botResponse = await processBotMessage({
            message: content,
            roomId,
            username: sender,
            conversationHistory: [], // Could fetch recent messages from DB for context
            pool // Pass database pool for membership check
          });

          if (botResponse) {
            // Bot has a response - broadcast it to the room
            const botMessageId = `${Date.now()}_${BOT_USERNAME}_${Math.random().toString(36).substr(2, 9)}`;
            
            const botMessage = {
              id: botMessageId,
              sender: BOT_USERNAME,
              content: botResponse.content,
              timestamp: new Date().toISOString(),
              roomId,
              role: 'user',
              level: 1,
              type: 'message',
              isBot: true // Mark as bot message for frontend styling
            };

            // Small delay to make it feel more natural
            setTimeout(() => {
              io.to(roomId).emit('new-message', botMessage);
              console.log(`🤖 ChatMe Bot responded in room ${roomId}: "${botResponse.content}"`);
              
              // Save bot message to database for private chats
              if (isPrivateChat) {
                saveChatMessage(
                  roomId,
                  BOT_USERNAME,
                  botResponse.content,
                  null,
                  'message',
                  'user',
                  1,
                  true
                ).catch(err => console.error('Error saving bot message:', err));
              }
            }, 800); // 800ms delay for natural conversation feel
          }
        } catch (botError) {
          console.error('❌ ChatMe Bot error:', botError);
          // Don't crash if bot fails - just log the error
        }
      }

    } catch (error) {
      console.error('Error handling sendMessage:', error);
    }
  });

  // Send gift event
  socket.on('sendGift', async (giftData) => {
    try {
      const { roomId, sender, gift, timestamp, role, level, recipient } = giftData;

      if (!roomId || !sender || !gift) {
        console.log('Invalid gift data:', giftData);
        return;
      }

      console.log(`Gateway relaying gift from ${sender} in room ${roomId}: ${gift.name}`);

      // Note: Gift messages are real-time only, not saved to database
      // This keeps chat history clean when users leave rooms

      // Broadcast gift to all users in the room
      io.to(roomId).emit('receiveGift', {
        roomId,
        sender,
        gift,
        recipient,
        timestamp: timestamp || new Date().toISOString(),
        role: role || 'user',
        level: level || 1
      });

      console.log(`Gift broadcasted to room ${roomId} from ${sender}`);

    } catch (error) {
      console.error('Error handling sendGift:', error);
    }
  });

  // Send private gift event
  socket.on('send-private-gift', (giftData) => {
    try {
      const { from, to, gift, timestamp, roomId } = giftData;

      if (!from || !to || !gift) {
        console.log('❌ Invalid private gift data:', giftData);
        return;
      }

      console.log(`🎁 Gateway relaying private gift from ${from} to ${to}: ${gift.name}`);
      console.log(`🎁 Gift details:`, JSON.stringify(gift, null, 2));

      // Broadcast to entire room (private chat room) to ensure delivery
      if (roomId) {
        console.log(`🎁 Broadcasting private gift to room: ${roomId}`);
        io.to(roomId).emit('receive-private-gift', {
          from,
          to,
          gift,
          timestamp: timestamp || new Date().toISOString(),
          type: 'private',
          roomId: roomId
        });
        console.log(`🎁 Private gift broadcasted to room ${roomId}`);
      } else {
        // Fallback: Find target user's socket directly
        const targetSocket = [...connectedUsers.entries()].find(([socketId, userInfo]) => 
          userInfo.username === to
        );

        if (targetSocket) {
          const [targetSocketId] = targetSocket;
          io.to(targetSocketId).emit('receive-private-gift', {
            from,
            to,
            gift,
            timestamp: timestamp || new Date().toISOString(),
            type: 'private'
          });
          console.log(`🎁 Private gift delivered directly to ${to}`);
        } else {
          console.log(`❌ Target user ${to} not found or offline`);
        }
      }

    } catch (error) {
      console.error('❌ Error handling send-private-gift:', error);
    }
  });

  // Typing indicator events
  socket.on('typing-start', (data) => {
    const { roomId, username } = data;
    if (roomId && username) {
      socket.to(roomId).emit('user-typing', { username, typing: true });
    }
  });

  socket.on('typing-stop', (data) => {
    const { roomId, username } = data;
    if (roomId && username) {
      socket.to(roomId).emit('user-typing', { username, typing: false });
    }
  });

  // User moderation events - SECURE VERSION with server-side verification
  socket.on('kick-user', async (data) => {
    try {
      const { roomId, targetUsername, reason } = data;

      if (!roomId || !targetUsername) {
        console.log('❌ Invalid kick-user data:', data);
        socket.emit('kick-user-error', { error: 'Invalid kick data provided' });
        return;
      }

      // 1. SERVER-SIDE PERMISSION VERIFICATION - Use authoritative JWT data
      const hasKickPermission = await hasPermission(socket.userId, socket.username, roomId, 'kick');

      if (!hasKickPermission) {
        console.log(`🚫 User ${socket.username} (ID: ${socket.userId}) attempted to kick ${targetUsername} without permission in room ${roomId}`);
        socket.emit('kick-user-error', { 
          error: 'You do not have permission to kick users in this room',
          reason: 'no_permission'
        });
        return;
      }

      // 2. Get target user information from database (authoritative source)
      const targetUserResult = await pool.query('SELECT id, username, role FROM users WHERE username = $1', [targetUsername]);

      if (targetUserResult.rows.length === 0) {
        socket.emit('kick-user-error', { 
          error: 'Target user not found',
          reason: 'user_not_found'
        });
        return;
      }

      const targetUser = targetUserResult.rows[0];

      // 3. Prevent kicking admins or yourself
      if (targetUser.id === socket.userId) {
        socket.emit('kick-user-error', { 
          error: 'You cannot kick yourself',
          reason: 'cannot_kick_self'
        });
        return;
      }

      if (targetUser.role === 'admin') {
        socket.emit('kick-user-error', { 
          error: 'Cannot kick administrators',
          reason: 'cannot_kick_admin'
        });
        return;
      }

      // 4. AUTHORITATIVE ENFORCEMENT - Remove from participants
      if (roomParticipants[roomId]) {
        roomParticipants[roomId] = roomParticipants[roomId].filter(p => p.username !== targetUsername);
        io.to(roomId).emit('participants-updated', roomParticipants[roomId]);
      }

      // 5. Force disconnect kicked user from room if they're online
      const kickedUserSocket = [...connectedUsers.entries()].find(([socketId, userInfo]) => 
        userInfo.username === targetUsername && userInfo.roomId === roomId
      );

      if (kickedUserSocket) {
        const [kickedSocketId] = kickedUserSocket;
        io.to(kickedSocketId).emit('user-kicked', {
          roomId,
          kickedUser: targetUsername,
          kickedBy: socket.username,
          reason: reason || 'No reason provided'
        });

        // Force leave the room
        io.to(kickedSocketId).emit('force-leave-room', { 
          roomId, 
          reason: 'kicked',
          kickedBy: socket.username 
        });
      }

      // 6. Broadcast verified kick event to room
      io.to(roomId).emit('user-kicked', {
        roomId,
        kickedUser: targetUsername,
        kickedBy: socket.username // Use server-side authoritative username
      });

      // 7. Send verified system message
      const kickMessage = {
        id: Date.now().toString(),
        sender: 'System',
        content: `${targetUsername} was kicked by ${socket.username}${reason ? ` (${reason})` : ''}`,
        timestamp: new Date().toISOString(),
        roomId: roomId,
        type: 'kick'
      };

      io.to(roomId).emit('new-message', kickMessage);

      // 8. Confirm success to requesting user
      socket.emit('kick-user-success', { targetUsername, roomId });

      console.log(`✅ User ${targetUsername} kicked from room ${roomId} by ${socket.username} (verified)`);

    } catch (error) {
      console.error('Error in kick-user handler:', error);
      socket.emit('kick-user-error', { 
        error: 'Internal server error',
        reason: 'server_error'
      });
    }
  });

  socket.on('mute-user', async (data) => {
    try {
      const { roomId, targetUsername, action, reason, durationMinutes } = data; // action: 'mute' or 'unmute'

      if (!roomId || !targetUsername || !action) {
        console.log('❌ Invalid mute-user data:', data);
        socket.emit('mute-user-error', { error: 'Invalid mute data provided' });
        return;
      }

      // 1. SERVER-SIDE PERMISSION VERIFICATION - Use authoritative JWT data
      const hasMutePermission = await hasPermission(socket.userId, socket.username, roomId, 'mute');

      if (!hasMutePermission) {
        console.log(`🚫 User ${socket.username} (ID: ${socket.userId}) attempted to ${action} ${targetUsername} without permission in room ${roomId}`);
        socket.emit('mute-user-error', { 
          error: `You do not have permission to ${action} users in this room`,
          reason: 'no_permission'
        });
        return;
      }

      // 2. Get target user information from database (authoritative source)
      const targetUserResult = await pool.query('SELECT id, username, role FROM users WHERE username = $1', [targetUsername]);

      if (targetUserResult.rows.length === 0) {
        socket.emit('mute-user-error', { 
          error: 'Target user not found',
          reason: 'user_not_found'
        });
        return;
      }

      const targetUser = targetUserResult.rows[0];

      // 3. Prevent muting admins or yourself
      if (targetUser.id === socket.userId) {
        socket.emit('mute-user-error', { 
          error: 'You cannot mute yourself',
          reason: 'cannot_mute_self'
        });
        return;
      }

      if (targetUser.role === 'admin') {
        socket.emit('mute-user-error', { 
          error: 'Cannot mute administrators',
          reason: 'cannot_mute_admin'
        });
        return;
      }

      // 4. Notify the target user if they're online
      const targetUserSocket = [...connectedUsers.entries()].find(([socketId, userInfo]) => 
        userInfo.username === targetUsername && userInfo.roomId === roomId
      );

      if (targetUserSocket) {
        const [targetSocketId] = targetUserSocket;
        io.to(targetSocketId).emit('user-muted', {
          roomId,
          mutedUser: targetUsername,
          mutedBy: socket.username,
          action,
          reason: reason || 'No reason provided',
          duration: durationMinutes || null
        });
      }

      // 5. Broadcast verified mute event to room
      io.to(roomId).emit('user-muted', {
        roomId,
        mutedUser: targetUsername,
        mutedBy: socket.username, // Use server-side authoritative username
        action
      });

      // 6. Send verified system message
      const muteMessage = {
        id: Date.now().toString(),
        sender: 'System',
        content: `${targetUsername} was ${action}d by ${socket.username}${reason ? ` (${reason})` : ''}${durationMinutes ? ` for ${durationMinutes} minutes` : ''}`,
        timestamp: new Date().toISOString(),
        roomId: roomId,
        type: 'mute'
      };

      io.to(roomId).emit('new-message', muteMessage);

      // 7. Confirm success to requesting user
      socket.emit('mute-user-success', { action, targetUsername, roomId });

      console.log(`✅ User ${targetUsername} ${action}d in room ${roomId} by ${socket.username} (verified)`);

    } catch (error) {
      console.error('Error in mute-user handler:', error);
      socket.emit('mute-user-error', { 
        error: 'Internal server error',
        reason: 'server_error'
      });
    }
  });

  // Ban/unban user event - SECURE VERSION with server-side verification
  socket.on('ban-user', async (data) => {
    try {
      const { roomId, targetUsername, action, reason, durationHours } = data; // action: 'ban' or 'unban'

      if (!roomId || !targetUsername || !action) {
        console.log('❌ Invalid ban-user data:', data);
        socket.emit('ban-user-error', { error: 'Invalid ban data provided' });
        return;
      }

      // 1. SERVER-SIDE PERMISSION VERIFICATION - Use authoritative JWT data
      const hasBanPermission = await hasPermission(socket.userId, socket.username, roomId, 'ban');

      if (!hasBanPermission) {
        console.log(`🚫 User ${socket.username} (ID: ${socket.userId}) attempted to ${action} ${targetUsername} without permission in room ${roomId}`);
        socket.emit('ban-user-error', { 
          error: `You do not have permission to ${action} users in this room`,
          reason: 'no_permission'
        });
        return;
      }

      // 2. Get target user information from database (authoritative source)
      const targetUserResult = await pool.query('SELECT id, username FROM users WHERE username = $1', [targetUsername]);

      if (targetUserResult.rows.length === 0) {
        socket.emit('ban-user-error', { 
          error: 'Target user not found',
          reason: 'user_not_found'
        });
        return;
      }

      const targetUser = targetUserResult.rows[0];

      // 3. Prevent banning admins or room owners
      if (targetUser.id === socket.userId) {
        socket.emit('ban-user-error', { 
          error: 'You cannot ban yourself',
          reason: 'cannot_ban_self'
        });
        return;
      }

      // Check if target is admin
      const targetUserRoleResult = await pool.query('SELECT role FROM users WHERE id = $1', [targetUser.id]);
      if (targetUserRoleResult.rows.length > 0 && targetUserRoleResult.rows[0].role === 'admin') {
        socket.emit('ban-user-error', { 
          error: 'Cannot ban administrators',
          reason: 'cannot_ban_admin'
        });
        return;
      }

      if (action === 'ban') {
        // 4. PERSISTENT BAN STORAGE - Add to database
        const banResult = await addBanToDatabase(
          roomId, 
          targetUser.id, 
          targetUser.username, 
          socket.userId, 
          socket.username, 
          reason,
          durationHours
        );

        if (!banResult) {
          socket.emit('ban-user-error', { 
            error: 'Failed to ban user',
            reason: 'database_error'
          });
          return;
        }

        // 5. AUTHORITATIVE ENFORCEMENT - Remove from participants and disconnect if online
        if (roomParticipants[roomId]) {
          roomParticipants[roomId] = roomParticipants[roomId].filter(p => p.username !== targetUsername);
          io.to(roomId).emit('participants-updated', roomParticipants[roomId]);
        }

        // Force disconnect banned user from room if they're online
        const bannedUserSocket = [...connectedUsers.entries()].find(([socketId, userInfo]) => 
          userInfo.username === targetUsername && userInfo.roomId === roomId
        );

        if (bannedUserSocket) {
          const [bannedSocketId] = bannedUserSocket;
          io.to(bannedSocketId).emit('user-banned', {
            roomId,
            bannedUser: targetUsername,
            bannedBy: socket.username,
            action: 'ban',
            reason: reason || 'No reason provided',
            roomName: `Room ${roomId}`
          });

          // Force leave the room
          io.to(bannedSocketId).emit('force-leave-room', { 
            roomId, 
            reason: 'banned',
            bannedBy: socket.username 
          });
        }

        console.log(`✅ User ${targetUsername} banned from room ${roomId} by ${socket.username} (verified)`);

      } else if (action === 'unban') {
        // 6. PERSISTENT UNBAN - Remove from database
        const unbanResult = await removeBanFromDatabase(roomId, targetUsername, socket.userId, socket.username);

        if (!unbanResult) {
          socket.emit('ban-user-error', { 
            error: 'User was not banned or failed to unban',
            reason: 'not_banned_or_error'
          });
          return;
        }

        console.log(`✅ User ${targetUsername} unbanned from room ${roomId} by ${socket.username} (verified)`);
      }

      // 7. Broadcast verified ban/unban event to room
      io.to(roomId).emit('user-banned', {
        roomId,
        bannedUser: targetUsername,
        bannedBy: socket.username, // Use server-side authoritative username
        action,
        reason: reason || 'No reason provided',
        roomName: `Room ${roomId}`
      });

      // 8. Send verified system message
      const banMessage = {
        id: Date.now().toString(),
        sender: 'System',
        content: `${targetUsername} was ${action}ned by ${socket.username}${reason ? ` (${reason})` : ''}`,
        timestamp: new Date().toISOString(),
        roomId: roomId,
        type: action
      };

      io.to(roomId).emit('new-message', banMessage);

      // 9. Confirm success to requesting user
      socket.emit('ban-user-success', { action, targetUsername, roomId });

    } catch (error) {
      console.error('Error in ban-user handler:', error);
      socket.emit('ban-user-error', { 
        error: 'Internal server error',
        reason: 'server_error'
      });
    }
  });

  // Call notification events
  socket.on('initiate-call', async (callData) => {
    try {
      const { targetUsername, callType, callerId, callerName, channelName } = callData;

      if (!targetUsername || !callType || !callerId || !callerName) {
        console.log('❌ Invalid call data:', callData);
        socket.emit('call-error', { error: 'Invalid call data provided' });
        return;
      }

      console.log(`📞 ${callerName} initiating ${callType} call to ${targetUsername}`);

      // Create Daily.co room for the call
      let dailyRoomName = channelName || `call-${callerId}-${Date.now()}`;
      let dailyRoom;
      
      try {
        dailyRoom = await createDailyRoom(dailyRoomName);
        console.log(`✅ Created Daily.co room: ${dailyRoom.name}`);
      } catch (roomError) {
        console.error('❌ Failed to create Daily.co room:', roomError);
        socket.emit('call-error', { 
          error: 'Failed to create video room',
          reason: 'room_creation_failed'
        });
        return;
      }

      // Find target user's socket
      const targetSocket = [...connectedUsers.entries()].find(([socketId, userInfo]) => 
        userInfo.username === targetUsername
      );

      if (targetSocket) {
        const [targetSocketId] = targetSocket;

        // Send incoming call notification to target user with Daily.co room URL
        io.to(targetSocketId).emit('incoming-call', {
          callerId,
          callerName,
          callType,
          channelName: dailyRoom.name,
          roomUrl: dailyRoom.url,
          timestamp: new Date().toISOString()
        });

        // Confirm call initiated to caller
        socket.emit('call-initiated', {
          targetUsername,
          callType,
          channelName: dailyRoom.name,
          roomUrl: dailyRoom.url,
          status: 'ringing'
        });

        console.log(`📞 Call notification sent to ${targetUsername} with Daily.co room ${dailyRoom.url}`);
      } else {
        console.log(`📞 Target user ${targetUsername} not found or offline`);
        socket.emit('call-error', { 
          error: 'User is currently offline or not available',
          reason: 'user_offline'
        });
      }

    } catch (error) {
      console.error('Error handling initiate-call:', error);
      socket.emit('call-error', { 
        error: 'Internal server error',
        reason: 'server_error'
      });
    }
  });

  // Call response events
  socket.on('call-response', (responseData) => {
    try {
      const { callerId, response, responderName, channelName, roomUrl, callType } = responseData; // response: 'accept' or 'decline'

      if (!callerId || !response || !responderName) {
        console.log('❌ Invalid call response data:', responseData);
        return;
      }

      console.log(`📞 ${responderName} ${response}ed call from caller ID ${callerId}`);

      // Find caller's socket
      const callerSocket = [...connectedUsers.entries()].find(([socketId, userInfo]) => 
        userInfo.userId === callerId
      );

      if (callerSocket) {
        const [callerSocketId] = callerSocket;

        // Send call response to caller with room URL
        io.to(callerSocketId).emit('call-response-received', {
          response,
          responderName,
          channelName,
          roomUrl,
          callType,
          timestamp: new Date().toISOString()
        });

        console.log(`📞 Call ${response} notification sent to caller`);
      } else {
        console.log(`📞 Caller ${callerId} not found`);
      }

    } catch (error) {
      console.error('Error handling call-response:', error);
    }
  });

  // End call event
  socket.on('end-call', (endCallData) => {
    try {
      const { targetUserId, targetUsername, endedBy } = endCallData;

      console.log(`📞 Call ended by ${endedBy}`);

      // Find target user's socket
      let targetSocket = null;
      if (targetUsername) {
        targetSocket = [...connectedUsers.entries()].find(([socketId, userInfo]) => 
          userInfo.username === targetUsername
        );
      } else if (targetUserId) {
        targetSocket = [...connectedUsers.entries()].find(([socketId, userInfo]) => 
          userInfo.userId === targetUserId
        );
      }

      if (targetSocket) {
        const [targetSocketId] = targetSocket;

        // Send call ended notification
        io.to(targetSocketId).emit('call-ended', {
          endedBy,
          timestamp: new Date().toISOString()
        });

        console.log(`📞 Call ended notification sent to ${targetUsername || targetUserId}`);
      }

    } catch (error) {
      console.error('Error handling end-call:', error);
    }
  });

  // Notification events
  socket.on('send-notification', (notificationData) => {
    const { targetUserId, targetUsername, notification } = notificationData;

    if (!targetUserId && !targetUsername) {
      console.log('Invalid notification data: no target specified');
      return;
    }

    // Find target user's socket
    let targetSocket = null;
    if (targetUsername) {
      targetSocket = [...connectedUsers.entries()].find(([socketId, userInfo]) => 
        userInfo.username === targetUsername
      );
    } else if (targetUserId) {
      targetSocket = [...connectedUsers.entries()].find(([socketId, userInfo]) => 
        userInfo.userId === targetUserId
      );
    }

    if (targetSocket) {
      const [targetSocketId] = targetSocket;
      io.to(targetSocketId).emit('new-notification', notification);

      // Special handling for coin notifications - show immediate alert
      if (notification.type === 'credit_received') {
        io.to(targetSocketId).emit('coin-received', {
          amount: notification.data?.amount || 0,
          from: notification.data?.from || 'Unknown',
          message: notification.message,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`Notification sent to ${targetUsername || targetUserId}`);
    } else {
      console.log(`Target user ${targetUsername || targetUserId} not found for notification`);
    }
  });

  // Report event
  socket.on('send-report', (reportData) => {
    console.log('Gateway received report:', reportData);

    // Broadcast to admin users (you can filter by admin sockets)
    io.emit('admin-notification', {
      type: 'report',
      data: reportData,
      timestamp: new Date().toISOString()
    });

    console.log('Report forwarded to admins via gateway');
  });

  // Disconnect event
  socket.on('disconnect', async () => {
    console.log(`🔴 ===========================================`);
    console.log(`🔴 GATEWAY DISCONNECT!`);
    console.log(`❌ User disconnected from gateway: ${socket.id}`);
    console.log(`📊 Remaining connections: ${io.sockets.sockets.size - 1}`);
    console.log(`🔴 ===========================================`);

    const userInfo = connectedUsers.get(socket.id);
    if (userInfo && userInfo.roomId && userInfo.username) {
      // Check if this is a private chat room or support chat
      const isPrivateChat = userInfo.roomId.startsWith('private_');
      const isSupportChat = userInfo.roomId.startsWith('support_');

      // Check if user has other active connections (any room, any socket)
      const userAllConnections = [...connectedUsers.entries()].filter(([socketId, info]) => 
        socketId !== socket.id && 
        info.userId === userInfo.userId
      );

      // Check if user has other active connections in the same room
      const userOtherConnections = [...connectedUsers.entries()].filter(([socketId, info]) => 
        socketId !== socket.id && 
        info.username === userInfo.username && 
        info.roomId === userInfo.roomId
      );

      const hasOtherActiveConnections = userOtherConnections.length > 0;
      const hasAnyActiveConnections = userAllConnections.length > 0;

      // Update database status to offline ONLY if user has NO other active connections
      if (!hasAnyActiveConnections && userInfo.userId) {
        try {
          await pool.query(
            'UPDATE users SET status = $1 WHERE id = $2',
            ['offline', userInfo.userId]
          );
          console.log(`📴 Set status to OFFLINE for user ${userInfo.username} (ID: ${userInfo.userId}) in database`);
        } catch (dbError) {
          console.error('Error updating user status on disconnect:', dbError);
        }
      } else if (hasAnyActiveConnections) {
        console.log(`🔌 User ${userInfo.username} still has ${userAllConnections.length} active connection(s) - keeping status ONLINE`);
      }

      // Remove from room participants only if no other connections exist
      if (roomParticipants[userInfo.roomId] && !hasOtherActiveConnections) {
        const participantBefore = roomParticipants[userInfo.roomId].find(p => p.userId === userInfo.userId);

        if (participantBefore) {
          // Mark as offline instead of removing completely
          participantBefore.isOnline = false;
          participantBefore.lastSeen = new Date().toISOString();
          participantBefore.socketId = null;

          // Notify room about updated participants
          io.to(userInfo.roomId).emit('participants-updated', roomParticipants[userInfo.roomId]);

          // Only broadcast leave message for public rooms (not private chats or support chats)
          // and ONLY if user has NO active connections anywhere (not just in this room)
          // This prevents "has left" message when user just switches apps or minimizes
          if (!isPrivateChat && !isSupportChat && !hasAnyActiveConnections) {
            // Check if we've already broadcast a leave message for this user in this room recently (within 5 seconds)
            const leaveKey = `${userInfo.userId}_${userInfo.roomId}`;
            const lastBroadcastTime = recentLeaveBroadcasts.get(leaveKey);
            const now = Date.now();
            const LEAVE_BROADCAST_COOLDOWN = 5000; // 5 seconds
            
            if (!lastBroadcastTime || (now - lastBroadcastTime) > LEAVE_BROADCAST_COOLDOWN) {
              // Use debounced broadcast to prevent spam from rapid reconnects
              scheduleBroadcast(io, 'leave', userInfo.userId, userInfo.roomId, userInfo.username, userInfo.role || 'user', socket);
              
              recentLeaveBroadcasts.set(leaveKey, now);
              
              // Clear announced join tracking when user truly leaves (so they can rejoin fresh)
              const joinKey = `${userInfo.userId}_${userInfo.roomId}`;
              announcedJoins.delete(joinKey);
              console.log(`🧹 Cleared join tracking for ${userInfo.username} in room ${userInfo.roomId}`);
              
              // Clean up old entries from recentLeaveBroadcasts (older than 10 seconds)
              for (const [key, timestamp] of recentLeaveBroadcasts.entries()) {
                if (now - timestamp > 10000) {
                  recentLeaveBroadcasts.delete(key);
                }
              }
              
              // Also clean up old announced joins (older than 1 hour)
              const ONE_HOUR = 60 * 60 * 1000;
              for (const [key, timestamp] of announcedJoins.entries()) {
                if (now - timestamp > ONE_HOUR) {
                  announcedJoins.delete(key);
                }
              }
            } else {
              console.log(`🔇 Skipping duplicate leave broadcast for ${userInfo.username} in room ${userInfo.roomId} (already broadcast ${Math.round((now - lastBroadcastTime) / 1000)}s ago)`);
            }
          } else {
            if (isPrivateChat) {
              console.log(`💬 Private chat disconnect - no broadcast for ${userInfo.username} in room ${userInfo.roomId}`);
            } else if (isSupportChat) {
              console.log(`🆘 Support chat disconnect - no broadcast for ${userInfo.username} in room ${userInfo.roomId}`);
            } else if (hasAnyActiveConnections) {
              console.log(`📱 User ${userInfo.username} still has active app connections - no leave broadcast (app backgrounded/switched)`);
            }
          }
        }
      } else if (hasOtherActiveConnections) {
        console.log(`🔄 User ${userInfo.username} has other active connections in room ${userInfo.roomId} - no leave broadcast`);
      } else {
        console.log(`👻 User ${userInfo.username} was not a participant in room ${userInfo.roomId} - no broadcast`);
      }
    }

    // Remove from connected users
    connectedUsers.delete(socket.id);
  });
});

// Periodic cleanup job for inactive users (8-hour timeout)
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run every 1 hour

setInterval(() => {
  console.log('🧹 Running inactivity cleanup job...');
  const now = Date.now();
  let removedCount = 0;

  // Check all rooms for inactive participants
  for (const [roomId, participants] of Object.entries(roomParticipants)) {
    const inactiveUsers = [];

    for (const participant of participants) {
      // Check if user has been inactive for 8 hours
      if (participant.lastActivityTime && (now - participant.lastActivityTime) >= EIGHT_HOURS_MS) {
        inactiveUsers.push(participant);
      }
    }

    // Remove inactive users from room
    for (const inactiveUser of inactiveUsers) {
      console.log(`⏰ Removing inactive user ${inactiveUser.username} from room ${roomId} (inactive for 8+ hours)`);

      // Remove from participants list
      roomParticipants[roomId] = roomParticipants[roomId].filter(p => p.userId !== inactiveUser.userId);
      removedCount++;

      // Broadcast leave message if it's a public room
      const isPrivateChat = roomId.startsWith('private_');
      const isSupportChat = roomId.startsWith('support_');

      if (!isPrivateChat && !isSupportChat) {
        const leaveMessage = {
          id: `leave_${Date.now()}_${inactiveUser.username}_${roomId}`,
          sender: inactiveUser.username,
          content: `${inactiveUser.username} was removed due to inactivity`,
          timestamp: new Date().toISOString(),
          roomId: roomId,
          type: 'leave',
          userRole: inactiveUser.role
        };

        io.to(roomId).emit('user-left', leaveMessage);
      }

      // Update participants list
      io.to(roomId).emit('participants-updated', roomParticipants[roomId]);

      // If user has an active socket, force them to leave the room
      if (inactiveUser.socketId) {
        const userSocket = io.sockets.sockets.get(inactiveUser.socketId);
        if (userSocket) {
          userSocket.leave(roomId);
          userSocket.emit('force-leave-room', {
            roomId,
            reason: 'inactivity',
            message: 'You were removed from the room due to 8 hours of inactivity'
          });
        }
      }
    }
  }

  if (removedCount > 0) {
    console.log(`✅ Inactivity cleanup complete: removed ${removedCount} inactive user(s)`);
  } else {
    console.log('✅ Inactivity cleanup complete: no inactive users found');
  }
}, CLEANUP_INTERVAL_MS);

console.log(`⏰ Inactivity cleanup job scheduled (runs every hour, 8-hour timeout)`);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down Socket Gateway gracefully');
  server.close(() => {
    console.log('Socket Gateway terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down Socket Gateway gracefully');
  server.close(() => {
    console.log('Socket Gateway terminated');
    process.exit(0);
  });
});

// Start the gateway server
server.listen(GATEWAY_PORT, '0.0.0.0', () => {
  console.log(`✅ Socket Gateway running on port ${GATEWAY_PORT}`);
  console.log(`🌐 Gateway accessible at: http://0.0.0.0:${GATEWAY_PORT}`);
  console.log(`🔌 WebSocket endpoint: ws://0.0.0.0:${GATEWAY_PORT}`);
  console.log(`📡 Real-time features: Chat, Notifications, Typing indicators`);
  console.log(`🔐 JWT Authentication required for socket connections`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${GATEWAY_PORT} is already in use`);
    process.exit(1);
  } else {
    console.error('Gateway server error:', err);
    process.exit(1);
  }
});

// roomParticipants accessible via HTTP endpoint /gateway/rooms/:roomId/participants
