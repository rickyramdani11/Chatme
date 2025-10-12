
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('./auth');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const API_BASE_URL = process.env.API_BASE_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${process.env.PORT || 5000}`);

// Create exp history table (run once at startup, not in transaction)
const initExpHistoryTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_exp_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        activity_type VARCHAR(50) NOT NULL,
        exp_gained INTEGER NOT NULL,
        new_exp INTEGER NOT NULL,
        new_level INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.log('Exp history table initialization:', error.message);
  }
};

// Initialize table at startup
initExpHistoryTable();

// Function to add EXP to a user
const addUserEXP = async (userId, expAmount, activityType) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Get current exp and level with row lock
    const userResult = await client.query(
      'SELECT exp, level FROM users WHERE id = $1 FOR UPDATE', 
      [userId]
    );
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return { success: false, error: 'User not found' };
    }

    const currentUser = userResult.rows[0];
    const currentExp = currentUser.exp || 0;
    const currentLevel = currentUser.level || 1;

    // Define EXP thresholds for leveling up
    const expPerLevel = 1000; // 1000 EXP to reach next level

    const newExp = currentExp + expAmount;
    let newLevel = currentLevel;
    let leveledUp = false;

    // Calculate new level based on total EXP
    const calculatedLevel = Math.floor(newExp / expPerLevel) + 1;
    if (calculatedLevel > currentLevel) {
      newLevel = calculatedLevel;
      leveledUp = true;
    }

    // Update user EXP and level
    await client.query(
      'UPDATE users SET exp = $1, level = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [newExp, newLevel, userId]
    );

    console.log(`User ${userId} gained ${expAmount} EXP from ${activityType}. New EXP: ${newExp}, New Level: ${newLevel}`);

    // Record EXP gain in history table
    await client.query(`
      INSERT INTO user_exp_history (user_id, activity_type, exp_gained, new_exp, new_level)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, activityType, expAmount, newExp, newLevel]);

    // Commit transaction BEFORE level up reward (reward is separate operation)
    await client.query('COMMIT');
    client.release();

    // Give level up rewards if user leveled up (separate from transaction)
    if (leveledUp) {
      const levelUpReward = newLevel * 100; // 100 coins per level
      try {
        await pool.query(`
          INSERT INTO user_credits (user_id, balance, updated_at) 
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id) DO UPDATE SET 
            balance = user_credits.balance + $2,
            updated_at = CURRENT_TIMESTAMP
        `, [userId, levelUpReward]);

        console.log(`Level up reward: ${levelUpReward} coins given to user ${userId} for reaching level ${newLevel}`);
      } catch (rewardError) {
        console.error('Error giving level up reward (EXP already saved):', rewardError);
        // EXP already committed, just log reward error
      }
    }

    return { success: true, userId, expAmount, newExp, newLevel, leveledUp, levelUpReward: leveledUp ? newLevel * 100 : 0 };

  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error during rollback:', rollbackError);
      } finally {
        // Always release client even if rollback fails
        client.release();
      }
    }
    console.error(`Error adding EXP for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
};

// Get all posts
router.get('/posts', async (req, res) => {
  try {
    console.log('Fetching feed posts...');

    const result = await pool.query(`
      SELECT
        p.*,
        u.role,
        u.verified,
        u.avatar,
        u.level,
        COALESCE(
          (SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', pc.id,
              'user', pc.username,
              'content', pc.content,
              'timestamp', pc.created_at
            )
          ) FROM post_comments pc WHERE pc.post_id = p.id),
          '[]'::json
        ) as comments
      FROM posts p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `);

    const postsWithComments = result.rows.map(row => {
      // Process avatar URL properly
      let avatarUrl = row.avatar;
      if (avatarUrl && avatarUrl.startsWith('/api/')) {
        avatarUrl = `${API_BASE_URL}${avatarUrl}`;
      } else if (!avatarUrl || avatarUrl.length <= 2) {
        // If no avatar or just single character, use first letter
        avatarUrl = row.username?.charAt(0).toUpperCase() || 'U';
      }

      return {
        id: row.id.toString(),
        user: row.username,
        username: row.username,
        content: row.content,
        timestamp: row.created_at,
        likes: row.likes,
        comments: row.comments || [],
        shares: row.shares,
        level: row.level || 1,
        avatar: avatarUrl,
        role: row.role,
        verified: row.verified,
        mediaFiles: row.media_files || [],
        streamingUrl: row.streaming_url || ''
      };
    });

    console.log('Processed avatars for posts:', postsWithComments.slice(0, 3).map(p => ({ 
      username: p.username, 
      avatar: p.avatar 
    })));

    res.json(postsWithComments);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new post
router.post('/posts', authenticateToken, async (req, res) => {
  try {
    console.log('=== CREATE POST REQUEST ===');
    console.log('User:', req.user.username);
    console.log('Content length:', req.body.content?.length || 0);

    const { content, streamingUrl = '' } = req.body;
    
    // Get user info from authenticated token
    const userId = req.user.userId;
    const username = req.user.username;

    // Get user level from database
    const userResult = await pool.query('SELECT level FROM users WHERE id = $1', [userId]);
    const userLevel = userResult.rows.length > 0 ? userResult.rows[0].level : 1;

    if (!content) {
      console.log('Missing content');
      return res.status(400).json({ error: 'Content is required' });
    }

    const result = await pool.query(`
      INSERT INTO posts (user_id, username, content, streaming_url, likes, shares)
      VALUES ($1, $2, $3, $4, 0, 0)
      RETURNING *
    `, [userId, username, content.trim(), streamingUrl || '']);

    const newPost = result.rows[0];

    // Award XP for creating a post
    const expResult = await addUserEXP(userId, 50, 'post_created');
    console.log('XP awarded for post creation:', expResult);

    // Get user role and other info
    const userInfoResult = await pool.query('SELECT role, verified, avatar FROM users WHERE id = $1', [userId]);
    const userInfo = userInfoResult.rows[0];

    const responsePost = {
      id: newPost.id.toString(),
      user: newPost.username,
      username: newPost.username,
      content: newPost.content,
      timestamp: newPost.created_at,
      likes: newPost.likes,
      comments: [],
      shares: newPost.shares,
      level: userLevel,
      avatar: userInfo.avatar || newPost.username?.charAt(0).toUpperCase(),
      role: userInfo.role,
      verified: userInfo.verified,
      mediaFiles: [],
      streamingUrl: newPost.streaming_url || ''
    };

    console.log('New post created successfully:', newPost.id);
    res.status(201).json(responsePost);
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Like/Unlike post
router.post('/posts/:postId/like', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { action } = req.body; // 'like' or 'unlike'

    // Use atomic UPDATE with CASE to prevent race conditions
    let updateQuery;
    if (action === 'like') {
      updateQuery = `
        UPDATE posts 
        SET likes = likes + 1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1
        RETURNING likes
      `;
    } else if (action === 'unlike') {
      updateQuery = `
        UPDATE posts 
        SET likes = GREATEST(likes - 1, 0), updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1
        RETURNING likes
      `;
    } else {
      return res.status(400).json({ error: 'Invalid action. Must be "like" or "unlike"' });
    }

    const result = await pool.query(updateQuery, [postId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const newLikes = result.rows[0].likes;
    console.log(`Post ${postId} ${action}d. New likes count: ${newLikes}`);

    res.json({
      postId,
      likes: newLikes,
      action
    });
  } catch (error) {
    console.error('Error updating post likes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add comment to post
router.post('/posts/:postId/comment', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    
    // Get user info from authenticated token
    const userId = req.user.userId;
    const username = req.user.username;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    // Check if post exists
    const postResult = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Add comment to database
    const commentResult = await pool.query(`
      INSERT INTO post_comments (post_id, user_id, username, content)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [postId, userId, username, content.trim()]);

    const newComment = commentResult.rows[0];

    // Award XP for commenting
    const expResult = await addUserEXP(userId, 25, 'comment_created');
    console.log('XP awarded for comment creation:', expResult);

    // Get total comments count
    const countResult = await pool.query('SELECT COUNT(*) FROM post_comments WHERE post_id = $1', [postId]);
    const totalComments = parseInt(countResult.rows[0].count);

    console.log(`Comment added to post ${postId}:`, newComment.id);

    res.status(201).json({
      comment: {
        id: newComment.id.toString(),
        user: newComment.username,
        content: newComment.content,
        timestamp: newComment.created_at
      },
      totalComments
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Share post
router.post('/posts/:postId/share', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;

    // Use atomic UPDATE to prevent race conditions
    const result = await pool.query(`
      UPDATE posts 
      SET shares = shares + 1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
      RETURNING shares
    `, [postId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const newShares = result.rows[0].shares;
    console.log(`Post ${postId} shared. New shares count: ${newShares}`);

    res.json({
      postId,
      shares: newShares,
      message: 'Post shared successfully'
    });
  } catch (error) {
    console.error('Error sharing post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload photo/video for posts - Using Cloudinary
router.post('/upload', async (req, res) => {
  try {
    console.log('=== UPLOAD REQUEST DEBUG ===');
    console.log('Request body keys:', Object.keys(req.body || {}));
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Type:', req.body?.type);
    console.log('Data length:', req.body?.data?.length || 0);
    console.log('Filename:', req.body?.filename);
    console.log('User:', req.body?.user);

    if (!req.body || typeof req.body !== 'object') {
      console.error('Request body is missing or invalid');
      return res.status(400).json({
        error: 'Invalid request body. Please ensure you are sending JSON data.',
        received: typeof req.body
      });
    }

    const { type, data, filename, user } = req.body;

    const missingFields = [];
    if (!type) missingFields.push('type');
    if (!data) missingFields.push('data');
    if (!filename) missingFields.push('filename');
    if (!user) missingFields.push('user');

    if (missingFields.length > 0) {
      console.error('Missing required fields:', missingFields);
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields: missingFields,
        received: {
          type: type || 'missing',
          data: data ? `${data.length} characters` : 'missing',
          filename: filename || 'missing',
          user: user || 'missing'
        }
      });
    }

    const validTypes = ['photo', 'video'];
    if (!validTypes.includes(type)) {
      console.error('Invalid file type:', type);
      return res.status(400).json({
        error: `Invalid file type "${type}". Must be one of: ${validTypes.join(', ')}`
      });
    }

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    let fileExtension = path.extname(filename);

    if (!fileExtension) {
      if (type === 'video') {
        fileExtension = '.mp4';
      } else {
        fileExtension = '.jpg';
      }
    }

    const fileBuffer = Buffer.from(data, 'base64');
    const maxFileSize = type === 'video' ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    
    if (fileBuffer.length > maxFileSize) {
      return res.status(400).json({ 
        error: `File too large. Maximum size is ${maxFileSize / (1024 * 1024)}MB for ${type}.` 
      });
    }

    const fileId = `feed_${timestamp}_${randomSuffix}`;
    const resourceType = type === 'video' ? 'video' : 'image';

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadOptions = {
        folder: 'chatme/feed',
        public_id: fileId,
        resource_type: resourceType,
        format: fileExtension.replace('.', '')
      };

      cloudinary.uploader.upload_stream(uploadOptions, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }).end(fileBuffer);
    });

    const cloudinaryUrl = uploadResult.secure_url;

    console.log('Feed media uploaded to Cloudinary:', {
      fileId,
      url: cloudinaryUrl,
      size: fileBuffer.length,
      type,
      resourceType
    });

    res.json({
      success: true,
      fileId: fileId,
      url: cloudinaryUrl,
      filename: filename,
      type: type
    });
  } catch (error) {
    console.error('Error uploading file to Cloudinary:', error);
    res.status(500).json({ error: 'Failed to upload file: ' + error.message });
  }
});

// Create post with media
router.post('/posts/with-media', authenticateToken, async (req, res) => {
  try {
    const { content, mediaFiles = [], streamingUrl = '' } = req.body;
    
    // Get user info from authenticated token
    const userId = req.user.userId;
    const username = req.user.username;

    console.log('=== CREATE POST WITH MEDIA REQUEST ===');
    console.log('Content:', content);
    console.log('User:', username);
    console.log('Media Files:', JSON.stringify(mediaFiles, null, 2));

    // Get user level from database
    const userResult = await pool.query('SELECT level FROM users WHERE id = $1', [userId]);
    const userLevel = userResult.rows.length > 0 ? userResult.rows[0].level : 1;

    // Ensure mediaFiles is properly structured
    const processedMediaFiles = mediaFiles.map(file => ({
      id: file.id,
      type: file.type,
      url: file.url,
      filename: file.filename
    }));

    const result = await pool.query(`
      INSERT INTO posts (user_id, username, content, media_files, streaming_url, likes, shares)
      VALUES ($1, $2, $3, $4, $5, 0, 0)
      RETURNING *
    `, [userId, username, content ? content.trim() : '', JSON.stringify(processedMediaFiles), streamingUrl || '']);

    const newPost = result.rows[0];

    // Get user role and other info
    const userInfoResult = await pool.query('SELECT role, verified, avatar FROM users WHERE id = $1', [userId]);
    const userInfo = userInfoResult.rows[0] || {};

    const responsePost = {
      id: newPost.id.toString(),
      user: newPost.username,
      username: newPost.username,
      content: newPost.content,
      timestamp: newPost.created_at,
      likes: newPost.likes,
      comments: [],
      shares: newPost.shares,
      level: userLevel,
      avatar: userInfo.avatar || newPost.username?.charAt(0).toUpperCase(),
      role: userInfo.role || 'user',
      verified: userInfo.verified || false,
      mediaFiles: processedMediaFiles,
      streamingUrl: newPost.streaming_url || ''
    };

    console.log('New post with media created successfully:', newPost.id);
    console.log('Response post media files:', responsePost.mediaFiles);
    res.status(201).json(responsePost);
  } catch (error) {
    console.error('Error creating post with media:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Delete post
router.delete('/posts/:postId', authenticateToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.userId;
    const username = req.user.username;
    const role = req.user.role;

    // Use transaction to ensure atomic deletion
    await pool.query('BEGIN');

    // Get the post to check ownership
    const postResult = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (postResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = postResult.rows[0];

    // Check if user can delete this post (owner or admin)
    if (post.username !== username && role !== 'admin') {
      await pool.query('ROLLBACK');
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    // Delete related comments first
    await pool.query('DELETE FROM post_comments WHERE post_id = $1', [postId]);

    // Delete the post
    await pool.query('DELETE FROM posts WHERE id = $1', [postId]);

    await pool.query('COMMIT');

    console.log(`Post ${postId} deleted by ${username} (${role || 'user'})`);

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve uploaded media files
router.get('/media/:fileId', (req, res) => {
  try {
    const { fileId } = req.params;
    console.log(`GET /api/feed/media/${fileId} - ${new Date().toISOString()}`);

    // Ensure media directory exists
    const mediaDir = path.join(__dirname, '../uploads', 'media');
    if (!fs.existsSync(mediaDir)) {
      console.log('Media directory does not exist, creating:', mediaDir);
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    // List all files in media directory for debugging
    const files = fs.readdirSync(mediaDir);
    console.log('Available files in media directory:', files);
    console.log('Requested file ID:', fileId);

    // First try exact match
    let filePath = path.join(mediaDir, fileId);
    let foundFile = false;
    let matchingFile = null;

    if (fs.existsSync(filePath)) {
      foundFile = true;
      matchingFile = fileId;
      console.log('Found exact match:', fileId);
    } else {
      // Try exact filename match first
      matchingFile = files.find(file => file === fileId);

      // If not found, try to match by removing extension from fileId
      if (!matchingFile) {
        const fileIdWithoutExt = fileId.replace(/\.[^/.]+$/, "");
        matchingFile = files.find(file => file.startsWith(fileIdWithoutExt));
        console.log('Searching for files starting with:', fileIdWithoutExt);
      }

      // If still not found, try to match the full fileId as prefix
      if (!matchingFile) {
        matchingFile = files.find(file => file.startsWith(fileId.split('.')[0]));
        console.log('Searching for files starting with prefix:', fileId.split('.')[0]);
      }

      if (matchingFile) {
        filePath = path.join(mediaDir, matchingFile);
        foundFile = true;
        console.log(`Found matching file: ${matchingFile}`);
      } else {
        console.log('No matching file found for:', fileId);
      }
    }

    if (foundFile && fs.existsSync(filePath)) {
      // Verify file is not empty
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        console.log(`File is empty: ${filePath}`);
        return res.status(404).json({ 
          error: 'File corrupted',
          requestedFile: fileId,
          message: 'The requested file is corrupted or empty.'
        });
      }

      const ext = path.extname(filePath).toLowerCase();

      let contentType = 'application/octet-stream';
      if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.gif') contentType = 'image/gif';
      else if (ext === '.mp4') contentType = 'video/mp4';
      else if (ext === '.webm') contentType = 'video/webm';
      else if (ext === '.mov') contentType = 'video/quicktime';

      console.log(`Serving file: ${matchingFile}, Type: ${contentType}, Size: ${stats.size} bytes`);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=31536000');

      // Support range requests for video streaming
      const range = req.headers.range;
      if (range && contentType.startsWith('video/')) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

        // Validate range
        if (start >= stats.size || end >= stats.size || start > end) {
          return res.status(416).json({ error: 'Range not satisfiable' });
        }

        const chunksize = (end - start) + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${stats.size}`);
        res.setHeader('Content-Length', chunksize);

        const readStream = fs.createReadStream(filePath, { start, end });
        readStream.on('error', (streamError) => {
          console.error('Stream error:', streamError);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Stream error' });
          }
        });
        readStream.pipe(res);
      } else {
        const readStream = fs.createReadStream(filePath);
        readStream.on('error', (streamError) => {
          console.error('Stream error:', streamError);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Stream error' });
          }
        });
        readStream.pipe(res);
      }
    } else {
      console.log('File not found: ', fileId);
      console.log('Searched in directory:', mediaDir);

      res.status(404).json({ 
        error: 'File not found',
        requestedFile: fileId,
        message: 'The requested media file could not be found on the server. It may have been removed or the upload failed.',
        availableFiles: files.slice(0, 5) // Show first 5 files for debugging
      });
    }
  } catch (error) {
    console.error('Error serving media file:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

module.exports = router;
