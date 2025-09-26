
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('./auth');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const API_BASE_URL = process.env.API_BASE_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${process.env.PORT || 5000}`);

// Function to add EXP to a user
const addUserEXP = async (userId, expAmount, activityType) => {
  try {
    // Get current exp and level
    const userResult = await pool.query('SELECT exp, level FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
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
    await pool.query(
      'UPDATE users SET exp = $1, level = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [newExp, newLevel, userId]
    );

    console.log(`User ${userId} gained ${expAmount} EXP from ${activityType}. New EXP: ${newExp}, New Level: ${newLevel}`);

    // Create exp history table if not exists
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
    } catch (tableError) {
      console.log('Exp history table already exists or creation failed:', tableError.message);
    }

    // Record EXP gain in history table
    await pool.query(`
      INSERT INTO user_exp_history (user_id, activity_type, exp_gained, new_exp, new_level)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, activityType, expAmount, newExp, newLevel]);

    // Give level up rewards if user leveled up
    if (leveledUp) {
      const levelUpReward = newLevel * 100; // 100 coins per level
      try {
        await pool.query(`
          INSERT INTO user_credits (user_id, balance) VALUES ($1, $2)
          ON CONFLICT (user_id) DO UPDATE SET 
            balance = user_credits.balance + EXCLUDED.balance,
            updated_at = CURRENT_TIMESTAMP
        `, [userId, levelUpReward]);

        console.log(`Level up reward: ${levelUpReward} coins given to user ${userId} for reaching level ${newLevel}`);
      } catch (rewardError) {
        console.error('Error giving level up reward:', rewardError);
      }
    }

    return { success: true, userId, expAmount, newExp, newLevel, leveledUp, levelUpReward: leveledUp ? newLevel * 100 : 0 };

  } catch (error) {
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
router.post('/posts', async (req, res) => {
  try {
    console.log('=== CREATE POST REQUEST ===');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);

    const { content, user, username, level = 1, avatar = 'U', streamingUrl = '' } = req.body;

    // Find user by username
    const userResult = await pool.query('SELECT id, level FROM users WHERE username = $1', [username || user]);
    const userId = userResult.rows.length > 0 ? userResult.rows[0].id : 1; // Default to user ID 1 if not found
    const userLevel = userResult.rows.length > 0 ? userResult.rows[0].level : 1;

    if (!content && !user) {
      console.log('Missing content and user');
      return res.status(400).json({ error: 'Content or user is required' });
    }

    if (!user) {
      console.log('Missing user');
      return res.status(400).json({ error: 'User is required' });
    }

    const result = await pool.query(`
      INSERT INTO posts (user_id, username, content, streaming_url, likes, shares)
      VALUES ($1, $2, $3, $4, 0, 0)
      RETURNING *
    `, [userId, username || user, content ? content.trim() : '', streamingUrl || '']);

    const newPost = result.rows[0];

    // Award XP for creating a post
    if (userId && userId !== 1) { // Don't give XP to default user
      const expResult = await addUserEXP(userId, 50, 'post_created');
      console.log('XP awarded for post creation:', expResult);
    }

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
router.post('/posts/:postId/like', async (req, res) => {
  try {
    const { postId } = req.params;
    const { action } = req.body; // 'like' or 'unlike'

    const postResult = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = postResult.rows[0];
    let newLikes = post.likes;

    if (action === 'like') {
      newLikes += 1;
    } else if (action === 'unlike' && post.likes > 0) {
      newLikes -= 1;
    }

    await pool.query(
      'UPDATE posts SET likes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newLikes, postId]
    );

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
router.post('/posts/:postId/comment', async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, user } = req.body;

    if (!content || !user) {
      return res.status(400).json({ error: 'Content and user are required' });
    }

    // Check if post exists
    const postResult = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Find user by username to get user ID
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [user]);
    const userId = userResult.rows.length > 0 ? userResult.rows[0].id : 1; // Default to user ID 1 if not found

    // Add comment to database
    const commentResult = await pool.query(`
      INSERT INTO post_comments (post_id, user_id, username, content)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [postId, userId, user, content.trim()]);

    const newComment = commentResult.rows[0];

    // Award XP for commenting
    if (userId && userId !== 1) { // Don't give XP to default user
      const expResult = await addUserEXP(userId, 25, 'comment_created');
      console.log('XP awarded for comment creation:', expResult);
    }

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
router.post('/posts/:postId/share', (req, res) => {
  try {
    const { postId } = req.params;

    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    post.shares += 1;
    console.log(`Post ${postId} shared. New shares count: ${post.shares}`);

    res.json({
      postId,
      shares: post.shares,
      message: 'Post shared successfully'
    });
  } catch (error) {
    console.error('Error sharing post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload photo/video for posts
router.post('/upload', (req, res) => {
  try {
    console.log('=== UPLOAD REQUEST DEBUG ===');
    console.log('Request body keys:', Object.keys(req.body || {}));
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Type:', req.body?.type);
    console.log('Data length:', req.body?.data?.length || 0);
    console.log('Filename:', req.body?.filename);
    console.log('User:', req.body?.user);

    // Check if request body exists
    if (!req.body || typeof req.body !== 'object') {
      console.error('Request body is missing or invalid');
      return res.status(400).json({
        error: 'Invalid request body. Please ensure you are sending JSON data.',
        received: typeof req.body
      });
    }

    const { type, data, filename, user } = req.body;

    // Detailed validation with specific error messages
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

    // Validate file type
    const validTypes = ['photo', 'video'];
    if (!validTypes.includes(type)) {
      console.error('Invalid file type:', type);
      return res.status(400).json({
        error: `Invalid file type "${type}". Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Generate unique filename with proper extension
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    let fileExtension = path.extname(filename);

    // If no extension, determine from type and content
    if (!fileExtension) {
      if (type === 'video') {
        fileExtension = '.mp4'; // Default to mp4 for videos
      } else {
        fileExtension = '.jpg'; // Default to jpg for photos
      }
    }

    const fileId = `file_${timestamp}_${randomSuffix}${fileExtension}`;
    const filePath = path.join(__dirname, '../uploads', 'media', fileId);

    // Ensure the uploads/media directory exists
    const uploadsDir = path.join(__dirname, '../uploads', 'media');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    try {
      // Write the base64 data to a file
      fs.writeFileSync(filePath, data, 'base64');

      // Verify file was created and has content
      if (!fs.existsSync(filePath)) {
        throw new Error('File was not created successfully');
      }

      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        fs.unlinkSync(filePath); // Remove empty file
        throw new Error('File was created but is empty');
      }

      console.log(`File saved successfully: ${fileId}, Size: ${stats.size} bytes`);
    } catch (writeError) {
      console.error('Error writing file:', writeError);
      throw new Error(`Failed to save file: ${writeError.message}`);
    }

    const uploadedFile = {
      id: fileId,
      filename,
      type, // 'photo' or 'video'
      data: data, // base64 data without data URL prefix
      uploadedBy: user,
      uploadedAt: new Date().toISOString(),
      url: `/api/feed/media/${fileId}`, // URL to access the file
      size: Buffer.byteLength(data, 'base64') // Accurate file size in bytes
    };

    // Store in memory (in production, use proper file storage)
    if (!global.uploadedFiles) {
      global.uploadedFiles = {};
    }
    global.uploadedFiles[fileId] = uploadedFile;

    console.log(`${type} uploaded:`, filename, 'by', user, `Size: ${uploadedFile.size} bytes`);

    res.json({
      success: true,
      fileId: fileId.replace(fileExtension, ''), // Return ID without extension for compatibility
      url: `/api/feed/media/${fileId}`, // But use full filename in URL
      filename: filename,
      type: type
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create post with media
router.post('/posts/with-media', async (req, res) => {
  try {
    const { content, user, username, level = 1, avatar = 'U', mediaFiles = [], streamingUrl = '' } = req.body;

    console.log('=== CREATE POST WITH MEDIA REQUEST ===');
    console.log('Content:', content);
    console.log('User:', user);
    console.log('Username:', username);
    console.log('Media Files:', JSON.stringify(mediaFiles, null, 2));

    // Find user by username
    const userResult = await pool.query('SELECT id, level FROM users WHERE username = $1', [username || user]);
    const userId = userResult.rows.length > 0 ? userResult.rows[0].id : 1;
    const userLevel = userResult.rows.length > 0 ? userResult.rows[0].level : 1;

    if (!user) {
      return res.status(400).json({ error: 'User is required' });
    }

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
    `, [userId, username || user, content ? content.trim() : '', JSON.stringify(processedMediaFiles), streamingUrl || '']);

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
router.delete('/posts/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    const { username, role } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Get the post to check ownership
    const postResult = await pool.query('SELECT * FROM posts WHERE id = $1', [postId]);
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = postResult.rows[0];

    // Check if user can delete this post (owner or admin)
    if (post.username !== username && role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    // Delete related comments first
    await pool.query('DELETE FROM post_comments WHERE post_id = $1', [postId]);

    // Delete the post
    await pool.query('DELETE FROM posts WHERE id = $1', [postId]);

    console.log(`Post ${postId} deleted by ${username} (${role || 'user'})`);

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
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
