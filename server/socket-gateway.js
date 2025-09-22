const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

// Import LowCard bot
const { processLowCardCommand } = require('./games/lowcard.js');

const app = express();
const server = http.createServer(app);

// Socket.IO Gateway Configuration
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const GATEWAY_PORT = process.env.GATEWAY_PORT || 8000;
// Generate a secure random secret if JWT_SECRET is not provided
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const crypto = require('crypto');
  const randomSecret = crypto.randomBytes(64).toString('hex');
  console.warn('⚠️  WARNING: JWT_SECRET not set in environment. Using randomly generated secret.');
  console.warn('⚠️  Set JWT_SECRET environment variable for production use.');
  console.warn(`⚠️  Generated secret: ${randomSecret}`);
  return randomSecret;
})();
const MAIN_API_URL = process.env.MAIN_API_URL || 'http://0.0.0.0:5000';

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

    console.log('✅ Room security tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing room security tables:', error);
  }
};

// Initialize tables on startup
initRoomSecurityTables();

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
    const bcrypt = require('bcrypt');

    const result = await pool.query('SELECT password_hash FROM room_security WHERE room_id = $1', [roomId]);

    if (result.rows.length === 0 || !result.rows[0].password_hash) {
      return false;
    }

    return await bcrypt.compare(password, result.rows[0].password_hash);
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
    const bcrypt = require('bcrypt');
    let passwordHash = null;

    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
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

// In-memory storage for active rooms and participants
const roomParticipants = {}; // { roomId: [ { id, username, role, socketId }, ... ] }
const connectedUsers = new Map(); // socketId -> { userId, username, roomId }

// Socket authentication middleware
const authenticateSocket = async (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

  if (!token) {
    console.log('Socket connection rejected: No token provided');
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

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
    console.log('Socket authentication failed:', error.message);
    return next(new Error('Authentication error: Invalid token'));
  }
};

// Apply authentication middleware
io.use(authenticateSocket);

// Handle connection errors
io.engine.on("connection_error", (err) => {
  console.log('❌ Socket connection error:', err.req);
  console.log('❌ Error code:', err.code);
  console.log('❌ Error message:', err.message);
  console.log('❌ Error context:', err.context);
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

  // Join room event
  socket.on('join-room', async (data) => {
    const { roomId, username, role, password, silent } = data;

    if (!roomId || !username) {
      console.log('❌ Invalid join-room data:', data);
      socket.emit('join-room-error', { error: 'Invalid room data provided' });
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

      // 3. All security checks passed - check if already in room
      const isAlreadyInRoom = socket.rooms.has(roomId);
      const existingParticipant = roomParticipants[roomId]?.find(p => p.username === username);
      
      // Log the join attempt with more detail
      if (silent) {
        console.log(`🔄 ${username} reconnecting to room ${roomId} via gateway (silent)`);
      } else {
        console.log(`🚪 ${username} joining room ${roomId} via gateway (new join)`);
      }
      
      // Always join the socket room (this is safe to call multiple times)
      socket.join(roomId);

      // Update connected user info
      let userInfo = connectedUsers.get(socket.id);
      if (userInfo) {
        userInfo.roomId = roomId;
        userInfo.username = username;
        userInfo.role = role;
      } else {
        // Create user info if it doesn't exist
        userInfo = {
          userId: socket.userId,
          roomId: roomId,
          username: username,
          role: role
        };
        connectedUsers.set(socket.id, userInfo);
      }

      // Store socket info for bot commands
      socket.userId = socket.userId || userInfo?.userId;
      socket.username = username;

      // Add participant to room
      if (!roomParticipants[roomId]) {
        roomParticipants[roomId] = [];
      }

      let participant = roomParticipants[roomId].find(p => p.username === username);
      const wasAlreadyParticipant = !!participant;
      
      // Check if participant was already online BEFORE updating the status
      const wasAlreadyOnline = wasAlreadyParticipant && participant?.isOnline;
      
      if (participant) {
        // Update existing participant
        participant.isOnline = true;
        participant.socketId = socket.id;
        participant.lastSeen = new Date().toISOString();
        console.log(`✅ Updated existing participant: ${username} in room ${roomId}`);
      } else {
        // Add new participant
        participant = {
          id: Date.now().toString(),
          username,
          role: role || 'user',
          isOnline: true,
          socketId: socket.id,
          joinedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        };
        roomParticipants[roomId].push(participant);
        console.log(`➕ Added new participant: ${username} to room ${roomId}`);
      }

      // Check if this is a private chat room
      const isPrivateChat = roomId.startsWith('private_');

      // Only broadcast join message if:
      // 1. Not silent (not a reconnection)
      // 2. User was not already online (prevent duplicate messages but allow legitimate returns)
      // 3. Join hasn't been announced for this socket session
      // 4. Not a private chat
      // Reuse userInfo that was already declared above
      const alreadyAnnouncedInSession = userInfo?.announcedRooms?.has(roomId);
      const shouldBroadcastJoin = !silent && !wasAlreadyOnline && !alreadyAnnouncedInSession && !isPrivateChat;
      
      if (shouldBroadcastJoin) {
        const joinMessage = {
          id: Date.now().toString(),
          sender: username,
          content: `${username} joined the room`,
          timestamp: new Date().toISOString(),
          roomId: roomId,
          type: 'join',
          userRole: role
        };

        console.log(`📢 Broadcasting join message for ${username} in room ${roomId}`);
        socket.to(roomId).emit('user-joined', joinMessage);
        
        // Mark room as announced for this socket session
        if (userInfo?.announcedRooms) {
          userInfo.announcedRooms.add(roomId);
        }
      } else {
        if (silent) {
          console.log(`🔇 Silent join - no broadcast for ${username} in room ${roomId}`);
        } else if (isPrivateChat) {
          console.log(`💬 Private chat join - no broadcast for ${username} in room ${roomId}`);
        } else {
          if (wasAlreadyOnline) {
            console.log(`🚫 Skipping duplicate join broadcast for ${username} in room ${roomId} (already online)`);
          } else if (alreadyAnnouncedInSession) {
            console.log(`🚫 Skipping duplicate join broadcast for ${username} in room ${roomId} (already announced this session)`);
          }
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

    socket.leave(roomId);
    console.log(`${username} left room ${roomId} via gateway`);

    // Check if this is a private chat room
    const isPrivateChat = roomId.startsWith('private_');

    // Remove participant from room
    if (roomParticipants[roomId]) {
      roomParticipants[roomId] = roomParticipants[roomId].filter(p => p.username !== username);
      io.to(roomId).emit('participants-updated', roomParticipants[roomId]);
    }

    // Update connected user info
    const userInfo = connectedUsers.get(socket.id);
    if (userInfo) {
      userInfo.roomId = null;
    }

    // Only broadcast leave message for non-private chats
    if (!isPrivateChat) {
      const leaveMessage = {
        id: Date.now().toString(),
        sender: username,
        content: `${username} left the room`,
        timestamp: new Date().toISOString(),
        roomId: roomId,
        type: 'leave',
        userRole: role
      };

      socket.to(roomId).emit('user-left', leaveMessage);
    } else {
      console.log(`💬 Private chat leave - no broadcast for ${username} in room ${roomId}`);
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

      // Check if this is a special command that needs server-side handling
      const trimmedContent = content.trim();

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

        // Skip database save for temporary chat
        // await saveChatMessage(
        //   roomId,
        //   'System',
        //   rollMessage.content,
        //   null,
        //   'system',
        //   'system',
        //   1,
        //   false
        // );

        // Broadcast roll result to room
        io.to(roomId).emit('new-message', rollMessage);
        console.log(`Roll result broadcasted to room ${roomId}: ${rolled}`);
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

        // Don't broadcast bot commands as regular messages
        if (trimmedContent.startsWith('/bot') || trimmedContent.startsWith('/init_bot')) {
          return;
        }
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

      // Save gift message to database
      const giftContent = recipient ? `sent a ${gift.name} to ${recipient}` : `sent a ${gift.name}`;
      await saveChatMessage(
        roomId,
        sender,
        giftContent,
        gift, // media data for the gift
        'gift',
        role || 'user',
        level || 1,
        false // isPrivate
      );

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
      const { from, to, gift, timestamp } = giftData;

      if (!from || !to || !gift) {
        console.log('Invalid private gift data:', giftData);
        return;
      }

      console.log(`Gateway relaying private gift from ${from} to ${to}: ${gift.name}`);

      // Find target user's socket
      const targetSocket = [...connectedUsers.entries()].find(([socketId, userInfo]) => 
        userInfo.username === to
      );

      if (targetSocket) {
        const [targetSocketId] = targetSocket;
        io.to(targetSocketId).emit('receive-private-gift', {
          from,
          gift,
          timestamp: timestamp || new Date().toISOString(),
          type: 'private'
        });
        console.log(`Private gift delivered to ${to}`);
      } else {
        console.log(`Target user ${to} not found or offline`);
      }

    } catch (error) {
      console.error('Error handling send-private-gift:', error);
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
  socket.on('initiate-call', (callData) => {
    try {
      const { targetUsername, callType, callerId, callerName } = callData;

      if (!targetUsername || !callType || !callerId || !callerName) {
        console.log('❌ Invalid call data:', callData);
        socket.emit('call-error', { error: 'Invalid call data provided' });
        return;
      }

      console.log(`📞 ${callerName} initiating ${callType} call to ${targetUsername}`);

      // Find target user's socket
      const targetSocket = [...connectedUsers.entries()].find(([socketId, userInfo]) => 
        userInfo.username === targetUsername
      );

      if (targetSocket) {
        const [targetSocketId] = targetSocket;

        // Send incoming call notification to target user
        io.to(targetSocketId).emit('incoming-call', {
          callerId,
          callerName,
          callType,
          timestamp: new Date().toISOString()
        });

        // Confirm call initiated to caller
        socket.emit('call-initiated', {
          targetUsername,
          callType,
          status: 'ringing'
        });

        console.log(`📞 Call notification sent to ${targetUsername}`);
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
      const { callerId, response, responderName } = responseData; // response: 'accept' or 'decline'

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

        // Send call response to caller
        io.to(callerSocketId).emit('call-response-received', {
          response,
          responderName,
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
  socket.on('disconnect', () => {
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

      // Remove from room participants
      if (roomParticipants[userInfo.roomId]) {
        const participantBefore = roomParticipants[userInfo.roomId].find(p => p.socketId === socket.id);
        
        roomParticipants[userInfo.roomId] = roomParticipants[userInfo.roomId].filter(
          p => p.socketId !== socket.id
        );

        // Notify room about updated participants only if participant existed
        if (participantBefore) {
          io.to(userInfo.roomId).emit('participants-updated', roomParticipants[userInfo.roomId]);
        }

        // Only broadcast leave message for public rooms (not private chats or support chats)
        // and only if the participant actually existed in the room
        if (!isPrivateChat && !isSupportChat && participantBefore) {
          const leaveMessage = {
            id: Date.now().toString(),
            sender: userInfo.username,
            content: `${userInfo.username} left the room`,
            timestamp: new Date().toISOString(),
            roomId: userInfo.roomId,
            type: 'leave',
            userRole: userInfo.role || 'user'
          };

          socket.to(userInfo.roomId).emit('user-left', leaveMessage);
          console.log(`📢 Broadcasting leave message for ${userInfo.username} in room ${userInfo.roomId}`);
        } else {
          if (isPrivateChat) {
            console.log(`💬 Private chat disconnect - no broadcast for ${userInfo.username} in room ${userInfo.roomId}`);
          } else if (isSupportChat) {
            console.log(`🆘 Support chat disconnect - no broadcast for ${userInfo.username} in room ${userInfo.roomId}`);
          } else if (!participantBefore) {
            console.log(`👻 User ${userInfo.username} was not a participant in room ${userInfo.roomId} - no broadcast`);
          }
        }
      }
    }

    // Remove from connected users
    connectedUsers.delete(socket.id);
  });
});

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