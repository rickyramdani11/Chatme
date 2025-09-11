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
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
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
const authenticateSocket = (socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

  if (!token) {
    console.log('Socket connection rejected: No token provided');
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    socket.authenticated = true;
    console.log(`Socket authenticated for user ID: ${decoded.userId}`);
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

  // Store connected user info
  connectedUsers.set(socket.id, { userId: socket.userId });

  // Join room event
  socket.on('join-room', (data) => {
    const { roomId, username, role } = data;

    if (!roomId || !username) {
      console.log('❌ Invalid join-room data:', data);
      return;
    }

    socket.join(roomId);
    console.log(`🚪 ${username} joined room ${roomId} via gateway`);

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
    if (participant) {
      participant.isOnline = true;
      participant.socketId = socket.id;
      participant.lastSeen = new Date().toISOString();
    } else {
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
    }

    // Broadcast join message
    const joinMessage = {
      id: Date.now().toString(),
      sender: username,
      content: `${username} joined the room`,
      timestamp: new Date().toISOString(),
      roomId: roomId,
      type: 'join',
      userRole: role
    };

    socket.to(roomId).emit('user-joined', joinMessage);
    io.to(roomId).emit('participants-updated', roomParticipants[roomId]);
  });

  // Leave room event
  socket.on('leave-room', (data) => {
    const { roomId, username, role } = data;

    socket.leave(roomId);
    console.log(`${username} left room ${roomId} via gateway`);

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

    // Broadcast leave message
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

        // Save roll result to database
        await saveChatMessage(
          roomId,
          'System',
          rollMessage.content,
          null,
          'system',
          'system',
          1,
          false
        );

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

      // Save message to database
      await saveChatMessage(
        roomId,
        sender,
        content,
        gift, // media data (for gifts)
        type || 'message',
        role || 'user',
        level || 1,
        false // isPrivate
      );

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

  // User moderation events
  socket.on('kick-user', (data) => {
    const { roomId, kickedUser, kickedBy } = data;
    console.log(`Gateway relaying kick: ${kickedBy} kicked ${kickedUser} from room ${roomId}`);

    // Remove from participants
    if (roomParticipants[roomId]) {
      roomParticipants[roomId] = roomParticipants[roomId].filter(p => p.username !== kickedUser);
    }

    // Broadcast kick event
    io.to(roomId).emit('user-kicked', {
      roomId,
      kickedUser,
      kickedBy
    });

    // Send system message
    const kickMessage = {
      id: Date.now().toString(),
      sender: 'System',
      content: `${kickedUser} was kicked by ${kickedBy}`,
      timestamp: new Date().toISOString(),
      roomId: roomId,
      type: 'kick'
    };

    io.to(roomId).emit('new-message', kickMessage);
  });

  socket.on('mute-user', (data) => {
    const { roomId, mutedUser, mutedBy, action } = data;
    console.log(`Gateway relaying mute: ${mutedBy} ${action}d ${mutedUser} in room ${roomId}`);

    // Broadcast mute event
    io.to(roomId).emit('user-muted', {
      roomId,
      mutedUser,
      mutedBy,
      action
    });

    // Send system message
    const muteMessage = {
      id: Date.now().toString(),
      sender: 'System',
      content: `${mutedUser} was ${action}d by ${mutedBy}`,
      timestamp: new Date().toISOString(),
      roomId: roomId,
      type: 'mute'
    };

    io.to(roomId).emit('new-message', muteMessage);
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
      // Remove from room participants
      if (roomParticipants[userInfo.roomId]) {
        roomParticipants[userInfo.roomId] = roomParticipants[userInfo.roomId].filter(
          p => p.socketId !== socket.id
        );

        // Notify room about updated participants
        io.to(userInfo.roomId).emit('participants-updated', roomParticipants[userInfo.roomId]);

        // Broadcast leave message
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