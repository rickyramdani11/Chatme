
const express = require('express');
// const { Pool } = require('pg');
const pool = require ('../config/db.js');
const { authenticateToken } = require('./auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcrypt');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const router = express.Router();
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
// });

const API_BASE_URL = process.env.API_BASE_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:5000`);

// Super admin whitelist for sensitive operations
const SUPER_ADMIN_IDS = [1, 4];

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

// Rate limiting for admin operations
const rateLimitStore = new Map();

const rateLimit = (maxRequests = 10, windowMs = 60000) => {
  return (req, res, next) => {
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
  const base64Fields = ['emojiFile', 'giftImage', 'bannerImage', 'imageData'];
  
  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  }
  
  for (const field of base64Fields) {
    if (sanitized[field] && sanitized[field].length > 100) {
      sanitized[field] = `[BASE64_DATA_${sanitized[field].length}_BYTES]`;
    }
  }
  
  return sanitized;
}

// Validate base64 image type and content
function validateBase64Image(base64Data, allowedTypes = ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
  if (!base64Data || typeof base64Data !== 'string') {
    return { valid: false, error: 'Invalid base64 data' };
  }
  
  if (base64Data.length < 100) {
    return { valid: false, error: 'Base64 data too short' };
  }
  
  if (base64Data.length > 10 * 1024 * 1024) {
    return { valid: false, error: 'File too large. Maximum size is 10MB' };
  }
  
  const buffer = Buffer.from(base64Data, 'base64');
  
  const magicNumbers = {
    'png': [0x89, 0x50, 0x4E, 0x47],
    'jpg': [0xFF, 0xD8, 0xFF],
    'jpeg': [0xFF, 0xD8, 0xFF],
    'gif': [0x47, 0x49, 0x46],
    'webp': [0x52, 0x49, 0x46, 0x46]
  };
  
  let detectedType = null;
  for (const [type, magic] of Object.entries(magicNumbers)) {
    if (magic.every((byte, i) => buffer[i] === byte)) {
      detectedType = type;
      break;
    }
  }
  
  if (!detectedType || !allowedTypes.includes(detectedType)) {
    return { 
      valid: false, 
      error: `Invalid image type. Allowed: ${allowedTypes.join(', ')}. Detected: ${detectedType || 'unknown'}` 
    };
  }
  
  return { valid: true, type: detectedType, buffer };
}

// Get user statistics
router.get('/user-stats', authenticateToken, adminOnly, async (req, res) => {
  try {
    const totalUsersResult = await pool.query('SELECT COUNT(*) as total FROM users');
    const totalUsers = parseInt(totalUsersResult.rows[0].total);

    const onlineUsersResult = await pool.query(`
      SELECT COUNT(*) as online 
      FROM users 
      WHERE LOWER(status) = 'online'
    `);
    const onlineUsers = parseInt(onlineUsersResult.rows[0].online);

    const registrationStatsResult = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    res.json({
      totalUsers,
      onlineUsers,
      registrationStats: registrationStatsResult.rows
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ error: 'Failed to fetch user statistics' });
  }
});

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
router.post('/emojis', authenticateToken, adminOnly, rateLimit(20, 60000), auditLog('ADD_EMOJI', 'emoji'), async (req, res) => {
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
        const validation = validateBase64Image(emojiFile);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }

        const uploadDir = 'assets/emoticon';
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const uniqueFileName = `emoji_${Date.now()}_${Math.random().toString(36).substring(7)}.${validation.type}`;
        const filePath = `${uploadDir}/${uniqueFileName}`;

        fs.writeFileSync(filePath, validation.buffer);
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
router.delete('/emojis/:id', authenticateToken, adminOnly, rateLimit(10, 60000), auditLog('DELETE_EMOJI', 'emoji'), async (req, res) => {
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
      category: row.category || 'popular',
      mediaType: row.media_type || 'image',
      thumbnailUrl: row.thumbnail_url,
      duration: row.duration
    }));

    res.json(gifts);
  } catch (error) {
    console.error('Error fetching gifts:', error);
    res.status(500).json({ error: 'Failed to fetch gifts' });
  }
});

// Add gift
router.post('/gifts', authenticateToken, adminOnly, rateLimit(20, 60000), auditLog('ADD_GIFT', 'gift'), async (req, res) => {
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

    const nameCheck = await pool.query(
      'SELECT id FROM custom_gifts WHERE LOWER(name) = LOWER($1)',
      [name.trim()]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Gift name already exists' });
    }

    let imagePath = null;
    let animationPath = null;
    let mediaType = null;

    if (giftImage && imageType && imageName) {
      try {
        const fileExtension = imageType.includes('/') ? imageType.split('/')[1] : imageType;
        
        const allowedImageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
        const allowedVideoExtensions = ['mp4', 'webm', 'mov'];
        const allowedLottieExtensions = ['json'];
        const allAllowedExtensions = [...allowedImageExtensions, ...allowedVideoExtensions, ...allowedLottieExtensions];
        
        if (!allAllowedExtensions.includes(fileExtension)) {
          return res.status(400).json({ 
            error: `Invalid file type. Allowed: ${allAllowedExtensions.join(', ')}` 
          });
        }

        let fileBuffer;
        if (allowedImageExtensions.includes(fileExtension)) {
          const validation = validateBase64Image(giftImage, allowedImageExtensions);
          if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
          }
          fileBuffer = validation.buffer;
        } else if (allowedLottieExtensions.includes(fileExtension)) {
          fileBuffer = Buffer.from(giftImage, 'base64');
          const maxLottieSize = 2 * 1024 * 1024;
          if (fileBuffer.length > maxLottieSize) {
            return res.status(400).json({ 
              error: `Lottie JSON file too large. Maximum size is ${maxLottieSize / (1024 * 1024)}MB.` 
            });
          }
          
          try {
            const jsonContent = fileBuffer.toString('utf8');
            const lottieData = JSON.parse(jsonContent);
            if (!lottieData.v || !lottieData.layers) {
              return res.status(400).json({ 
                error: 'Invalid Lottie JSON format. Must contain "v" and "layers" properties.' 
              });
            }
          } catch (parseError) {
            return res.status(400).json({ 
              error: 'Invalid JSON file. Please upload a valid Lottie animation JSON.' 
            });
          }
        } else {
          fileBuffer = Buffer.from(giftImage, 'base64');
          const maxVideoSize = 15 * 1024 * 1024;
          if (fileBuffer.length > maxVideoSize) {
            return res.status(400).json({ 
              error: `Video file too large. Maximum size is ${maxVideoSize / (1024 * 1024)}MB.` 
            });
          }
        }

        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        const filename = `gift_${uniqueSuffix}`;
        
        const uploadResult = await new Promise((resolve, reject) => {
          let resourceType = 'image';
          if (allowedVideoExtensions.includes(fileExtension)) {
            resourceType = 'video';
          } else if (allowedLottieExtensions.includes(fileExtension)) {
            resourceType = 'raw';
          }
          
          const uploadOptions = {
            folder: 'chatme/gifts',
            public_id: filename,
            resource_type: resourceType,
            format: fileExtension
          };

          cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }).end(fileBuffer);
        });

        const cloudinaryUrl = uploadResult.secure_url;
        
        mediaType = 'image';
        if (['mp4', 'webm', 'mov'].includes(fileExtension)) {
          mediaType = 'video';
          animationPath = cloudinaryUrl;
          imagePath = cloudinaryUrl;
        } else if (fileExtension === 'json') {
          mediaType = 'lottie';
          animationPath = cloudinaryUrl;
          imagePath = cloudinaryUrl;
        } else if (fileExtension === 'gif') {
          animationPath = cloudinaryUrl;
          imagePath = cloudinaryUrl;
        } else {
          imagePath = cloudinaryUrl;
        }

        console.log('Gift uploaded to Cloudinary:', {
          filename,
          url: cloudinaryUrl,
          size: fileBuffer.length,
          type: imageType,
          mediaType
        });

      } catch (error) {
        console.error('Error uploading gift to Cloudinary:', error);
        return res.status(500).json({ error: 'Failed to upload gift file: ' + error.message });
      }
    }

    // Determine media type - default to image if not set above
    let finalMediaType = 'image';
    if (animationPath) {
      if (animationPath.includes('.json')) {
        finalMediaType = 'lottie';
      } else if (['mp4', 'webm', 'mov'].some(ext => animationPath.includes(ext))) {
        finalMediaType = 'video';
      }
    }
    const mediaTypeToUse = mediaType || finalMediaType;

    const result = await pool.query(`
      INSERT INTO custom_gifts (name, icon, image, animation, price, type, category, created_by, media_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [name, icon, imagePath, animationPath, parseInt(price), type, category, req.user.id, mediaTypeToUse]);

    const gift = result.rows[0];
    if (gift.image && gift.image.startsWith('/')) {
      gift.image = `${API_BASE_URL}${gift.image}`;
    }
    if (gift.animation && gift.animation.startsWith('/')) {
      gift.animation = `${API_BASE_URL}${gift.animation}`;
    }

    res.json(gift);
  } catch (error) {
    console.error('Error adding gift:', error);
    res.status(500).json({ error: 'Failed to add gift' });
  }
});

// Update gift
router.put('/gifts/:id', authenticateToken, adminOnly, rateLimit(20, 60000), auditLog('UPDATE_GIFT', 'gift'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      icon, 
      price, 
      type, 
      category, 
      giftImage, 
      imageType, 
      imageName 
    } = req.body;

    if (!name || !icon || !price) {
      return res.status(400).json({ error: 'Name, icon, and price are required' });
    }

    const existingGift = await pool.query('SELECT * FROM custom_gifts WHERE id = $1', [id]);
    if (existingGift.rows.length === 0) {
      return res.status(404).json({ error: 'Gift not found' });
    }

    const nameCheck = await pool.query(
      'SELECT id FROM custom_gifts WHERE LOWER(name) = LOWER($1) AND id != $2',
      [name.trim(), id]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Gift name already exists' });
    }

    const allowedImageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
    const allowedVideoExtensions = ['mp4', 'webm', 'mov'];
    const allowedLottieExtensions = ['json'];

    let imagePath = existingGift.rows[0].image;
    let animationPath = existingGift.rows[0].animation;
    let mediaType = existingGift.rows[0].media_type || 'image';

    if (giftImage && imageType && imageName) {
      try {
        const fileExtension = imageType.includes('/') ? imageType.split('/')[1] : imageType;
        
        const allAllowedExtensions = [...allowedImageExtensions, ...allowedVideoExtensions, ...allowedLottieExtensions];
        
        if (!allAllowedExtensions.includes(fileExtension)) {
          return res.status(400).json({ 
            error: `Invalid file type. Allowed: ${allAllowedExtensions.join(', ')}` 
          });
        }

        let fileBuffer;
        if (allowedImageExtensions.includes(fileExtension)) {
          const validation = validateBase64Image(giftImage, allowedImageExtensions);
          if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
          }
          fileBuffer = validation.buffer;
        } else if (allowedLottieExtensions.includes(fileExtension)) {
          fileBuffer = Buffer.from(giftImage, 'base64');
          const maxLottieSize = 2 * 1024 * 1024;
          if (fileBuffer.length > maxLottieSize) {
            return res.status(400).json({ 
              error: `Lottie JSON file too large. Maximum size is ${maxLottieSize / (1024 * 1024)}MB.` 
            });
          }
          
          try {
            const jsonContent = fileBuffer.toString('utf8');
            const lottieData = JSON.parse(jsonContent);
            if (!lottieData.v || !lottieData.layers) {
              return res.status(400).json({ 
                error: 'Invalid Lottie JSON format. Must contain "v" and "layers" properties.' 
              });
            }
          } catch (parseError) {
            return res.status(400).json({ 
              error: 'Invalid JSON file. Please upload a valid Lottie animation JSON.' 
            });
          }
        } else {
          fileBuffer = Buffer.from(giftImage, 'base64');
          const maxVideoSize = 15 * 1024 * 1024;
          if (fileBuffer.length > maxVideoSize) {
            return res.status(400).json({ 
              error: `Video file too large. Maximum size is ${maxVideoSize / (1024 * 1024)}MB.` 
            });
          }
        }

        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        const filename = `gift_${uniqueSuffix}`;
        
        const uploadResult = await new Promise((resolve, reject) => {
          let resourceType = 'image';
          if (allowedVideoExtensions.includes(fileExtension)) {
            resourceType = 'video';
          } else if (allowedLottieExtensions.includes(fileExtension)) {
            resourceType = 'raw';
          }
          
          const uploadOptions = {
            folder: 'chatme/gifts',
            public_id: filename,
            resource_type: resourceType,
            format: fileExtension
          };

          cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }).end(fileBuffer);
        });

        const cloudinaryUrl = uploadResult.secure_url;
        
        if (allowedVideoExtensions.includes(fileExtension)) {
          mediaType = 'video';
          animationPath = cloudinaryUrl;
          imagePath = cloudinaryUrl;
        } else if (fileExtension === 'json') {
          mediaType = 'lottie';
          animationPath = cloudinaryUrl;
          imagePath = cloudinaryUrl;
        } else if (fileExtension === 'gif') {
          animationPath = cloudinaryUrl;
          imagePath = cloudinaryUrl;
        } else {
          imagePath = cloudinaryUrl;
          animationPath = null;
        }

        if (existingGift.rows[0].image && existingGift.rows[0].image.includes('cloudinary.com')) {
          try {
            const urlParts = existingGift.rows[0].image.split('/upload/');
            if (urlParts.length > 1) {
              let pathAfterUpload = urlParts[1];
              const pathSegments = pathAfterUpload.split('/');
              if (pathSegments[0].startsWith('v')) {
                pathSegments.shift();
              }
              const pathWithoutVersion = pathSegments.join('/');
              const publicId = pathWithoutVersion.substring(0, pathWithoutVersion.lastIndexOf('.'));
              let resourceType = 'image';
              if (existingGift.rows[0].media_type === 'video') {
                resourceType = 'video';
              } else if (existingGift.rows[0].media_type === 'lottie') {
                resourceType = 'raw';
              }
              await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
              console.log('Deleted old Cloudinary asset:', publicId);
            }
          } catch (err) {
            console.error('Error deleting old Cloudinary asset:', err);
          }
        } else if (existingGift.rows[0].image && existingGift.rows[0].image.startsWith('/assets/gift/')) {
          const oldImagePath = path.resolve(__dirname, '../..' + existingGift.rows[0].image);
          if (fs.existsSync(oldImagePath)) {
            fs.unlink(oldImagePath, (err) => {
              if (err) console.error('Error deleting old local image:', err);
            });
          }
        }

        console.log('Gift updated on Cloudinary:', {
          filename,
          url: cloudinaryUrl,
          size: fileBuffer.length,
          type: imageType,
          mediaType
        });

      } catch (error) {
        console.error('Error uploading gift to Cloudinary:', error);
        return res.status(500).json({ error: 'Failed to upload gift file: ' + error.message });
      }
    }

    // Determine media type if not set during file processing
    if (!mediaType) {
      mediaType = allowedVideoExtensions.some(ext => animationPath?.includes(ext)) ? 'video' : 'image';
    }

    const result = await pool.query(`
      UPDATE custom_gifts 
      SET name = $1, icon = $2, image = $3, animation = $4, price = $5, type = $6, category = $7, media_type = $8
      WHERE id = $9
      RETURNING *
    `, [name.trim(), icon, imagePath, animationPath, parseInt(price), type || 'static', category || 'popular', mediaType, id]);

    const gift = result.rows[0];
    if (gift.image && gift.image.startsWith('/')) {
      gift.image = `${API_BASE_URL}${gift.image}`;
    }
    if (gift.animation && gift.animation.startsWith('/')) {
      gift.animation = `${API_BASE_URL}${gift.animation}`;
    }

    res.json(gift);
  } catch (error) {
    console.error('Error updating gift:', error);
    res.status(500).json({ error: 'Failed to update gift' });
  }
});

// Delete gift
router.delete('/gifts/:id', authenticateToken, adminOnly, rateLimit(10, 60000), auditLog('DELETE_GIFT', 'gift'), async (req, res) => {
  try {
    const { id } = req.params;

    const giftResult = await pool.query('SELECT image, animation, media_type FROM custom_gifts WHERE id = $1', [id]);
    if (giftResult.rows.length > 0) {
      const gift = giftResult.rows[0];
      
      if (gift.image && gift.image.includes('cloudinary.com')) {
        try {
          const urlParts = gift.image.split('/upload/');
          if (urlParts.length > 1) {
            let pathAfterUpload = urlParts[1];
            const pathSegments = pathAfterUpload.split('/');
            if (pathSegments[0].startsWith('v')) {
              pathSegments.shift();
            }
            const pathWithoutVersion = pathSegments.join('/');
            const publicId = pathWithoutVersion.substring(0, pathWithoutVersion.lastIndexOf('.'));
            const resourceType = gift.media_type === 'video' ? 'video' : 'image';
            await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
            console.log('Deleted Cloudinary asset:', publicId);
          }
        } catch (err) {
          console.error('Error deleting Cloudinary asset:', err);
        }
      } else if (gift.image && gift.image.startsWith('/assets/gift/')) {
        const imagePath = path.resolve(__dirname, '../..' + gift.image);
        if (fs.existsSync(imagePath)) {
          fs.unlink(imagePath, (err) => {
            if (err) console.error('Error deleting image file:', err);
          });
        }
      }
      
      if (gift.animation && gift.animation.includes('cloudinary.com') && gift.animation !== gift.image) {
        try {
          const urlParts = gift.animation.split('/upload/');
          if (urlParts.length > 1) {
            let pathAfterUpload = urlParts[1];
            const pathSegments = pathAfterUpload.split('/');
            if (pathSegments[0].startsWith('v')) {
              pathSegments.shift();
            }
            const pathWithoutVersion = pathSegments.join('/');
            const publicId = pathWithoutVersion.substring(0, pathWithoutVersion.lastIndexOf('.'));
            const resourceType = gift.media_type === 'video' ? 'video' : 'image';
            await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
            console.log('Deleted Cloudinary animation asset:', publicId);
          }
        } catch (err) {
          console.error('Error deleting Cloudinary animation asset:', err);
        }
      } else if (gift.animation && gift.animation.startsWith('/assets/gift/') && gift.animation !== gift.image) {
        const animPath = path.resolve(__dirname, '../..' + gift.animation);
        if (fs.existsSync(animPath)) {
          fs.unlink(animPath, (err) => {
            if (err) console.error('Error deleting animation file:', err);
          });
        }
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

    if (!maxMembers || typeof maxMembers !== 'number' || maxMembers < 1 || maxMembers > 9999) {
      return res.status(400).json({ error: 'Invalid max members. Must be between 1 and 9999' });
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
router.delete('/rooms/:roomId', authenticateToken, adminOnly, rateLimit(5, 60000), auditLog('DELETE_ROOM', 'room'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { roomId } = req.params;

    await client.query('BEGIN');

    // Check if room exists
    const roomCheck = await client.query('SELECT name FROM rooms WHERE id = $1', [roomId]);
    if (roomCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Room not found' });
    }

    const roomName = roomCheck.rows[0].name;

    // Delete all related data in a transaction to prevent partial deletes
    await client.query('DELETE FROM chat_messages WHERE room_id = $1', [roomId]);
    await client.query('DELETE FROM room_banned_users WHERE room_id = $1', [roomId]);
    await client.query('DELETE FROM room_security WHERE room_id = $1', [roomId]);
    await client.query('DELETE FROM room_moderators WHERE room_id = $1', [roomId]);
    await client.query('DELETE FROM rooms WHERE id = $1', [roomId]);

    await client.query('COMMIT');

    res.json({ 
      message: 'Room deleted successfully',
      roomName: roomName
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  } finally {
    client.release();
  }
});

// Get user credit history (admin only)
router.get('/credits/history/:userId', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
      SELECT 
        ct.id,
        ct.from_user_id,
        ct.to_user_id,
        ct.amount,
        ct.type,
        ct.created_at,
        u1.username as from_username,
        u2.username as to_username
      FROM credit_transactions ct
      LEFT JOIN users u1 ON ct.from_user_id = u1.id
      LEFT JOIN users u2 ON ct.to_user_id = u2.id
      WHERE ct.from_user_id = $1 OR ct.to_user_id = $1
      ORDER BY ct.created_at DESC
      LIMIT 50
    `, [userId]);

    const history = result.rows.map(row => ({
      id: row.id,
      type: row.type,
      amount: row.amount,
      otherParty: row.from_user_id === parseInt(userId) ? row.to_username : row.from_username,
      createdAt: row.created_at
    }));

    res.json(history);
  } catch (error) {
    console.error('Error fetching credit history:', error);
    res.status(500).json({ error: 'Failed to load credit history' });
  }
});

// Get user status with online info, device, and location (admin only)
router.get('/users/status', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.role,
        u.phone,
        u.status,
        u.device_info,
        u.last_ip,
        u.location,
        u.last_login,
        COALESCE(uc.balance, 0) as credits
      FROM users u
      LEFT JOIN user_credits uc ON u.id = uc.user_id
      ORDER BY u.last_login DESC NULLS LAST
    `);

    const users = result.rows.map(row => ({
      id: row.id,
      username: row.username,
      email: row.email,
      phone: row.phone,
      role: row.role,
      status: row.status || 'offline',
      credits: row.credits,
      device: row.device_info || 'Unknown',
      ip: row.last_ip || 'Unknown',
      location: row.location || 'Unknown',
      lastLogin: row.last_login
    }));

    res.json(users);
  } catch (error) {
    console.error('Error fetching user status:', error);
    res.status(500).json({ error: 'Failed to fetch user status' });
  }
});

// ============================================
// FRAME MANAGEMENT ENDPOINTS
// ============================================

// Get all frames
router.get('/frames', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, image, price, duration_days, is_active, created_at
      FROM frame_items
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching frames:', error);
    res.status(500).json({ error: 'Failed to fetch frames' });
  }
});

// Add new frame (with Cloudinary upload)
router.post('/frames', authenticateToken, adminOnly, rateLimit(20, 60000), auditLog('ADD_FRAME', 'frame'), async (req, res) => {
  try {
    const { name, description, price, durationDays, frameImage, imageType, imageName } = req.body;

    if (!name || !price || !frameImage) {
      return res.status(400).json({ error: 'Name, price, and frame image are required' });
    }

    // Check for duplicate name
    const nameCheck = await pool.query(
      'SELECT id FROM frame_items WHERE LOWER(name) = LOWER($1)',
      [name.trim()]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Frame name already exists' });
    }

    let imagePath = null;

    if (frameImage && imageType && imageName) {
      try {
        const fileExtension = imageType.includes('/') ? imageType.split('/')[1] : imageType;
        const allowedExtensions = ['png', 'gif'];
        
        if (!allowedExtensions.includes(fileExtension)) {
          return res.status(400).json({ 
            error: `Invalid file type. Allowed: PNG, GIF only` 
          });
        }

        // Validate base64 image
        const validation = validateBase64Image(frameImage, allowedExtensions);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }

        // Upload to Cloudinary
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        const filename = `frame_${uniqueSuffix}`;
        
        const uploadResult = await new Promise((resolve, reject) => {
          const uploadOptions = {
            folder: 'chatme/frames',
            public_id: filename,
            resource_type: 'image',
            format: fileExtension
          };

          const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );

          uploadStream.end(validation.buffer);
        });

        imagePath = uploadResult.secure_url;
        console.log('Frame uploaded to Cloudinary:', imagePath);
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload frame to Cloudinary' });
      }
    }

    // Insert into database
    const result = await pool.query(`
      INSERT INTO frame_items (name, description, image, price, duration_days, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `, [name.trim(), description || '', imagePath, parseInt(price), parseInt(durationDays) || 14]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding frame:', error);
    res.status(500).json({ error: 'Failed to add frame' });
  }
});

// Update frame (name, price, or image)
router.put('/frames/:id', authenticateToken, adminOnly, rateLimit(20, 60000), auditLog('UPDATE_FRAME', 'frame'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, durationDays, frameImage, imageType, imageName } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    // Check if frame exists
    const existingFrame = await pool.query('SELECT * FROM frame_items WHERE id = $1', [id]);
    if (existingFrame.rows.length === 0) {
      return res.status(404).json({ error: 'Frame not found' });
    }

    // Check for duplicate name (excluding current frame)
    const nameCheck = await pool.query(
      'SELECT id FROM frame_items WHERE LOWER(name) = LOWER($1) AND id != $2',
      [name.trim(), id]
    );
    if (nameCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Frame name already exists' });
    }

    let imagePath = existingFrame.rows[0].image;

    // If new image is provided, upload to Cloudinary
    if (frameImage && imageType && imageName) {
      try {
        const fileExtension = imageType.includes('/') ? imageType.split('/')[1] : imageType;
        const allowedExtensions = ['png', 'gif'];
        
        if (!allowedExtensions.includes(fileExtension)) {
          return res.status(400).json({ 
            error: `Invalid file type. Allowed: PNG, GIF only` 
          });
        }

        const validation = validateBase64Image(frameImage, allowedExtensions);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }

        // Delete old Cloudinary image if exists
        if (imagePath && imagePath.includes('cloudinary.com')) {
          try {
            const urlParts = imagePath.split('/upload/');
            if (urlParts.length > 1) {
              let pathAfterUpload = urlParts[1];
              const pathSegments = pathAfterUpload.split('/');
              if (pathSegments[0].startsWith('v')) {
                pathSegments.shift();
              }
              const pathWithoutVersion = pathSegments.join('/');
              const publicId = pathWithoutVersion.substring(0, pathWithoutVersion.lastIndexOf('.'));
              await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
              console.log('Deleted old frame from Cloudinary:', publicId);
            }
          } catch (err) {
            console.error('Error deleting old Cloudinary frame:', err);
          }
        }

        // Upload new image
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        const filename = `frame_${uniqueSuffix}`;
        
        const uploadResult = await new Promise((resolve, reject) => {
          const uploadOptions = {
            folder: 'chatme/frames',
            public_id: filename,
            resource_type: 'image',
            format: fileExtension
          };

          const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );

          uploadStream.end(validation.buffer);
        });

        imagePath = uploadResult.secure_url;
        console.log('New frame uploaded to Cloudinary:', imagePath);
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload frame to Cloudinary' });
      }
    }

    // Update database
    const result = await pool.query(`
      UPDATE frame_items 
      SET name = $1, description = $2, image = $3, price = $4, duration_days = $5
      WHERE id = $6
      RETURNING *
    `, [name.trim(), description || '', imagePath, parseInt(price), parseInt(durationDays) || 14, id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating frame:', error);
    res.status(500).json({ error: 'Failed to update frame' });
  }
});

// Delete frame
router.delete('/frames/:id', authenticateToken, adminOnly, rateLimit(10, 60000), auditLog('DELETE_FRAME', 'frame'), async (req, res) => {
  try {
    const { id } = req.params;

    // Get frame data before deleting
    const frameResult = await pool.query('SELECT image FROM frame_items WHERE id = $1', [id]);
    if (frameResult.rows.length > 0) {
      const frame = frameResult.rows[0];
      
      // Delete from Cloudinary if exists
      if (frame.image && frame.image.includes('cloudinary.com')) {
        try {
          const urlParts = frame.image.split('/upload/');
          if (urlParts.length > 1) {
            let pathAfterUpload = urlParts[1];
            const pathSegments = pathAfterUpload.split('/');
            if (pathSegments[0].startsWith('v')) {
              pathSegments.shift();
            }
            const pathWithoutVersion = pathSegments.join('/');
            const publicId = pathWithoutVersion.substring(0, pathWithoutVersion.lastIndexOf('.'));
            await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
            console.log('Deleted Cloudinary frame:', publicId);
          }
        } catch (err) {
          console.error('Error deleting Cloudinary frame:', err);
        }
      }
    }

    // Delete from database
    await pool.query('DELETE FROM frame_items WHERE id = $1', [id]);
    res.json({ message: 'Frame deleted successfully' });
  } catch (error) {
    console.error('Error deleting frame:', error);
    res.status(500).json({ error: 'Failed to delete frame' });
  }
});

// Create special account (admin only)
router.post('/create-special-account', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { id, username, email, password } = req.body;

    console.log('📝 Admin creating special account:', { id, username, email });

    // Validate required fields
    if (!id || !username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate ID is 1-3 digit number
    const idNum = parseInt(id);
    if (isNaN(idNum) || idNum < 1 || idNum > 999) {
      return res.status(400).json({ error: 'ID must be a number between 1 and 999' });
    }

    // Validate username length
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if ID already exists
    const idCheck = await pool.query('SELECT id FROM users WHERE id = $1', [idNum]);
    if (idCheck.rows.length > 0) {
      return res.status(400).json({ error: 'ID already exists' });
    }

    // Check if username already exists
    const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email already exists
    const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with specified ID and auto-verified
    const result = await pool.query(
      `INSERT INTO users (id, username, email, password, verified, role, level, status, created_at) 
       VALUES ($1, $2, $3, $4, true, 'user', 1, 'online', NOW()) 
       RETURNING id, username, email, verified, role`,
      [idNum, username, email, hashedPassword]
    );

    const newUser = result.rows[0];
    console.log('✅ Special account created:', newUser);

    // Log admin action
    await pool.query(
      `INSERT INTO admin_audit_logs (admin_id, admin_username, action, resource_type, resource_id, details, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        req.user.id,
        req.user.username,
        'create_special_account',
        'user',
        newUser.id.toString(),
        JSON.stringify({ username, email, custom_id: idNum })
      ]
    );

    res.json({
      message: 'Account created successfully',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        verified: newUser.verified,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('❌ Error creating special account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// ==================== ANNOUNCEMENT MANAGEMENT ====================

// Get all announcements (admin only)
router.get('/announcements', authenticateToken, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.id, 
        a.title, 
        a.message, 
        a.is_active,
        COALESCE(a.type, 'info') as type,
        COUNT(av.id) as view_count,
        a.created_at, 
        a.updated_at
      FROM announcements a
      LEFT JOIN announcement_views av ON a.id = av.announcement_id
      GROUP BY a.id, a.title, a.message, a.is_active, a.type, a.created_at, a.updated_at
      ORDER BY a.created_at DESC
    `);

    res.json({ announcements: result.rows });
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Create announcement (admin only)
router.post('/announcements', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { title, message, type = 'info' } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const validTypes = ['info', 'warning', 'error', 'success'];
    const announcementType = validTypes.includes(type) ? type : 'info';

    const result = await pool.query(
      `INSERT INTO announcements (title, message, type, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, true, NOW(), NOW())
       RETURNING *`,
      [title, message, announcementType]
    );

    res.json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Update announcement (admin only)
router.put('/announcements/:id', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, message, type = 'info' } = req.body;
    let { is_active } = req.body;

    const validTypes = ['info', 'warning', 'error', 'success'];
    const announcementType = validTypes.includes(type) ? type : 'info';

    if (is_active === undefined) {
      const current = await pool.query('SELECT is_active FROM announcements WHERE id = $1', [id]);
      if (current.rows.length > 0) {
        is_active = current.rows[0].is_active;
      } else {
        is_active = true;
      }
    }

    const result = await pool.query(
      `UPDATE announcements
       SET title = $1, message = $2, type = $3, is_active = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [title, message, announcementType, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// Toggle announcement status (admin only)
router.patch('/announcements/:id/toggle', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE announcements
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ announcement: result.rows[0] });
  } catch (error) {
    console.error('Error toggling announcement:', error);
    res.status(500).json({ error: 'Failed to toggle announcement' });
  }
});

// Delete announcement (admin only)
router.delete('/announcements/:id', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM announcement_views WHERE announcement_id = $1', [id]);
    const result = await pool.query('DELETE FROM announcements WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// Update user role (admin only, super admin for admin role)
router.put('/users/:userId/role', authenticateToken, adminOnly, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || !['user', 'admin', 'mentor', 'merchant'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be user, admin, mentor, or merchant' });
    }

    const isSuperAdmin = SUPER_ADMIN_IDS.includes(parseInt(req.user.id));

    if (role === 'admin' && !isSuperAdmin) {
      return res.status(403).json({ error: 'Only super admin can assign admin role' });
    }

    const userCheck = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [userId]);
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userCheck.rows[0];

    if (SUPER_ADMIN_IDS.includes(parseInt(userId)) && !isSuperAdmin) {
      return res.status(403).json({ error: 'Cannot modify super admin role' });
    }

    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, username, email, role',
      [role, userId]
    );

    await pool.query(
      `INSERT INTO admin_actions (admin_id, action_type, target_user_id, details, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        req.user.id,
        'role_change',
        userId,
        JSON.stringify({ 
          from: targetUser.role, 
          to: role,
          target_username: targetUser.username
        })
      ]
    );

    console.log(`Admin ${req.user.username} changed role of user ${targetUser.username} from ${targetUser.role} to ${role}`);

    res.json({ 
      message: 'User role updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

module.exports = router;
