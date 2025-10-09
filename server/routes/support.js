
const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('./auth');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Initialize support tables
const initSupportTables = async () => {
  try {
    // Support tickets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        username VARCHAR(50) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        priority VARCHAR(20) DEFAULT 'normal',
        status VARCHAR(20) DEFAULT 'open',
        assigned_to INTEGER,
        assigned_to_username VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP
      )
    `);

    // Support messages table for ticket communication
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_messages (
        id SERIAL PRIMARY KEY,
        ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        username VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // FAQ categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS faq_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        icon VARCHAR(50),
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // FAQ items table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS faq_items (
        id SERIAL PRIMARY KEY,
        category_id INTEGER REFERENCES faq_categories(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        display_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Live chat sessions table (no room needed)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS live_chat_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        username VARCHAR(50) NOT NULL,
        admin_id INTEGER,
        admin_username VARCHAR(50),
        session_status VARCHAR(20) DEFAULT 'waiting',
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        rating INTEGER,
        feedback TEXT
      )
    `);
    
    // Support chat messages table (separate from rooms)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_chat_messages (
        id SERIAL PRIMARY KEY,
        session_id INTEGER REFERENCES live_chat_sessions(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        username VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        is_admin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Support system tables initialized successfully');

    // Insert default FAQ categories if none exist
    const categoriesCount = await pool.query('SELECT COUNT(*) FROM faq_categories');
    if (parseInt(categoriesCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO faq_categories (name, description, icon, display_order, is_active) VALUES
        ('Akun & Profil', 'Pertanyaan seputar akun dan pengaturan profil', 'person', 1, true),
        ('Chat & Ruangan', 'Bantuan penggunaan fitur chat dan ruangan', 'chatbubbles', 2, true),
        ('Koin & Hadiah', 'Informasi tentang sistem koin dan hadiah', 'gift', 3, true),
        ('Keamanan', 'Tips keamanan dan privasi akun', 'shield', 4, true),
        ('Teknis', 'Masalah teknis dan troubleshooting', 'construct', 5, true)
      `);

      // Insert default FAQ items
      await pool.query(`
        INSERT INTO faq_items (category_id, question, answer, display_order) VALUES
        (1, 'Bagaimana cara mengubah nama pengguna?', 'Anda dapat mengubah nama pengguna melalui menu Pengaturan > Edit Profil. Pastikan nama yang dipilih belum digunakan oleh pengguna lain.', 1),
        (1, 'Bagaimana cara menambahkan foto profil?', 'Buka profil Anda, ketuk ikon kamera, lalu pilih foto dari galeri atau ambil foto baru. Foto akan otomatis tersimpan setelah dipilih.', 2),
        (2, 'Bagaimana cara membuat ruangan chat?', 'Dari halaman utama, ketuk tombol "+" di pojok kanan atas, isi nama dan deskripsi ruangan, pilih kapasitas, lalu ketuk "Buat Ruangan".', 1),
        (2, 'Apa itu ruangan pribadi?', 'Ruangan pribadi adalah chat yang hanya bisa diakses oleh dua orang. Anda bisa memulai chat pribadi dengan mengetuk profil pengguna lain.', 2),
        (3, 'Bagaimana cara mendapatkan koin?', 'Koin bisa didapatkan melalui login harian, menyelesaikan tugas, menerima hadiah dari pengguna lain, atau membeli melalui in-app purchase.', 1),
        (3, 'Bagaimana cara mengirim hadiah?', 'Dalam chat, ketuk ikon hadiah, pilih hadiah yang diinginkan, pastikan saldo mencukupi, lalu ketuk "Kirim". Hadiah akan langsung terkirim.', 2)
      `);

      console.log('✅ Default FAQ data created');
    }

  } catch (error) {
    console.error('Error initializing support tables:', error);
  }
};

// Initialize tables on module load
initSupportTables();

// Get support tickets (user's own tickets)
router.get('/tickets', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, page = 1, limit = 10 } = req.query;

    let query = `
      SELECT 
        st.*,
        COUNT(sm.id) as message_count,
        MAX(sm.created_at) as last_message_at
      FROM support_tickets st
      LEFT JOIN support_messages sm ON st.id = sm.ticket_id
      WHERE st.user_id = $1
    `;
    
    const params = [userId];
    let paramCount = 1;

    if (status && status !== 'all') {
      paramCount++;
      query += ` AND st.status = $${paramCount}`;
      params.push(status);
    }

    query += `
      GROUP BY st.id
      ORDER BY st.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `;
    
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await pool.query(query, params);

    const tickets = result.rows.map(row => ({
      id: row.id.toString(),
      subject: row.subject,
      description: row.description,
      category: row.category,
      priority: row.priority,
      status: row.status,
      messageCount: parseInt(row.message_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessageAt: row.last_message_at
    }));

    res.json({ tickets, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error('Error fetching support tickets:', error);
    res.status(500).json({ error: 'Failed to fetch support tickets' });
  }
});

// Create new support ticket
router.post('/tickets', authenticateToken, async (req, res) => {
  try {
    const { subject, description, category = 'general', priority = 'normal' } = req.body;
    const userId = req.user.id;
    const username = req.user.username;

    if (!subject || !description) {
      return res.status(400).json({ error: 'Subject and description are required' });
    }

    // Generate unique ticket ID
    const ticketId = `TICK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const result = await pool.query(`
      INSERT INTO support_tickets (ticket_id, user_id, subject, message, category, priority)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [ticketId, userId, subject.trim(), description.trim(), category, priority]);

    const ticket = result.rows[0];

    res.status(201).json({
      success: true,
      ticket: {
        id: ticket.id.toString(),
        userId: ticket.user_id.toString(),
        username: username,
        subject: ticket.subject,
        description: ticket.message,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        createdAt: ticket.created_at
      }
    });
  } catch (error) {
    console.error('Error creating support ticket:', error);
    res.status(500).json({ error: 'Failed to create support ticket' });
  }
});

// Get FAQ categories
router.get('/faq/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, icon, display_order
      FROM faq_categories
      WHERE is_active = true
      ORDER BY display_order ASC, name ASC
    `);

    const categories = result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      icon: row.icon,
      displayOrder: row.display_order
    }));

    res.json(categories);
  } catch (error) {
    console.error('Error fetching FAQ categories:', error);
    res.status(500).json({ error: 'Failed to fetch FAQ categories' });
  }
});

// Get FAQ items by category
router.get('/faq/:category', async (req, res) => {
  try {
    const { category } = req.params;

    // If category is numeric, treat as category ID, otherwise as category name
    const isNumeric = /^\d+$/.test(category);
    let query, params;

    if (isNumeric) {
      query = `
        SELECT fi.id, fi.question, fi.answer, fi.display_order,
               fc.name as category_name
        FROM faq_items fi
        JOIN faq_categories fc ON fi.category_id = fc.id
        WHERE fi.category_id = $1 AND fi.is_active = true
        ORDER BY fi.display_order ASC, fi.id ASC
      `;
      params = [parseInt(category)];
    } else {
      query = `
        SELECT fi.id, fi.question, fi.answer, fi.display_order,
               fc.name as category_name
        FROM faq_items fi
        JOIN faq_categories fc ON fi.category_id = fc.id
        WHERE LOWER(fc.name) = LOWER($1) AND fi.is_active = true
        ORDER BY fi.display_order ASC, fi.id ASC
      `;
      params = [category];
    }

    const result = await pool.query(query, params);

    const faqItems = result.rows.map(row => ({
      id: row.id.toString(),
      question: row.question,
      answer: row.answer,
      displayOrder: row.display_order,
      categoryName: row.category_name
    }));

    res.json(faqItems);
  } catch (error) {
    console.error('Error fetching FAQ items:', error);
    res.status(500).json({ error: 'Failed to fetch FAQ items' });
  }
});

// Get live chat availability status
router.get('/live-chat/status', async (req, res) => {
  try {
    // Check if there are available admins (simplified check)
    const adminCount = await pool.query(
      "SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'online'"
    );

    const isAvailable = parseInt(adminCount.rows[0].count) > 0;

    res.json({
      available: isAvailable,
      estimatedWaitTime: isAvailable ? '< 5 menit' : 'Tidak tersedia',
      message: isAvailable 
        ? 'Tim support siap membantu Anda' 
        : 'Semua admin sedang tidak tersedia. Silakan buat tiket support.'
    });
  } catch (error) {
    console.error('Error checking live chat status:', error);
    res.status(500).json({ error: 'Failed to check live chat status' });
  }
});

// Start live chat session (NO room creation - separate chat system)
router.post('/live-chat/start', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const username = req.user.username;

    // Check if user already has an active session
    const existingSession = await pool.query(`
      SELECT id FROM live_chat_sessions 
      WHERE user_id = $1 AND session_status IN ('waiting', 'active')
    `, [userId]);

    // If existing session found, close it first
    if (existingSession.rows.length > 0) {
      await pool.query(`
        UPDATE live_chat_sessions 
        SET session_status = 'ended', ended_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND session_status IN ('waiting', 'active')
      `, [userId]);
    }

    // Find available admin
    const adminResult = await pool.query(`
      SELECT id, username FROM users 
      WHERE role = 'admin' AND status = 'online'
      ORDER BY RANDOM()
      LIMIT 1
    `);

    let adminId = null;
    let adminUsername = 'Support';
    
    if (adminResult.rows.length > 0) {
      adminId = adminResult.rows[0].id;
      adminUsername = adminResult.rows[0].username;
    }

    // Create new live chat session (NO ROOM - separate chat system)
    const sessionResult = await pool.query(`
      INSERT INTO live_chat_sessions (user_id, username, admin_id, admin_username, session_status)
      VALUES ($1, $2, $3, $4, 'active')
      RETURNING *
    `, [userId, username, adminId, adminUsername]);

    const session = sessionResult.rows[0];

    res.json({
      success: true,
      message: `Terhubung dengan ${adminUsername}`,
      adminUsername: adminUsername,
      session: {
        id: session.id.toString(),
        status: session.session_status,
        startedAt: session.started_at
      }
    });
  } catch (error) {
    console.error('Error starting live chat:', error);
    res.status(500).json({ error: 'Failed to start live chat session' });
  }
});

// Get live chat messages (separate from rooms)
router.get('/live-chat/:sessionId/messages', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    // Verify session ownership or admin access
    const sessionCheck = await pool.query(
      `SELECT id, user_id FROM live_chat_sessions 
       WHERE id = $1 AND (user_id = $2 OR EXISTS (SELECT 1 FROM users WHERE id = $2 AND role = 'admin'))`,
      [sessionId, userId]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or access denied' });
    }

    const result = await pool.query(`
      SELECT * FROM support_chat_messages
      WHERE session_id = $1
      ORDER BY created_at ASC
    `, [sessionId]);

    const messages = result.rows.map(row => ({
      id: row.id.toString(),
      message: row.message,
      username: row.username,
      isAdmin: row.is_admin,
      createdAt: row.created_at
    }));

    res.json(messages);
  } catch (error) {
    console.error('Error fetching live chat messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send message to live chat (separate from rooms)
router.post('/live-chat/:sessionId/messages', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;
    const username = req.user.username;
    const isAdmin = req.user.role === 'admin';

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Verify session ownership or admin access
    const sessionCheck = await pool.query(
      `SELECT id, session_status FROM live_chat_sessions 
       WHERE id = $1 AND (user_id = $2 OR EXISTS (SELECT 1 FROM users WHERE id = $2 AND role = 'admin'))`,
      [sessionId, userId]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found or access denied' });
    }

    const session = sessionCheck.rows[0];

    if (session.session_status === 'ended') {
      return res.status(400).json({ error: 'Cannot send message to ended session' });
    }

    // Add message to support chat
    const result = await pool.query(`
      INSERT INTO support_chat_messages (session_id, user_id, username, message, is_admin)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [sessionId, userId, username, message.trim(), isAdmin]);

    const newMessage = result.rows[0];

    res.status(201).json({
      success: true,
      message: {
        id: newMessage.id.toString(),
        message: newMessage.message,
        username: newMessage.username,
        isAdmin: newMessage.is_admin,
        createdAt: newMessage.created_at
      }
    });
  } catch (error) {
    console.error('Error sending live chat message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Get ticket messages
router.get('/tickets/:ticketId/messages', authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user.id;

    // Verify ticket ownership
    const ticketCheck = await pool.query(
      'SELECT id FROM support_tickets WHERE id = $1 AND user_id = $2',
      [ticketId, userId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found or access denied' });
    }

    const result = await pool.query(`
      SELECT * FROM support_messages
      WHERE ticket_id = $1
      ORDER BY created_at ASC
    `, [ticketId]);

    const messages = result.rows.map(row => ({
      id: row.id.toString(),
      message: row.message,
      username: row.username,
      isAdmin: row.is_admin,
      createdAt: row.created_at
    }));

    res.json(messages);
  } catch (error) {
    console.error('Error fetching ticket messages:', error);
    res.status(500).json({ error: 'Failed to fetch ticket messages' });
  }
});

// Add message to ticket
router.post('/tickets/:ticketId/messages', authenticateToken, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;
    const username = req.user.username;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Verify ticket ownership
    const ticketCheck = await pool.query(
      'SELECT id, status FROM support_tickets WHERE id = $1 AND user_id = $2',
      [ticketId, userId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found or access denied' });
    }

    const ticket = ticketCheck.rows[0];

    if (ticket.status === 'closed') {
      return res.status(400).json({ error: 'Cannot add message to closed ticket' });
    }

    // Add message
    const result = await pool.query(`
      INSERT INTO support_messages (ticket_id, user_id, username, message, is_admin)
      VALUES ($1, $2, $3, $4, false)
      RETURNING *
    `, [ticketId, userId, username, message.trim()]);

    // Update ticket updated_at
    await pool.query(
      'UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [ticketId]
    );

    const newMessage = result.rows[0];

    res.status(201).json({
      success: true,
      message: {
        id: newMessage.id.toString(),
        message: newMessage.message,
        username: newMessage.username,
        isAdmin: newMessage.is_admin,
        createdAt: newMessage.created_at
      }
    });
  } catch (error) {
    console.error('Error adding ticket message:', error);
    res.status(500).json({ error: 'Failed to add message to ticket' });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// Middleware to check admin role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Get all support tickets (admin only)
router.get('/admin/tickets', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { status, priority, category, page = 1, limit = 20 } = req.query;

    let query = `
      SELECT 
        st.id,
        st.user_id,
        u.username,
        st.subject,
        st.message as description,
        st.category,
        st.priority,
        st.status,
        NULL as assigned_to,
        NULL as assigned_to_username,
        st.created_at,
        st.updated_at,
        NULL as resolved_at,
        COUNT(sm.id) as message_count,
        MAX(sm.created_at) as last_message_at
      FROM support_tickets st
      LEFT JOIN users u ON st.user_id = u.id
      LEFT JOIN support_messages sm ON st.id = sm.ticket_id
    `;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`st.status = $${paramIndex++}`);
      params.push(status);
    }

    if (priority) {
      conditions.push(`st.priority = $${paramIndex++}`);
      params.push(priority);
    }

    if (category) {
      conditions.push(`st.category = $${paramIndex++}`);
      params.push(category);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += `
      GROUP BY st.id, st.user_id, u.username, st.subject, st.message, st.category, st.priority, st.status, st.created_at, st.updated_at
      ORDER BY 
        CASE st.status 
          WHEN 'open' THEN 1 
          WHEN 'in_progress' THEN 2 
          WHEN 'resolved' THEN 3 
          WHEN 'closed' THEN 4 
        END,
        st.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await pool.query(query, params);

    const tickets = result.rows.map(row => ({
      id: row.id.toString(),
      userId: row.user_id.toString(),
      username: row.username,
      subject: row.subject,
      description: row.description,
      category: row.category,
      priority: row.priority,
      status: row.status,
      assignedTo: row.assigned_to ? row.assigned_to.toString() : null,
      assignedToUsername: row.assigned_to_username,
      messageCount: parseInt(row.message_count),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
      lastMessageAt: row.last_message_at
    }));

    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM support_tickets';
    const countConditions = [];
    const countParams = [];
    let countParamIndex = 1;

    if (status) {
      countConditions.push(`status = $${countParamIndex++}`);
      countParams.push(status);
    }
    if (priority) {
      countConditions.push(`priority = $${countParamIndex++}`);
      countParams.push(priority);
    }
    if (category) {
      countConditions.push(`category = $${countParamIndex++}`);
      countParams.push(category);
    }

    if (countConditions.length > 0) {
      countQuery += ' WHERE ' + countConditions.join(' AND ');
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({ 
      tickets, 
      page: parseInt(page), 
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    console.error('Error fetching admin tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

// Get ticket messages (admin can view any ticket)
router.get('/admin/tickets/:ticketId/messages', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ticketId } = req.params;

    const result = await pool.query(`
      SELECT id, user_id, username, message, is_admin, created_at
      FROM support_messages
      WHERE ticket_id = $1
      ORDER BY created_at ASC
    `, [ticketId]);

    const messages = result.rows.map(row => ({
      id: row.id.toString(),
      userId: row.user_id.toString(),
      message: row.message,
      username: row.username,
      isAdmin: row.is_admin,
      createdAt: row.created_at
    }));

    res.json(messages);
  } catch (error) {
    console.error('Error fetching admin ticket messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Reply to ticket (admin only)
router.post('/admin/tickets/:ticketId/reply', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { message } = req.body;
    const adminId = req.user.id;
    const adminUsername = req.user.username;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if ticket exists
    const ticketCheck = await pool.query(
      'SELECT id, status, user_id FROM support_tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketCheck.rows[0];

    // Add admin reply
    const result = await pool.query(`
      INSERT INTO support_messages (ticket_id, user_id, username, message, is_admin)
      VALUES ($1, $2, $3, $4, true)
      RETURNING *
    `, [ticketId, adminId, adminUsername, message.trim()]);

    // Update ticket status to in_progress if it was open
    // and assign to this admin if not assigned
    await pool.query(`
      UPDATE support_tickets 
      SET 
        status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
        assigned_to = COALESCE(assigned_to, $1),
        assigned_to_username = COALESCE(assigned_to_username, $2),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [adminId, adminUsername, ticketId]);

    const newMessage = result.rows[0];

    res.status(201).json({
      success: true,
      message: {
        id: newMessage.id.toString(),
        message: newMessage.message,
        username: newMessage.username,
        isAdmin: newMessage.is_admin,
        createdAt: newMessage.created_at
      }
    });
  } catch (error) {
    console.error('Error adding admin reply:', error);
    res.status(500).json({ error: 'Failed to add reply' });
  }
});

// Update ticket status (admin only)
router.put('/admin/tickets/:ticketId/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { status } = req.body;

    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData = {
      status,
      updated_at: new Date()
    };

    // Set resolved_at when status is resolved or closed
    if (status === 'resolved' || status === 'closed') {
      updateData.resolved_at = new Date();
    }

    const result = await pool.query(`
      UPDATE support_tickets 
      SET 
        status = $1,
        updated_at = CURRENT_TIMESTAMP,
        resolved_at = CASE WHEN $1 IN ('resolved', 'closed') THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE resolved_at END
      WHERE id = $2
      RETURNING *
    `, [status, ticketId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = result.rows[0];

    res.json({
      success: true,
      ticket: {
        id: ticket.id.toString(),
        status: ticket.status,
        updatedAt: ticket.updated_at,
        resolvedAt: ticket.resolved_at
      }
    });
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
});

// Assign ticket to admin (admin only)
router.put('/admin/tickets/:ticketId/assign', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { adminId, adminUsername } = req.body;

    const result = await pool.query(`
      UPDATE support_tickets 
      SET 
        assigned_to = $1,
        assigned_to_username = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `, [adminId, adminUsername, ticketId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = result.rows[0];

    res.json({
      success: true,
      ticket: {
        id: ticket.id.toString(),
        assignedTo: ticket.assigned_to ? ticket.assigned_to.toString() : null,
        assignedToUsername: ticket.assigned_to_username,
        updatedAt: ticket.updated_at
      }
    });
  } catch (error) {
    console.error('Error assigning ticket:', error);
    res.status(500).json({ error: 'Failed to assign ticket' });
  }
});

// Get ticket statistics (admin only)
router.get('/admin/tickets/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'open') as open_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_count,
        COUNT(*) as total_count
      FROM support_tickets
    `);

    res.json(stats.rows[0]);
  } catch (error) {
    console.error('Error fetching ticket stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;
