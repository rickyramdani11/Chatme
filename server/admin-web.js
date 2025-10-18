
const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
// const { Pool } = require('pg');
const pool = require( './config/dbx.js');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.ADMIN_PORT || 3001;

// Fail fast if JWT_SECRET is missing
if (!process.env.JWT_SECRET) {
  console.error('❌ CRITICAL: JWT_SECRET environment variable is not set!');
  console.error('❌ Admin authentication is INSECURE without a proper JWT secret.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// Database configuration
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
// });

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('server/admin-public'));

// Multer for file uploads with security
const ALLOWED_BANNER_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const MAX_BANNER_SIZE = 10 * 1024 * 1024; // 10MB

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_BANNER_TYPES.includes(file.mimetype)) {
    return cb(new Error(`Invalid file type. Allowed: ${ALLOWED_BANNER_TYPES.join(', ')}`), false);
  }
  cb(null, true);
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Hardcoded safe directory - NEVER use client-controlled fieldname in path!
    const SAFE_UPLOAD_DIR = 'uploads/banners';
    
    // Validate expected field name strictly
    if (file.fieldname !== 'banner') {
      return cb(new Error('Invalid field name. Expected: banner'), false);
    }
    
    if (!fs.existsSync(SAFE_UPLOAD_DIR)) {
      fs.mkdirSync(SAFE_UPLOAD_DIR, { recursive: true });
    }
    cb(null, SAFE_UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const crypto = require('crypto');
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const sanitizedName = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${Date.now()}-${randomSuffix}-${sanitizedName}`;
    cb(null, filename);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: MAX_BANNER_SIZE }
});

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userResult = await pool.query(
      'SELECT id, username, role FROM users WHERE id = $1 AND role = $2',
      [decoded.userId, 'admin']
    );

    if (userResult.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    req.user = userResult.rows[0];
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// Rate limiting for admin operations
const rateLimitStore = new Map();

const rateLimit = (maxRequests = 10, windowMs = 60000) => {
  return (req, res, next) => {
    if (!req.user) return next();
    const key = `${req.user.id}-${req.path}`;
    const now = Date.now();
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, []);
    }
    
    const requests = rateLimitStore.get(key).filter(time => now - time < windowMs);
    
    if (requests.length >= maxRequests) {
      return res.status(429).json({ 
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((requests[0] + windowMs - now) / 1000)
      });
    }
    
    requests.push(now);
    rateLimitStore.set(key, requests);
    
    next();
  };
};

// Audit logging middleware
const auditLog = (action, resourceType = null) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    let statusCode = 200;
    let responseBody = null;

    res.json = function(body) {
      responseBody = body;
      statusCode = res.statusCode || 200;
      return originalJson(body);
    };

    res.on('finish', async () => {
      try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const status = statusCode >= 200 && statusCode < 300 ? 'success' : 'failed';
        const resourceId = req.params.roomId || req.params.bannerId || req.body?.id || null;
        
        await pool.query(`
          INSERT INTO admin_audit_logs 
          (admin_id, admin_username, action, resource_type, resource_id, details, ip_address, user_agent, status, error_message)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          req.user?.id,
          req.user?.username,
          action,
          resourceType,
          resourceId,
          JSON.stringify({ method: req.method, path: req.path, statusCode }),
          ip,
          userAgent,
          status,
          status === 'failed' ? (responseBody?.error || 'Unknown error') : null
        ]);

        console.log(`🔐 Audit: ${req.user?.username} - ${action} on ${resourceType || 'system'} - ${status}`);
      } catch (auditError) {
        console.error('Audit logging error:', auditError);
      }
    });

    next();
  };
};

setInterval(() => {
  const now = Date.now();
  for (const [key, requests] of rateLimitStore.entries()) {
    const validRequests = requests.filter(time => now - time < 60000);
    if (validRequests.length === 0) {
      rateLimitStore.delete(key);
    } else {
      rateLimitStore.set(key, validRequests);
    }
  }
}, 60000);

// Admin login endpoint
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if user exists and has admin role
    const result = await pool.query(
      'SELECT id, username, password, role FROM users WHERE username = $1 AND role = $2',
      [username, 'admin']
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials or insufficient permissions' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Dashboard endpoint
app.get('/api/admin/dashboard', authenticateAdmin, async (req, res) => {
  try {
    // Get statistics
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const roomsCount = await pool.query('SELECT COUNT(*) FROM rooms');
    const postsCount = await pool.query('SELECT COUNT(*) FROM posts');
    const messagesCount = await pool.query('SELECT COUNT(*) FROM chat_messages WHERE created_at > NOW() - INTERVAL \'24 hours\'');

    // Get recent users
    const recentUsers = await pool.query(`
      SELECT id, username, email, role, verified, created_at 
      FROM users 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    // Get active rooms
    const activeRooms = await pool.query(`
      SELECT id, name, members, max_members, created_at 
      FROM rooms 
      ORDER BY members DESC 
      LIMIT 10
    `);

    res.json({
      stats: {
        totalUsers: parseInt(usersCount.rows[0].count),
        totalRooms: parseInt(roomsCount.rows[0].count),
        totalPosts: parseInt(postsCount.rows[0].count),
        todayMessages: parseInt(messagesCount.rows[0].count)
      },
      recentUsers: recentUsers.rows,
      activeRooms: activeRooms.rows
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// Users management
app.get('/api/admin/users', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', role = '' } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT id, username, email, role, verified, created_at, last_login
      FROM users
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (search) {
      query += ` AND (username ILIKE $${paramCount} OR email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (role) {
      query += ` AND role = $${paramCount}`;
      params.push(role);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM users WHERE ($1 = \'\' OR username ILIKE $1 OR email ILIKE $1) AND ($2 = \'\' OR role = $2)',
      [`%${search}%`, role]
    );

    res.json({
      users: result.rows,
      total: parseInt(countResult.rows[0].count),
      currentPage: parseInt(page),
      totalPages: Math.ceil(countResult.rows[0].count / limit)
    });
  } catch (error) {
    console.error('Users fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Promote user
app.post('/api/admin/users/:userId/promote', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { newRole } = req.body;

    if (!['user', 'merchant', 'mentor', 'admin'].includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2',
      [newRole, userId]
    );

    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Promote user error:', error);
    res.status(500).json({ error: 'Failed to promote user' });
  }
});

// Rooms management
app.get('/api/admin/rooms', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, managed_by, members, max_members, created_at
      FROM rooms
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Rooms fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Delete room
app.delete('/api/admin/rooms/:roomId', authenticateAdmin, rateLimit(5, 60000), auditLog('DELETE_ROOM', 'room'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { roomId } = req.params;

    await client.query('BEGIN');

    // Delete all related data in a transaction to prevent partial deletes
    await client.query('DELETE FROM chat_messages WHERE room_id = $1', [roomId]);
    await client.query('DELETE FROM room_banned_users WHERE room_id = $1', [roomId]);
    await client.query('DELETE FROM room_security WHERE room_id = $1', [roomId]);
    await client.query('DELETE FROM room_moderators WHERE room_id = $1', [roomId]);
    await client.query('DELETE FROM rooms WHERE id = $1', [roomId]);

    await client.query('COMMIT');

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete room error:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  } finally {
    client.release();
  }
});

// Banners management
app.get('/api/admin/banners', authenticateAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM banners ORDER BY display_order ASC, created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Banners fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

// Create banner
app.post('/api/admin/banners', authenticateAdmin, rateLimit(10, 60000), auditLog('CREATE_BANNER', 'banner'), upload.single('banner'), async (req, res) => {
  try {
    const { title, description, linkUrl, displayOrder } = req.body;
    const imageUrl = req.file ? `/uploads/banners/${req.file.filename}` : null;

    const result = await pool.query(`
      INSERT INTO banners (title, description, image_url, link_url, display_order, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `, [title, description, imageUrl, linkUrl, displayOrder || 0]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create banner error:', error);
    res.status(500).json({ error: 'Failed to create banner' });
  }
});

// Serve admin panel HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin-public', 'index.html'));
});

// Serve uploads
app.use('/uploads', express.static('uploads'));

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🔧 Admin Panel running on port ${PORT}`);
  console.log(`🌐 Admin Panel accessible at: http://0.0.0.0:${PORT}`);
  console.log(`👨‍💼 Access: Only users with admin role can login`);
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('✅ Admin Panel connected to database');
    release();
  }
});
