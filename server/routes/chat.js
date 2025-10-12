const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('./auth');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Create private chat
router.post('/private', authenticateToken, async (req, res) => {
  console.log('=== CREATE PRIVATE CHAT (CHAT ROUTER) ===');
  console.log('Request participants:', req.body.participants);
  console.log('Authenticated user:', req.user.username);
  console.log('User ID:', req.user.userId);
  
  try {
    const { participants } = req.body;
    const currentUserId = req.user.userId;

    if (!participants || !Array.isArray(participants) || participants.length !== 2) {
      return res.status(400).json({ error: 'Exactly 2 participants required' });
    }

    if (!participants.includes(req.user.username)) {
      return res.status(403).json({ error: 'You must be one of the participants' });
    }

    const targetUsername = participants.find(p => p !== req.user.username);
    if (!targetUsername) {
      return res.status(400).json({ error: 'Could not determine target user' });
    }

    const targetUserResult = await pool.query(`
      SELECT id, username, status FROM users WHERE username = $1
    `, [targetUsername]);

    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({ error: `User ${targetUsername} not found` });
    }

    const targetUser = targetUserResult.rows[0];
    const targetStatus = targetUser.status || 'online';

    if (targetStatus === 'busy') {
      return res.status(423).json({ 
        error: 'This user is currently busy and cannot be contacted' 
      });
    }

    const userIds = [req.user.userId, targetUser.id].sort((a, b) => parseInt(a) - parseInt(b));
    const chatId = `private_${userIds[0]}_${userIds[1]}`;

    // Map usernames to sorted user IDs to ensure consistency
    const participant1Username = userIds[0] === currentUserId ? req.user.username : targetUser.username;
    const participant2Username = userIds[1] === currentUserId ? req.user.username : targetUser.username;

    const existingChat = await pool.query(`
      SELECT * FROM private_chats WHERE id = $1
    `, [chatId]);

    let isNewChat = false;
    if (existingChat.rows.length > 0) {
      console.log(`💬 Existing private chat found: ${chatId}`);
      res.json({
        id: chatId,
        participants,
        created_at: existingChat.rows[0].created_at,
        isExisting: true
      });
    } else {
      isNewChat = true;
      
      // Use transaction to prevent partial inserts
      const client = await pool.connect();
      let chatResult;
      try {
        await client.query('BEGIN');
        
        chatResult = await client.query(`
          INSERT INTO private_chats (id, created_by, participant1_id, participant1_username, participant2_id, participant2_username, initiated_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [chatId, req.user.username, userIds[0], participant1Username, userIds[1], participant2Username, currentUserId]);

        // Insert participants with correct ID-username mapping
        await client.query(`
          INSERT INTO private_chat_participants (chat_id, user_id, username, joined_at)
          VALUES ($1, $2, $3, NOW())
        `, [chatId, userIds[0], participant1Username]);

        await client.query(`
          INSERT INTO private_chat_participants (chat_id, user_id, username, joined_at)
          VALUES ($1, $2, $3, NOW())
        `, [chatId, userIds[1], participant2Username]);
        
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      console.log(`✅ New private chat created: ${chatId}`);
      res.json({
        id: chatId,
        participants,
        created_at: chatResult.rows[0].created_at,
        isExisting: false
      });
    }

    // Send socket notification to recipient to open private chat tab
    // This needs to be done via gateway
    const axios = require('axios');
    try {
      await axios.post('http://localhost:8000/gateway/notify-private-chat', {
        chatId,
        recipientId: targetUser.id,
        recipientUsername: targetUser.username,
        initiatorId: currentUserId,
        initiatorUsername: req.user.username,
        isNewChat
      });
      console.log(`📨 Private chat notification sent to ${targetUser.username} (ID: ${targetUser.id})`);
    } catch (notifError) {
      console.error('Error sending private chat notification:', notifError.message);
    }

  } catch (error) {
    console.error('Error creating private chat:', error);
    res.status(500).json({ error: 'Failed to create private chat' });
  }
});

// Get private chat list for user
router.get('/private/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const query = `
      SELECT 
        pc.id,
        pc.created_at,
        CASE 
          WHEN pc.participant1_id = $1 THEN u2.username
          ELSE u1.username
        END as target_username,
        CASE 
          WHEN pc.participant1_id = $1 THEN u2.id
          ELSE u1.id
        END as target_user_id,
        CASE 
          WHEN pc.participant1_id = $1 THEN u2.role
          ELSE u1.role
        END as target_role,
        CASE 
          WHEN pc.participant1_id = $1 THEN u2.level
          ELSE u1.level
        END as target_level,
        pm.message as last_message,
        pm.created_at as last_message_time,
        COUNT(CASE WHEN pm.sender_id != $1 AND pm.is_read = false THEN 1 END) as unread_count
      FROM private_chats pc
      LEFT JOIN users u1 ON pc.participant1_id = u1.id
      LEFT JOIN users u2 ON pc.participant2_id = u2.id
      LEFT JOIN private_messages pm ON pc.id = pm.chat_id
      WHERE pc.participant1_id = $1 OR pc.participant2_id = $1
      GROUP BY pc.id, u1.username, u1.id, u1.role, u1.level, u2.username, u2.id, u2.role, u2.level, pm.message, pm.created_at
      ORDER BY COALESCE(pm.created_at, pc.created_at) DESC
    `;

    const result = await pool.query(query, [userId]);

    const chatList = result.rows.map(row => ({
      id: row.id,
      name: `Chat with ${row.target_username}`,
      lastMessage: row.last_message || 'No messages yet',
      timestamp: row.last_message_time || row.created_at,
      targetUser: {
        id: row.target_user_id,
        username: row.target_username,
        role: row.target_role || 'user',
        level: row.target_level || 1
      },
      unreadCount: parseInt(row.unread_count) || 0
    }));

    res.json(chatList);

  } catch (error) {
    console.error('Error loading private chat list:', error);
    res.status(500).json({ error: 'Failed to load private chat list' });
  }
});

// Get private chat messages
router.get('/private/:chatId/messages', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.userId;

    console.log(`Loading messages for private chat: ${chatId}, User: ${userId}`);

    // Verify user is participant in this chat
    const chatQuery = `
      SELECT * FROM private_chats 
      WHERE id = $1 AND (participant1_id = $2 OR participant2_id = $2)
    `;
    const chatResult = await pool.query(chatQuery, [chatId, userId]);

    if (chatResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied to this chat' });
    }

    // Mark messages as read for this user
    await pool.query(
      'UPDATE private_messages SET is_read = true WHERE chat_id = $1 AND sender_id != $2',
      [chatId, userId]
    );

    // Get messages
    const messagesQuery = `
      SELECT 
        pm.*,
        u.username as sender,
        u.role,
        u.level
      FROM private_messages pm
      JOIN users u ON pm.sender_id = u.id
      WHERE pm.chat_id = $1
      ORDER BY pm.created_at ASC
      LIMIT 100
    `;

    const messagesResult = await pool.query(messagesQuery, [chatId]);

    const messages = messagesResult.rows.map(row => ({
      id: row.id.toString(),
      sender: row.sender,
      content: row.message,
      timestamp: row.created_at,
      roomId: chatId,
      role: row.role || 'user',
      level: row.level || 1,
      type: 'message'
    }));

    console.log(`Loaded ${messages.length} messages for private chat ${chatId}`);
    res.json(messages);

  } catch (error) {
    console.error('Error loading private chat messages:', error);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Save private chat message
router.post('/private/:chatId/messages', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content, type = 'message' } = req.body;
    const userId = req.user.userId;
    const username = req.user.username;

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const result = await pool.query(`
      INSERT INTO private_messages (
        chat_id, sender_id, message, message_type, is_read
      )
      VALUES ($1, $2, $3, $4, false)
      RETURNING *
    `, [
      chatId, 
      userId, 
      content, 
      type
    ]);

    const savedMessage = {
      id: result.rows[0].id.toString(),
      sender: username,
      content: content,
      timestamp: result.rows[0].created_at,
      roomId: chatId,
      role: req.user.role || 'user',
      level: req.user.level || 1,
      type: type
    };

    res.json(savedMessage);
  } catch (error) {
    console.error('Error saving private chat message:', error);
    res.status(500).json({ error: 'Failed to save private chat message' });
  }
});

// Clear private chat messages
router.delete('/private/:chatId/messages', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const username = req.user.username;

    const participantCheck = await pool.query(`
      SELECT 1 FROM private_chat_participants 
      WHERE chat_id = $1 AND username = $2
    `, [chatId, username]);

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a participant in this chat' });
    }

    const result = await pool.query(`
      DELETE FROM private_messages 
      WHERE chat_id = $1
    `, [chatId]);

    res.json({ 
      message: 'Private chat cleared successfully',
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('Error clearing private chat messages:', error);
    res.status(500).json({ error: 'Failed to clear private chat messages' });
  }
});

// Get chat history for user
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const username = userResult.rows[0].username;

    const privateChatQuery = await pool.query(`
      SELECT DISTINCT pc.id, pc.created_at,
             CASE 
               WHEN pcp1.username = $1 THEN pcp2.username
               ELSE pcp1.username
             END as other_username,
             'Chat with ' || CASE 
               WHEN pcp1.username = $1 THEN pcp2.username
               ELSE pcp1.username
             END as name,
             'private' as type,
             false as is_online,
             '' as last_message,
             NULL as last_message_time,
             0 as unread_count
      FROM private_chats pc
      JOIN private_chat_participants pcp1 ON pc.id = pcp1.chat_id
      JOIN private_chat_participants pcp2 ON pc.id = pcp2.chat_id AND pcp2.username != pcp1.username
      WHERE pcp1.username = $1 OR pcp2.username = $1
      ORDER BY pc.created_at DESC
      LIMIT 10
    `, [username]);

    const roomChatQuery = await pool.query(`
      SELECT DISTINCT r.id::text, r.name, r.created_at,
             'room' as type,
             false as is_online,
             '' as last_message,
             NULL as last_message_time,
             0 as unread_count
      FROM rooms r
      WHERE r.id::text IN (
        SELECT DISTINCT room_id 
        FROM chat_messages 
        WHERE user_id = $1 
        AND created_at > NOW() - INTERVAL '7 days'
      )
      ORDER BY r.created_at DESC
      LIMIT 5
    `, [userId]);

    const chatHistory = [
      ...privateChatQuery.rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        isOnline: row.is_online,
        lastMessage: row.last_message,
        lastMessageTime: row.last_message_time,
        unreadCount: row.unread_count
      })),
      ...roomChatQuery.rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        isOnline: row.is_online,
        lastMessage: row.last_message,
        lastMessageTime: row.last_message_time,
        unreadCount: row.unread_count
      }))
    ];

    res.json(chatHistory);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Get private chat notifications for user
router.get('/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get all private chats for the user with unread message counts
    const result = await pool.query(`
      SELECT 
        pc.id as chat_id,
        ARRAY[pc.participant1_username, pc.participant2_username] as participants,
        COUNT(CASE WHEN pm.is_read = false AND pm.sender_id != $1 THEN 1 END) as unread_count,
        MAX(pm.created_at) as last_message_time
      FROM private_chats pc
      LEFT JOIN private_messages pm ON pc.id = pm.chat_id
      WHERE pc.participant1_id = $1 OR pc.participant2_id = $1
      GROUP BY pc.id, pc.participant1_username, pc.participant2_username
      HAVING COUNT(CASE WHEN pm.is_read = false AND pm.sender_id != $1 THEN 1 END) > 0
      ORDER BY MAX(pm.created_at) DESC
    `, [userId]);

    const notifications = result.rows.map(row => ({
      chatId: row.chat_id,
      participants: row.participants,
      unreadCount: parseInt(row.unread_count),
      lastMessageTime: row.last_message_time
    }));

    res.json(notifications);
  } catch (error) {
    console.error('Error getting private chat notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark private chat messages as read
router.post('/mark-read', async (req, res) => {
  try {
    const { chatId, userId } = req.body;

    if (!chatId || !userId) {
      return res.status(400).json({ error: 'Chat ID and User ID are required' });
    }

    // Mark all messages in this chat as read for this user
    await pool.query(`
      UPDATE private_messages 
      SET is_read = true 
      WHERE chat_id = $1 AND sender_id != $2 AND is_read = false
    `, [chatId, userId]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;