
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
  try {
    const { participants, initiatedBy, targetUserId } = req.body;
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

    const existingChat = await pool.query(`
      SELECT * FROM private_chats WHERE id = $1
    `, [chatId]);

    if (existingChat.rows.length > 0) {
      return res.json({
        id: chatId,
        participants,
        created_at: existingChat.rows[0].created_at,
        isExisting: true
      });
    }

    const chatResult = await pool.query(`
      INSERT INTO private_chats (id, participant1_id, participant1_username, participant2_id, participant2_username, initiated_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [chatId, userIds[0], participants[0], userIds[1], participants[1], initiatedBy]);

    for (let i = 0; i < participants.length; i++) {
      await pool.query(`
        INSERT INTO private_chat_participants (chat_id, user_id, username, joined_at)
        VALUES ($1, $2, $3, NOW())
      `, [chatId, parseInt(userIds[i]), participants[i]]);
    }

    res.json({
      id: chatId,
      participants,
      created_at: chatResult.rows[0].created_at,
      isExisting: false
    });

  } catch (error) {
    console.error('Error creating private chat:', error);
    res.status(500).json({ error: 'Failed to create private chat' });
  }
});

// Get private chat messages
router.get('/private/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;

    const result = await pool.query(`
      SELECT cm.*, u.role, u.level 
      FROM chat_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.room_id = $1 AND cm.is_private = true
      ORDER BY cm.created_at ASC
    `, [chatId]);

    const messages = result.rows.map(row => ({
      id: row.id.toString(),
      sender: row.username,
      content: row.content,
      timestamp: row.created_at,
      roomId: row.room_id,
      role: row.role || 'user',
      level: row.level || 1,
      type: row.message_type || 'message'
    }));

    res.json(messages);
  } catch (error) {
    console.error('Error fetching private chat messages:', error);
    res.status(500).json({ error: 'Failed to fetch private chat messages' });
  }
});

// Save private chat message
router.post('/private/:chatId/messages', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content, type = 'message' } = req.body;
    const userId = req.user.id;
    const username = req.user.username;

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const result = await pool.query(`
      INSERT INTO chat_messages (
        room_id, user_id, username, content, message_type, 
        user_role, user_level, is_private
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING *
    `, [
      chatId, 
      userId, 
      username, 
      content, 
      type,
      req.user.role || 'user',
      req.user.level || 1
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
      DELETE FROM chat_messages 
      WHERE room_id = $1 AND is_private = true
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

module.exports = router;
