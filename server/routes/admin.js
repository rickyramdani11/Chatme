
const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('./auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const API_BASE_URL = process.env.API_BASE_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:5000`);

// Allowed MIME types for uploads
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// File filter for security
const fileFilter = (req, file, cb) => {
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    return cb(new Error(`Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`), false);
  }
  
  const sanitizedName = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
  if (sanitizedName.length > 100) {
    return cb(new Error('Filename too long'), false);
  }
  
  cb(null, true);
};

// Multer storage configuration for emojis - redirected to assets
const storageEmoji = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'assets/emoticon/');
  },
  filename: function (req, file, cb) {
    const sanitizedName = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${sanitizedName}`;
    cb(null, uniqueName);
  }
});

const uploadEmoji = multer({ 
  storage: storageEmoji,
  fileFilter: fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

// Multer storage configuration for gifts - redirected to assets
const storageGift = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'assets/gift/image/');
  },
  filename: function (req, file, cb) {
    const sanitizedName = path.basename(file.originalname).replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}-${sanitizedName}`;
    cb(null, uniqueName);
  }
});

const uploadGift = multer({ 
  storage: storageGift,
  fileFilter: fileFilter,
  limits: { fileSize: MAX_FILE_SIZE }
});

// Admin middleware
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Audit logging middleware
const auditLog = (action, resourceType = null) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    const originalStatus = res.status.bind(res);
    let statusCode = 200;
    let responseBody = null;

    res.status = function(code) {
      statusCode = code;
      return originalStatus(code);
    };

    res.json = function(body) {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', async () => {
      try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'Unknown';
        const status = statusCode >= 200 && statusCode < 300 ? 'success' : 'failed';
        const resourceId = req.params.id || req.body?.id || null;
        
        const details = {
          method: req.method,
          path: req.path,
          params: req.params,
          body: sanitizeBody(req.body),
          statusCode
        };

        if (status === 'failed' && responseBody?.error) {
          details.error = responseBody.error;
        }

        await pool.query(`
          INSERT INTO admin_audit_logs 
          (admin_id, admin_username, action, resource_type, resource_id, details, ip_address, user_agent, status, error_message)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
          req.user.id,
          req.user.username,
          action,
          resourceType,
          resourceId,
          JSON.stringify(details),
          ip,
          userAgent,
          status,
          status === 'failed' ? (responseBody?.error || 'Unknown error') : null
        ]);

        console.log(`🔐 Audit Log: Admin ${req.user.username} performed ${action} on ${resourceType || 'system'} - Status: ${status}`);
      } catch (auditError) {
        console.error('Audit logging error:', auditError);
      }
    });

    next();
  };
};

// Sanitize sensitive data from body before logging
function sanitizeBody(body) {
  if (!body) return null;
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'pin', 'token', 'secret', 'creditCardNumber'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  }
  
  if (sanitized.emojiFile && sanitized.emojiFile.length > 100) {
    sanitized.emojiFile = `[BASE64_DATA_${sanitized.emojiFile.length}_BYTES]`;
  }
  
  if (sanitized.giftImage && sanitized.giftImage.length > 100) {
    sanitized.giftImage = `[BASE64_DATA_${sanitized.giftImage.length}_BYTES]`;
  }
  
  return sanitized;
}

// Get emojis
router.get('/emojis', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, emoji, category, created_at 
      FROM custom_emojis 
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching emojis:', error);
    res.status(500).json({ error: 'Failed to fetch emojis' });
  }
});

// Add emoji
router.post('/emojis', authenticateToken, adminOnly, auditLog('ADD_EMOJI', 'emoji'), async (req, res) => {
  try {
    const { name, category = 'general', emoji, emojiFile, emojiType, fileName } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!emojiFile && !emoji) {
      return res.status(400).json({ error: 'Either emoji file or emoji character is required' });
    }

    let emojiValue = emoji;

    if (emojiFile) {
      try {
        if (typeof emojiFile !== 'string' || emojiFile.length < 100) {
          return res.status(400).json({ error: 'Invalid emoji file data' });
        }

        const uploadDir = 'assets/emoticon';
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const fileExt = emojiType || 'png';
        const uniqueFileName = `emoji_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${uploadDir}/${uniqueFileName}`;

        const buffer = Buffer.from(emojiFile, 'base64');

        if (buffer.length > 2 * 1024 * 1024) {
          return res.status(400).json({ error: 'File too large. Maximum size is 2MB.' });
        }

        fs.writeFileSync(filePath, buffer);
        emojiValue = `/assets/emoticon/${uniqueFileName}`;

      } catch (fileError) {
        console.error('Error saving emoji file:', fileError);
        return res.status(500).json({ error: 'Failed to save emoji file: ' + fileError.message });
      }
    }

    const result = await pool.query(`
      INSERT INTO custom_emojis (name, emoji, category, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name.trim(), emojiValue, category, req.user.id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding emoji:', error);
    res.status(500).json({ error: 'Failed to add emoji: ' + error.message });
  }
});

// Delete emoji
router.delete('/emojis/:id', authenticateToken, adminOnly, auditLog('DELETE_EMOJI', 'emoji'), async (req, res) => {
  try {
    const { id } = req.params;

    const emojiResult = await pool.query('SELECT emoji FROM custom_emojis WHERE id = $1', [id]);
    if (emojiResult.rows.length > 0 && emojiResult.rows[0].emoji.startsWith('/assets/emoticon/')) {
      const filePath = emojiResult.rows[0].emoji.substring(1);
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
          if (err) console.error('Error deleting emoji file:', err);
        });
      }
    }

    await pool.query('DELETE FROM custom_emojis WHERE id = $1', [id]);
    res.json({ message: 'Emoji deleted successfully' });
  } catch (error) {
    console.error('Error deleting emoji:', error);
    res.status(500).json({ error: 'Failed to delete emoji' });
  }
});

// Get gifts
router.get('/gifts', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM custom_gifts ORDER BY created_at DESC');
    const gifts = result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      icon: row.icon,
      image: row.image,
      animation: row.animation,
      price: row.price,
      type: row.type || 'static',
      category: row.category || 'popular'
    }));

    res.json(gifts);
  } catch (error) {
    console.error('Error fetching gifts:', error);
    res.status(500).json({ error: 'Failed to fetch gifts' });
  }
});

// Add gift
router.post('/gifts', authenticateToken, adminOnly, auditLog('ADD_GIFT', 'gift'), async (req, res) => {
  try {
    const { 
      name, 
      icon, 
      price, 
      type = 'static', 
      category = 'popular', 
      giftImage, 
      imageType, 
      imageName,
      hasAnimation = false,
      animationType = null
    } = req.body;

    if (!name || !icon || !price) {
      return res.status(400).json({ error: 'Name, icon, and price are required' });
    }

    if (!giftImage) {
      return res.status(400).json({ error: 'Gift media file is required' });
    }

    let imagePath = null;
    let animationPath = null;

    if (giftImage && imageType && imageName) {
      try {
        const uploadsDir = path.resolve(__dirname, '../../assets/gift/image');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        const fileExtension = imageType.includes('/') ? imageType.split('/')[1] : imageType;
        
        // Validate file type
        const allowedExtensions = ['png', 'jpg', 'jpeg', 'gif', 'mp4', 'webm', 'mov'];
        if (!allowedExtensions.includes(fileExtension)) {
          return res.status(400).json({ 
            error: 'Invalid file type. Only PNG, JPG, JPEG, GIF, MP4, WebM, and MOV files are allowed.' 
          });
        }

        const filename = `gift_${uniqueSuffix}.${fileExtension}`;
        const filepath = path.join(uploadsDir, filename);

        const fileBuffer = Buffer.from(giftImage, 'base64');
        
        // Check file size limits
        const maxSize = ['mp4', 'webm', 'mov'].includes(fileExtension) ? 15 * 1024 * 1024 : 5 * 1024 * 1024;
        if (fileBuffer.length > maxSize) {
          return res.status(400).json({ 
            error: `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB.` 
          });
        }

        fs.writeFileSync(filepath, fileBuffer);

        const filePath = `/assets/gift/image/${filename}`;
        
        // For video files or GIFs, store as animation
        if (['mp4', 'webm', 'mov', 'gif'].includes(fileExtension)) {
          animationPath = filePath;
          // For videos, also store a thumbnail/image reference
          imagePath = filePath;
        } else {
          imagePath = filePath;
        }

        console.log('Gift file saved:', {
          filename,
          size: fileBuffer.length,
          type: imageType,
          isAnimated: hasAnimation,
          animationType
        });

      } catch (error) {
        console.error('Error saving gift file:', error);
        return res.status(500).json({ error: 'Failed to save gift file' });
      }
    }

    const result = await pool.query(`
      INSERT INTO custom_gifts (name, icon, image, animation, price, type, category, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [name, icon, imagePath, animationPath, parseInt(price), type, category, req.user.id]);

    const gift = result.rows[0];
    if (gift.image) {
      gift.image = `${API_BASE_URL}${gift.image}`;
    }
    if (gift.animation) {
      gift.animation = `${API_BASE_URL}${gift.animation}`;
    }

    res.json(gift);
  } catch (error) {
    console.error('Error adding gift:', error);
    res.status(500).json({ error: 'Failed to add gift' });
  }
});

// Delete gift
router.delete('/gifts/:id', authenticateToken, adminOnly, auditLog('DELETE_GIFT', 'gift'), async (req, res) => {
  try {
    const { id } = req.params;

    const giftResult = await pool.query('SELECT animation FROM custom_gifts WHERE id = $1', [id]);
    if (giftResult.rows.length > 0 && giftResult.rows[0].animation) {
      const filePath = giftResult.rows[0].animation.substring(1);
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
          if (err) console.error('Error deleting gift file:', err);
        });
      }
    }

    await pool.query('DELETE FROM custom_gifts WHERE id = $1', [id]);
    res.json({ message: 'Gift deleted successfully' });
  } catch (error) {
    console.error('Error deleting gift:', error);
    res.status(500).json({ error: 'Failed to delete gift' });
  }
});

// Get all rooms (admin only)
router.get('/rooms', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        description,
        managed_by,
        type,
        members,
        max_members,
        created_by,
        created_at
      FROM rooms 
      ORDER BY created_at DESC
    `);

    const rooms = result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      managedBy: row.managed_by,
      createdBy: row.created_by,
      type: row.type,
      members: row.members || 0,
      maxMembers: row.max_members || 25,
      createdAt: row.created_at
    }));

    res.json({ rooms });
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
});

// Update room (admin only)
router.put('/rooms/:roomId', authenticateToken, adminOnly, auditLog('UPDATE_ROOM', 'room'), async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name, description, maxMembers, managedBy } = req.body;

    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }

    if (!maxMembers || ![25, 40, 80].includes(maxMembers)) {
      return res.status(400).json({ error: 'Invalid max members. Must be 25, 40, or 80' });
    }

    const roomCheck = await pool.query('SELECT id FROM rooms WHERE id = $1', [roomId]);
    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const nameCheck = await pool.query(
      'SELECT id FROM rooms WHERE LOWER(name) = LOWER($1) AND id != $2',
      [name.trim(), roomId]
    );

    if (nameCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Room name already exists' });
    }

    const result = await pool.query(`
      UPDATE rooms 
      SET 
        name = $1,
        description = $2,
        max_members = $3,
        managed_by = $4
      WHERE id = $5
      RETURNING *
    `, [name.trim(), description.trim(), maxMembers, managedBy?.trim(), roomId]);

    const updatedRoom = result.rows[0];

    res.json({ 
      message: 'Room updated successfully',
      room: updatedRoom
    });

  } catch (error) {
    console.error('Error updating room:', error);
    res.status(500).json({ error: 'Failed to update room' });
  }
});

// Delete room (admin only)
router.delete('/rooms/:roomId', authenticateToken, adminOnly, auditLog('DELETE_ROOM', 'room'), async (req, res) => {
  try {
    const { roomId } = req.params;

    const roomCheck = await pool.query('SELECT name FROM rooms WHERE id = $1', [roomId]);
    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const roomName = roomCheck.rows[0].name;

    await pool.query('DELETE FROM chat_messages WHERE room_id = $1', [roomId]);
    await pool.query('DELETE FROM room_banned_users WHERE room_id = $1', [roomId]);
    await pool.query('DELETE FROM room_security WHERE room_id = $1', [roomId]);
    await pool.query('DELETE FROM room_moderators WHERE room_id = $1', [roomId]);
    await pool.query('DELETE FROM rooms WHERE id = $1', [roomId]);

    res.json({ 
      message: 'Room deleted successfully',
      roomName: roomName
    });

  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

module.exports = router;
