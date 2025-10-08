const express = require('express');
const http = require('http');
// const socketIo = require('socket.io'); // Removed - handled by gateway
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const { Pool } = require('pg');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // Required for JWT and signature verification

// Import route modules
const { router: authRouter, authenticateToken } = require('./routes/auth');
const usersRouter = require('./routes/users');
const chatRouter = require('./routes/chat');
const creditsRouter = require('./routes/credits');
const feedRouter = require('./routes/feed');
const roomsRouter = require('./routes/rooms');
const withdrawRouter = require('./routes/withdraw');
const fetch = require('node-fetch'); // Import node-fetch
const { createProxyMiddleware } = require('http-proxy-middleware'); // For Socket.IO proxy
const { maskEmail, maskToken, maskSensitiveData } = require('./utils/maskSensitiveData');

// Import LowCard bot using CommonJS require
let lowCardBot = null;
try {
  // Load JavaScript version to resolve TypeScript syntax error
  lowCardBot = require('./games/lowcard.js');
  console.log('LowCard bot loaded successfully from JavaScript');
  
  // Initialize LowCard persistence tables and auto-refund system
  if (lowCardBot && lowCardBot.initializeLowCardTables) {
    lowCardBot.initializeLowCardTables().catch(err => {
      console.error('Failed to initialize LowCard tables:', err);
    });
  }
} catch (error) {
  console.error('Failed to load LowCard bot from JavaScript:', error);
  console.error('Error details:', error.message);
}

const app = express();
const server = http.createServer(app);
const GATEWAY_PORT = process.env.GATEWAY_PORT || 8000;

// Socket.IO Proxy to Gateway (port 8000) - MUST BE FIRST BEFORE OTHER MIDDLEWARE
// This allows external clients to connect to Socket Gateway through the main API server
app.use('/socket.io', createProxyMiddleware({
  target: 'http://localhost:8000',
  ws: true, // enable websocket proxy
  changeOrigin: false, // Don't change origin for local proxy
  logLevel: 'debug',
  pathRewrite: (path, req) => {
    // Express strips /socket.io from the path, we need to add it back
    const fullPath = '/socket.io' + path;
    console.log('🔌 Proxying Socket.IO:', req.method, fullPath);
    return fullPath;
  },
  onError: (err, req, res) => {
    console.error('❌ Socket.IO Proxy error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Socket.IO Proxy Error');
  }
}));

// Socket.IO removed - now handled by dedicated gateway server

const PORT = process.env.PORT || 5000;
const API_BASE_URL = process.env.API_BASE_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${PORT}`); // For constructing image URLs
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('⚠️  WARNING: Using default JWT secret. Set JWT_SECRET environment variable for production!');
  return 'your_super_secret_key_for_development_only';
})(); // JWT secret key

// Multer storage configuration for emojis - redirected to assets
const storageEmoji = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'assets/emoticon/');
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const uploadEmoji = multer({ storage: storageEmoji });

// Multer storage configuration for gifts - redirected to assets
const storageGift = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'assets/gift/image/');
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const uploadGift = multer({ storage: storageGift });

// Multer storage configuration for generic uploads (e.g., media for posts) - redirected to assets
const storageUpload = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'assets/media/');
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage: storageUpload });



// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Test database connection and load initial data
pool.connect(async (err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Successfully connected to PostgreSQL database');

    // Add avatar_frame column to users table if it doesn't exist
      try {
        await client.query(`
          ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_frame VARCHAR(500)
        `);
        console.log('✅ Avatar frame column added to users table');
      } catch (alterError) {
        console.log('Avatar frame column might already exist or other issue:', alterError.message);
      }

      // Add status column to users table if it doesn't exist
      try {
        await client.query(`
          ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'offline'
        `);
        console.log('✅ Status column added to users table');
      } catch (alterError) {
        console.log('Status column might already exist or other issue:', alterError.message);
      }

      // Add profile_background column to users table if it doesn't exist
      try {
        await client.query(`
          ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_background VARCHAR(500)
        `);
        console.log('✅ Profile background column added to users table');
      } catch (alterError) {
        console.log('Profile background column might already exist or other issue:', alterError.message);
      }

      // Create headwear tables if they don't exist
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS headwear_items (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            image VARCHAR(500),
            price INTEGER NOT NULL DEFAULT 0,
            duration_days INTEGER NOT NULL DEFAULT 30,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS user_headwear (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL,
            headwear_id INTEGER REFERENCES headwear_items(id),
            purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            is_active BOOLEAN DEFAULT true
          )
        `);

        // Insert default headwear items if none exist
        const existingItems = await client.query('SELECT COUNT(*) FROM headwear_items');
        console.log('Current headwear items count:', existingItems.rows[0].count);

        if (parseInt(existingItems.rows[0].count) === 0) {
          await client.query(`
            INSERT INTO headwear_items (name, description, image, price, duration_days, is_active) VALUES
            ('Frame Avatar Classic', 'Bingkai avatar klasik dengan desain elegan', '/assets/frame_ava/frame_av.jpeg', 50000, 7, true),
            ('Frame Avatar Premium', 'Bingkai avatar premium dengan efek khusus', '/assets/frame_ava/frame_av1.jpeg', 50000, 7, true),
            ('Frame Avatar Elite', 'Bingkai avatar elite dengan ornamen mewah', '/assets/frame_ava/frame_av3.png', 75000, 10, true),
            ('Frame Avatar Royal', 'Bingkai avatar royal dengan detail istimewa', '/assets/frame_ava/frame_av4.png', 100000, 14, true)
          `);
          console.log('✅ Default headwear items created with is_active=true');
        } else {
          // Check if all 4 items exist, if not add missing ones
          const currentItems = await client.query('SELECT name FROM headwear_items');
          const itemNames = currentItems.rows.map(row => row.name);

          const requiredItems = [
            { name: 'Frame Avatar Classic', description: 'Bingkai avatar klasik dengan desain elegan', image: '/assets/frame_ava/frame_av.jpeg', price: 50000, duration: 7 },
            { name: 'Frame Avatar Premium', description: 'Bingkai avatar premium dengan efek khusus', image: '/assets/frame_ava/frame_av1.jpeg', price: 50000, duration: 7 },
            { name: 'Frame Avatar Elite', description: 'Bingkai avatar elite dengan ornamen mewah', image: '/assets/frame_ava/frame_av3.png', price: 75000, duration: 10 },
            { name: 'Frame Avatar Royal', description: 'Bingkai avatar royal dengan detail istimewa', image: '/assets/frame_ava/frame_av4.png', price: 100000, duration: 14 }
          ];

          for (const item of requiredItems) {
            if (!itemNames.includes(item.name)) {
              await client.query(`
                INSERT INTO headwear_items (name, description, image, price, duration_days, is_active)
                VALUES ($1, $2, $3, $4, $5, true)
              `, [item.name, item.description, item.image, item.price, item.duration]);
              console.log(`✅ Added missing headwear item: ${item.name}`);
            }
          }

          // Ensure all items are active
          await client.query('UPDATE headwear_items SET is_active = true WHERE is_active IS NULL OR is_active = false');
          console.log('✅ Ensured all headwear items are active');
        }

        console.log('✅ Headwear tables initialized successfully');
      } catch (tableError) {
        console.error('Error creating headwear tables:', tableError);
      }

      // Create frame tables if they don't exist
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS frame_items (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            image VARCHAR(500),
            price INTEGER NOT NULL DEFAULT 0,
            duration_days INTEGER NOT NULL DEFAULT 14,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS user_frames (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            frame_id INTEGER REFERENCES frame_items(id),
            purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            is_active BOOLEAN DEFAULT true,
            UNIQUE(user_id, frame_id)
          )
        `);

        // Create indexes for better performance
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_user_frames_user_id 
          ON user_frames(user_id, is_active)
        `);

        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_user_frames_expires_at 
          ON user_frames(expires_at)
        `);

        // Insert default frame items if none exist
        const existingFrames = await client.query('SELECT COUNT(*) FROM frame_items');
        console.log('Current frame items count:', existingFrames.rows[0].count);

        if (parseInt(existingFrames.rows[0].count) === 0) {
          await client.query(`
            INSERT INTO frame_items (name, description, image, price, duration_days, is_active) VALUES
            ('Frame Classic', 'Bingkai avatar klasik dengan desain elegan', '/assets/frame_ava/frame_av.png', 50000, 14, true),
            ('Frame Premium', 'Bingkai avatar premium dengan efek khusus', '/assets/frame_ava/frame_av1.jpeg', 75000, 14, true),
            ('Frame Elite', 'Bingkai avatar elite dengan ornamen mewah', '/assets/frame_ava/frame_av3.png', 100000, 14, true),
            ('Frame Royal', 'Bingkai avatar royal dengan detail istimewa', '/assets/frame_ava/frame_av4.png', 150000, 14, true)
          `);
          console.log('✅ Default frame items created (14-day rental)');
        }

        console.log('✅ Frame tables initialized successfully');
      } catch (tableError) {
        console.error('Error creating frame tables:', tableError);
      }

    // Create families tables if they don't exist
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS families (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL UNIQUE,
          description TEXT,
          cover_image TEXT,
          auto_join BOOLEAN DEFAULT true,
          created_by_id INTEGER NOT NULL,
          created_by_username VARCHAR(50) NOT NULL,
          members_count INTEGER DEFAULT 1,
          max_members INTEGER DEFAULT 50,
          level INTEGER DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS family_members (
          id SERIAL PRIMARY KEY,
          family_id INTEGER REFERENCES families(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL,
          username VARCHAR(50) NOT NULL,
          family_role VARCHAR(20) DEFAULT 'member',
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT true,
          UNIQUE(family_id, user_id)
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS family_assets (
          id SERIAL PRIMARY KEY,
          family_id INTEGER,
          asset_type VARCHAR(20) NOT NULL,
          asset_data TEXT NOT NULL,
          filename VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS family_activities (
          id SERIAL PRIMARY KEY,
          family_id INTEGER REFERENCES families(id) ON DELETE CASCADE,
          activity_type VARCHAR(50) NOT NULL,
          points INTEGER DEFAULT 1,
          user_id INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('✅ Families tables initialized successfully');
    } catch (tableError) {
      console.error('Error creating families tables:', tableError);
    }

    // Create tokens table for verification tokens and cleanup
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS tokens (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          token VARCHAR(255) NOT NULL UNIQUE,
          token_type VARCHAR(50) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          is_used BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ Tokens table initialized successfully');
    } catch (tableError) {
      console.error('Error creating tokens table:', tableError);
    }

    // Add streaming_url column to posts table if it doesn't exist
    try {
      await client.query(`
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS streaming_url TEXT
      `);
      console.log('✅ streaming_url column added to posts table');
    } catch (alterError) {
      console.log('streaming_url column might already exist or other issue:', alterError.message);
    }

    // Create withdrawal system tables if they don't exist
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_gift_earnings_balance (
          id SERIAL PRIMARY KEY,
          user_id INTEGER UNIQUE NOT NULL,
          balance INTEGER DEFAULT 0,
          total_earned INTEGER DEFAULT 0,
          total_withdrawn INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS user_linked_accounts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          account_type VARCHAR(20) NOT NULL,
          account_id VARCHAR(50) NOT NULL,
          account_name VARCHAR(100) NOT NULL,
          account_number VARCHAR(50) NOT NULL,
          holder_name VARCHAR(100) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS withdrawal_requests (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          amount_usd DECIMAL(10,2) NOT NULL,
          amount INTEGER NOT NULL,
          withdrawal_method VARCHAR(20) NOT NULL,
          account_type VARCHAR(20) NOT NULL,
          account_name VARCHAR(100) NOT NULL,
          account_number VARCHAR(50) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          failure_reason TEXT,
          xendit_transaction_id VARCHAR(255),
          fee_percentage DECIMAL(5,2) DEFAULT 0.03,
          net_amount DECIMAL(12,2) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create gift earnings table
      await client.query(`
        CREATE TABLE IF NOT EXISTS gift_earnings (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          gift_id VARCHAR(50) NOT NULL,
          gift_name VARCHAR(255) NOT NULL,
          gift_price INTEGER NOT NULL,
          sender_username VARCHAR(50) NOT NULL,
          room_id VARCHAR(50),
          is_private BOOLEAN DEFAULT false,
          user_share INTEGER NOT NULL,
          system_share INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add is_private column if it doesn't exist
      try {
        await client.query(`
          ALTER TABLE gift_earnings ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false
        `);
        console.log('✅ is_private column added to gift_earnings table');
      } catch (alterError) {
        console.log('is_private column might already exist or other issue:', alterError.message);
      }

      console.log('✅ Withdrawal system and gift earnings tables initialized successfully');
    } catch (tableError) {
      console.error('Error creating withdrawal system tables:', tableError);
    }

    // Load existing rooms from database
    try {
      const result = await client.query(`
        SELECT id, name, description, managed_by, type, members, max_members, created_by, created_at
        FROM rooms 
        ORDER BY created_at ASC
      `);

      rooms = result.rows.map(row => ({
        id: row.id.toString(),
        name: row.name,
        description: row.description,
        managedBy: row.managed_by,
        type: row.type,
        members: row.members || 0,
        maxMembers: row.max_members || 25,
        createdBy: row.created_by,
        createdAt: row.created_at
      }));

      console.log(`Loaded ${rooms.length} rooms from database`);

      // Room participants now managed by socket gateway

    } catch (loadError) {
      console.error('Error loading rooms from database:', loadError);
      rooms = []; // Initialize empty array on error
    }

    release();
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for potential file data
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // For form data

// Error handling middleware for JSON parsing
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Bad JSON:', err.message);
    return res.status(400).json({ error: 'Invalid JSON format: ' + err.message });
  }
  next();
});

// Add request logging for API routes only
app.use('/api', (req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  if (req.path.includes('admin')) {
    console.log('🔐 Admin endpoint accessed');
    console.log('Headers:', {
      authorization: req.headers.authorization ? 'Present' : 'Missing',
      'content-type': req.headers['content-type']
    });
    console.log('Body:', req.body);
  }
  next();
});

// Also add request logging for chat routes
app.use('/chat', (req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  next();
});

// Handle preflight requests
app.options('*', cors());

// Import and mount route modules
const adminRouter = require('./routes/admin');
const supportRouter = require('./routes/support'); // Import support routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/user', usersRouter); // Alias for user status endpoint
app.use('/api/chat', chatRouter);
app.use('/api/credits', creditsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/feed', feedRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/withdraw', withdrawRouter); // Mount withdrawal routes at /api/withdraw to avoid conflicts
app.use('/api/support', supportRouter); // Mount support routes

// JWT authentication middleware is now imported from auth module

// In-memory database for non-critical data (posts will be moved to DB later)
let posts = [];

// Room participants tracking
// roomParticipants removed - now fetched from socket gateway

// Function to generate room description
const generateRoomDescription = (roomName, creatorUsername) => {
  return `${roomName} - Welcome to merchant official chatroom. This room is managed by ${creatorUsername}`;
};

let verificationTokens = [];

// Email verification simulation (replace with real email service)
const sendVerificationEmail = (email, token) => {
  console.log(`=== EMAIL VERIFICATION ===`);
  console.log(`To: ${maskEmail(email)}`);
  console.log(`Subject: Verify Your ChatMe Account`);
  console.log(`Verification Link: http://0.0.0.0:5000/api/verify-email?token=${maskToken(token)}`);
  console.log(`========================`);
  return true;
};

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


// Store API endpoints

// Get headwear items for store
app.get('/api/store/headwear', authenticateToken, async (req, res) => {
  try {
    console.log('=== FETCHING HEADWEAR ITEMS ===');

    const result = await pool.query(`
      SELECT id, name, description, image, price, duration_days, is_active
      FROM headwear_items
      ORDER BY price ASC
    `);

    console.log('Raw headwear data from database:', result.rows);

    const items = result.rows
      .filter(row => row.is_active !== false) // Include items where is_active is true or null
      .map(row => {
        let imageUrl = row.image;
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = `${API_BASE_URL}${imageUrl}`;
        }
        
        return {
          id: row.id.toString(),
          name: row.name,
          description: row.description,
          image: imageUrl,
          price: row.price,
          duration: row.duration_days
        };
      });

    console.log('Processed headwear items:', items);
    console.log('Total items returned:', items.length);

    res.json({ items });
  } catch (error) {
    console.error('Error fetching headwear items:', error);
    res.status(500).json({ error: 'Failed to fetch headwear items' });
  }
});

// Get user's owned headwear
app.get('/api/store/user-headwear', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT uh.id, uh.headwear_id, uh.expires_at, uh.is_active,
             hi.name, hi.image
      FROM user_headwear uh
      JOIN headwear_items hi ON uh.headwear_id = hi.id
      WHERE uh.user_id = $1 AND uh.is_active = true
      ORDER BY uh.purchased_at DESC
    `, [userId]);

    const headwear = result.rows.map(row => {
      let imageUrl = row.image;
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `${API_BASE_URL}${imageUrl}`;
      }
      
      return {
        id: row.id.toString(),
        headwearId: row.headwear_id.toString(),
        name: row.name,
        image: imageUrl,
        expiresAt: row.expires_at,
        isActive: row.is_active && new Date(row.expires_at) > new Date()
      };
    });

    res.json({ headwear });
  } catch (error) {
    console.error('Error fetching user headwear:', error);
    res.status(500).json({ error: 'Failed to fetch user headwear' });
  }
});

// Get frame items for store
app.get('/api/store/frames', authenticateToken, async (req, res) => {
  try {
    console.log('=== FETCHING FRAME ITEMS ===');

    const result = await pool.query(`
      SELECT id, name, description, image, price, duration_days, is_active
      FROM frame_items
      WHERE is_active = true
      ORDER BY price ASC
    `);

    console.log('Raw frame data from database:', result.rows);

    const items = result.rows.map(row => {
      let imageUrl = row.image;
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `${API_BASE_URL}${imageUrl}`;
      }
      
      return {
        id: row.id.toString(),
        name: row.name,
        description: row.description,
        image: imageUrl,
        price: row.price,
        duration: row.duration_days
      };
    });

    console.log('Processed frame items:', items);
    console.log('Total frame items returned:', items.length);

    res.json({ items });
  } catch (error) {
    console.error('Error fetching frame items:', error);
    res.status(500).json({ error: 'Failed to fetch frame items' });
  }
});

// Get user's owned frames
app.get('/api/store/user-frames', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT uf.id, uf.frame_id, uf.expires_at, uf.is_active,
             fi.name, fi.image
      FROM user_frames uf
      JOIN frame_items fi ON uf.frame_id = fi.id
      WHERE uf.user_id = $1 AND uf.is_active = true
      ORDER BY uf.purchased_at DESC
    `, [userId]);

    const frames = result.rows.map(row => {
      let imageUrl = row.image;
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `${API_BASE_URL}${imageUrl}`;
      }
      
      return {
        id: row.id.toString(),
        frameId: row.frame_id.toString(),
        name: row.name,
        image: imageUrl,
        expiresAt: row.expires_at,
        isActive: row.is_active && new Date(row.expires_at) > new Date()
      };
    });

    res.json({ frames });
  } catch (error) {
    console.error('Error fetching user frames:', error);
    res.status(500).json({ error: 'Failed to fetch user frames' });
  }
});

// Purchase frame endpoint
app.post('/api/frame/purchase', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { frameId } = req.body;

    console.log('=== FRAME PURCHASE REQUEST ===');
    console.log('User ID:', userId);
    console.log('Frame ID:', frameId);

    if (!frameId) {
      return res.status(400).json({ error: 'Frame ID is required' });
    }

    await pool.query('BEGIN');

    try {
      const frameResult = await pool.query(
        'SELECT * FROM frame_items WHERE id = $1 AND is_active = true',
        [frameId]
      );

      if (frameResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'Frame item not found' });
      }

      const frameItem = frameResult.rows[0];

      const balanceResult = await pool.query(
        'SELECT balance FROM user_credits WHERE user_id = $1',
        [userId]
      );

      if (balanceResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'User credits not found' });
      }

      const currentBalance = balanceResult.rows[0].balance;

      if (currentBalance < frameItem.price) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      const existingResult = await pool.query(`
        SELECT * FROM user_frames 
        WHERE user_id = $1 AND frame_id = $2 AND is_active = true AND expires_at > NOW()
      `, [userId, frameId]);

      if (existingResult.rows.length > 0) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'You already own this frame' });
      }

      const newBalance = currentBalance - frameItem.price;
      await pool.query(
        'UPDATE user_credits SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [newBalance, userId]
      );

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + frameItem.duration_days);

      await pool.query(`
        INSERT INTO user_frames (user_id, frame_id, expires_at)
        VALUES ($1, $2, $3)
      `, [userId, frameId, expiresAt]);

      await pool.query(`
        UPDATE users 
        SET avatar_frame = $1
        WHERE id = $2
      `, [frameItem.image, userId]);

      await pool.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type)
        VALUES ($1, NULL, $2, 'frame_purchase')
      `, [userId, frameItem.price]);

      await pool.query('COMMIT');

      console.log(`Frame ${frameItem.name} purchased by user ${userId} for ${frameItem.price} credits`);

      res.json({
        success: true,
        message: 'Frame purchased successfully',
        frame: {
          id: frameItem.id.toString(),
          name: frameItem.name,
          image: frameItem.image,
          expiresAt: expiresAt
        },
        newBalance: newBalance
      });
    } catch (txError) {
      await pool.query('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    console.error('Error purchasing frame:', error);
    res.status(500).json({ error: 'Failed to purchase frame' });
  }
});

// Purchase headwear endpoint
app.post('/api/headwear/purchase', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { headwearId } = req.body;

    console.log('=== HEADWEAR PURCHASE REQUEST ===');
    console.log('User ID:', userId);
    console.log('Headwear ID:', headwearId);

    if (!headwearId) {
      return res.status(400).json({ error: 'Headwear ID is required' });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Check if headwear item exists
      const headwearResult = await pool.query(
        'SELECT * FROM headwear_items WHERE id = $1 AND is_active = true',
        [headwearId]
      );

      if (headwearResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'Headwear item not found' });
      }

      const headwearItem = headwearResult.rows[0];

      // Check user's balance
      const balanceResult = await pool.query(
        'SELECT balance FROM user_credits WHERE user_id = $1',
        [userId]
      );

      if (balanceResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'User credits not found' });
      }

      const currentBalance = balanceResult.rows[0].balance;

      if (currentBalance < headwearItem.price) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Check if user already owns this headwear and it's still active
      const existingResult = await pool.query(`
        SELECT * FROM user_headwear 
        WHERE user_id = $1 AND headwear_id = $2 AND is_active = true AND expires_at > NOW()
      `, [userId, headwearId]);

      if (existingResult.rows.length > 0) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'You already own this headwear' });
      }

      // Deduct credits
      const newBalance = currentBalance - headwearItem.price;
      await pool.query(
        'UPDATE user_credits SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [newBalance, userId]
      );

      // Calculate expiry date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + headwearItem.duration_days);

      // Add headwear to user's collection
      await pool.query(`
        INSERT INTO user_headwear (user_id, headwear_id, expires_at)
        VALUES ($1, $2, $3)
      `, [userId, headwearId, expiresAt]);

      // Automatically set the purchased headwear as active avatar frame
      await pool.query(`
        UPDATE users 
        SET avatar_frame = $1
        WHERE id = $2
      `, [headwearItem.image, userId]);

      // Record the transaction
      await pool.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type)
        VALUES ($1, NULL, $2, 'headwear_purchase')
      `, [userId, headwearItem.price]);

      await pool.query('COMMIT');

      console.log(`Headwear ${headwearItem.name} purchased by user ${userId} for ${headwearItem.price} credits`);

      res.json({
        success: true,
        message: 'Headwear purchased successfully',
        newBalance: newBalance,
        expiresAt: expiresAt.toISOString()
      });

    } catch (transactionError) {
      await pool.query('ROLLBACK');
      throw transactionError;
    }

  } catch (error) {
    console.error('Error purchasing headwear:', error);
    res.status(500).json({ error: 'Failed to purchase headwear' });
  }
});

// Frame Store API endpoints

// Get frame items for store
app.get('/api/store/frames', authenticateToken, async (req, res) => {
  try {
    console.log('=== FETCHING FRAME ITEMS ===');

    const result = await pool.query(`
      SELECT id, name, description, image, price, duration_days, is_active
      FROM frame_items
      WHERE is_active = true
      ORDER BY price ASC
    `);

    console.log('Raw frame data from database:', result.rows);

    const items = result.rows.map(row => {
      let imageUrl = row.image;
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `${API_BASE_URL}${imageUrl}`;
      }
      
      return {
        id: row.id.toString(),
        name: row.name,
        description: row.description,
        image: imageUrl,
        price: row.price,
        duration: row.duration_days
      };
    });

    console.log('Processed frame items:', items);
    console.log('Total frame items returned:', items.length);

    res.json({ items });
  } catch (error) {
    console.error('Error fetching frame items:', error);
    res.status(500).json({ error: 'Failed to fetch frame items' });
  }
});

// Get user's owned frames
app.get('/api/store/user-frames', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT uf.id, uf.frame_id, uf.expires_at, uf.is_active,
             fi.name, fi.image
      FROM user_frames uf
      JOIN frame_items fi ON uf.frame_id = fi.id
      WHERE uf.user_id = $1 AND uf.is_active = true
      ORDER BY uf.purchased_at DESC
    `, [userId]);

    const frames = result.rows.map(row => {
      let imageUrl = row.image;
      if (imageUrl && !imageUrl.startsWith('http')) {
        imageUrl = `${API_BASE_URL}${imageUrl}`;
      }
      
      return {
        id: row.id.toString(),
        frameId: row.frame_id.toString(),
        name: row.name,
        image: imageUrl,
        expiresAt: row.expires_at,
        isActive: row.is_active && new Date(row.expires_at) > new Date()
      };
    });

    res.json({ frames });
  } catch (error) {
    console.error('Error fetching user frames:', error);
    res.status(500).json({ error: 'Failed to fetch user frames' });
  }
});

// Purchase frame endpoint
app.post('/api/frames/purchase', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { frameId } = req.body;

    console.log('=== FRAME PURCHASE REQUEST ===');
    console.log('User ID:', userId);
    console.log('Frame ID:', frameId);

    if (!frameId) {
      return res.status(400).json({ error: 'Frame ID is required' });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Check if frame item exists
      const frameResult = await pool.query(
        'SELECT * FROM frame_items WHERE id = $1 AND is_active = true',
        [frameId]
      );

      if (frameResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'Frame item not found' });
      }

      const frameItem = frameResult.rows[0];

      // Check user's balance
      const balanceResult = await pool.query(
        'SELECT balance FROM user_credits WHERE user_id = $1',
        [userId]
      );

      if (balanceResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'User credits not found' });
      }

      const currentBalance = balanceResult.rows[0].balance;

      if (currentBalance < frameItem.price) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Check if user already owns this frame and it's still active
      const existingResult = await pool.query(`
        SELECT * FROM user_frames 
        WHERE user_id = $1 AND frame_id = $2 AND is_active = true AND expires_at > NOW()
      `, [userId, frameId]);

      if (existingResult.rows.length > 0) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'You already own this frame' });
      }

      // Deduct credits
      const newBalance = currentBalance - frameItem.price;
      await pool.query(
        'UPDATE user_credits SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [newBalance, userId]
      );

      // Calculate expiry date (14 days rental)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + frameItem.duration_days);

      // Deactivate all other frames for this user
      await pool.query(`
        UPDATE user_frames 
        SET is_active = false
        WHERE user_id = $1 AND is_active = true
      `, [userId]);

      // Add frame to user's collection (active and equipped)
      await pool.query(`
        INSERT INTO user_frames (user_id, frame_id, expires_at, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (user_id, frame_id) 
        DO UPDATE SET expires_at = $3, is_active = true, purchased_at = CURRENT_TIMESTAMP
      `, [userId, frameId, expiresAt]);

      // Automatically equip the purchased frame as avatar frame
      await pool.query(`
        UPDATE users 
        SET avatar_frame = $1
        WHERE id = $2
      `, [frameItem.image, userId]);

      // Record the transaction
      await pool.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type)
        VALUES ($1, NULL, $2, 'frame_purchase')
      `, [userId, frameItem.price]);

      await pool.query('COMMIT');

      console.log(`Frame ${frameItem.name} purchased by user ${userId} for ${frameItem.price} credits`);

      res.json({
        success: true,
        message: 'Frame purchased and equipped successfully',
        newBalance: newBalance,
        expiresAt: expiresAt.toISOString()
      });

    } catch (transactionError) {
      await pool.query('ROLLBACK');
      throw transactionError;
    }

  } catch (error) {
    console.error('Error purchasing frame:', error);
    res.status(500).json({ error: 'Failed to purchase frame' });
  }
});

// Equip frame endpoint
app.post('/api/frames/equip', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { frameId } = req.body;

    if (!frameId) {
      return res.status(400).json({ error: 'Frame ID is required' });
    }

    // Check if user owns this frame and it's not expired
    const frameResult = await pool.query(`
      SELECT uf.*, fi.image, fi.name
      FROM user_frames uf
      JOIN frame_items fi ON uf.frame_id = fi.id
      WHERE uf.user_id = $1 AND uf.frame_id = $2 AND uf.expires_at > NOW()
    `, [userId, frameId]);

    if (frameResult.rows.length === 0) {
      return res.status(404).json({ error: 'Frame not found or expired' });
    }

    const frame = frameResult.rows[0];

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Deactivate all other frames
      await pool.query(`
        UPDATE user_frames 
        SET is_active = false
        WHERE user_id = $1
      `, [userId]);

      // Activate selected frame
      await pool.query(`
        UPDATE user_frames 
        SET is_active = true
        WHERE user_id = $1 AND frame_id = $2
      `, [userId, frameId]);

      // Update user's avatar_frame
      await pool.query(`
        UPDATE users 
        SET avatar_frame = $1
        WHERE id = $2
      `, [frame.image, userId]);

      await pool.query('COMMIT');

      res.json({
        success: true,
        message: `Frame "${frame.name}" equipped successfully`
      });

    } catch (transactionError) {
      await pool.query('ROLLBACK');
      throw transactionError;
    }

  } catch (error) {
    console.error('Error equipping frame:', error);
    res.status(500).json({ error: 'Failed to equip frame' });
  }
});

// Family Management Endpoints

// Create new family
app.post('/api/families', authenticateToken, async (req, res) => {
  try {
    const { name, description, coverImage, autoJoin, createdBy } = req.body;
    const userId = req.user.id;
    const username = req.user.username;

    console.log('=== CREATE FAMILY REQUEST ===');
    console.log('User ID:', userId);
    console.log('Username:', username);
    console.log('Family Name:', name);

    if (!name || !description) {
      return res.status(400).json({ error: 'Nama keluarga dan pengumuman harus diisi' });
    }

    // Check if family name already exists
    const existingFamily = await pool.query(
      'SELECT id FROM families WHERE LOWER(name) = LOWER($1)',
      [name.trim()]
    );

    if (existingFamily.rows.length > 0) {
      return res.status(400).json({ error: 'Nama keluarga sudah digunakan' });
    }

    // Get dedicated client for transaction
    const FAMILY_CREATION_COST = 9600;
    const client = await pool.connect();

    try {
      // Start transaction
      await client.query('BEGIN');

      // Check user's credit balance (inside transaction for consistency)
      const balanceResult = await client.query(
        'SELECT balance FROM user_credits WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      if (balanceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: 'Saldo tidak ditemukan' });
      }

      const currentBalance = balanceResult.rows[0].balance;

      if (currentBalance < FAMILY_CREATION_COST) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(400).json({ 
          error: `Saldo tidak cukup. Dibutuhkan ${FAMILY_CREATION_COST.toLocaleString('id-ID')} coin untuk membuat keluarga.`,
          required: FAMILY_CREATION_COST,
          current: currentBalance
        });
      }

      // Deduct coins from user's balance
      const newBalance = currentBalance - FAMILY_CREATION_COST;
      await client.query(
        'UPDATE user_credits SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [newBalance, userId]
      );

      // Record the transaction
      await client.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
        VALUES ($1, NULL, $2, 'family_creation', $3)
      `, [userId, FAMILY_CREATION_COST, `Membuat keluarga "${name.trim()}"`]);

      console.log(`✅ Deducted ${FAMILY_CREATION_COST} coins from user ${userId} for family creation`);

      // Save cover image if provided
      let coverImagePath = null;
      if (coverImage) {
        const imageId = `family_cover_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Store in database
        await client.query(`
          INSERT INTO family_assets (family_id, asset_type, asset_data, filename)
          VALUES (NULL, 'cover_temp', $1, $2)
        `, [coverImage, `${imageId}.jpg`]);

        coverImagePath = `/api/families/cover/${imageId}`;
      }

      // Insert family
      const familyResult = await client.query(`
        INSERT INTO families (name, description, cover_image, auto_join, created_by_id, created_by_username)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [name.trim(), description.trim(), coverImagePath, autoJoin, userId, username]);

      const newFamily = familyResult.rows[0];

      // Add creator as family admin (different from global admin role)
      await client.query(`
        INSERT INTO family_members (family_id, user_id, username, family_role)
        VALUES ($1, $2, $3, 'admin')
      `, [newFamily.id, userId, username]);

      // Update cover image with actual family_id
      if (coverImage) {
        await client.query(`
          INSERT INTO family_assets (family_id, asset_type, asset_data, filename) 
          VALUES ($1, 'cover', $2, $3)
          ON CONFLICT DO NOTHING
        `, [newFamily.id, coverImage, `family_cover_${newFamily.id}.jpg`]);
      }

      // Commit transaction
      await client.query('COMMIT');
      client.release();

      console.log(`✅ Family created successfully: ${newFamily.name} (Cost: ${FAMILY_CREATION_COST} coins)`);

      res.status(201).json({
        success: true,
        family: {
          id: newFamily.id.toString(),
          name: newFamily.name,
          description: newFamily.description,
          coverImage: newFamily.cover_image,
          autoJoin: newFamily.auto_join,
          createdBy: newFamily.created_by_username,
          membersCount: newFamily.members_count,
          level: newFamily.level,
          createdAt: newFamily.created_at
        },
        newBalance: newBalance,
        cost: FAMILY_CREATION_COST
      });

    } catch (txError) {
      await client.query('ROLLBACK');
      client.release();
      console.error('Transaction failed, rolled back:', txError);
      throw txError;
    }

  } catch (error) {
    console.error('Error creating family:', error);
    res.status(500).json({ error: 'Gagal membuat keluarga' });
  }
});

// Get all families
app.get('/api/families', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        f.*,
        COUNT(fm.id) as actual_members_count
      FROM families f
      LEFT JOIN family_members fm ON f.id = fm.family_id AND fm.is_active = true
      GROUP BY f.id
      ORDER BY f.created_at DESC
    `);

    const families = result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description,
      logo: row.cover_image,
      members: row.actual_members_count || 1,
      maxMembers: row.max_members || 50,
      level: row.level || 1,
      isJoined: false, // Will be updated based on user context
      type: 'FAMILY',
      autoJoin: row.auto_join,
      createdBy: row.created_by_username,
      createdAt: row.created_at
    }));

    res.json(families);
  } catch (error) {
    console.error('Error fetching families:', error);
    res.status(500).json({ error: 'Gagal mengambil data keluarga' });
  }
});

// Join family
app.post('/api/families/:familyId/join', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const userId = req.user.id;
    const username = req.user.username;

    // Check if family exists
    const familyResult = await pool.query(
      'SELECT * FROM families WHERE id = $1',
      [familyId]
    );

    if (familyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Keluarga tidak ditemukan' });
    }

    const family = familyResult.rows[0];

    // Check if user is already a member
    const existingMember = await pool.query(
      'SELECT * FROM family_members WHERE family_id = $1 AND user_id = $2 AND is_active = true',
      [familyId, userId]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: 'Anda sudah menjadi anggota keluarga ini' });
    }

    // Check if family is full
    const membersCount = await pool.query(
      'SELECT COUNT(*) FROM family_members WHERE family_id = $1 AND is_active = true',
      [familyId]
    );

    if (parseInt(membersCount.rows[0].count) >= family.max_members) {
      return res.status(400).json({ error: 'Keluarga sudah penuh' });
    }

    // Add user as family member (family role, not global role)
    await pool.query(`
      INSERT INTO family_members (family_id, user_id, username, family_role)
      VALUES ($1, $2, $3, 'member')
      ON CONFLICT (family_id, user_id) 
      DO UPDATE SET is_active = true, joined_at = CURRENT_TIMESTAMP
    `, [familyId, userId, username]);

    // Update family members count
    await pool.query(`
      UPDATE families 
      SET members_count = (
        SELECT COUNT(*) FROM family_members 
        WHERE family_id = $1 AND is_active = true
      ),
      updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [familyId]);

    console.log(`User ${username} joined family ${family.name}`);

    res.json({
      success: true,
      message: 'Berhasil bergabung dengan keluarga',
      family: {
        id: family.id.toString(),
        name: family.name
      }
    });

  } catch (error) {
    console.error('Error joining family:', error);
    res.status(500).json({ error: 'Gagal bergabung dengan keluarga' });
  }
});

// Get user's family
app.get('/api/users/:userId/family', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
      SELECT f.*, fm.family_role, fm.joined_at
      FROM families f
      JOIN family_members fm ON f.id = fm.family_id
      WHERE fm.user_id = $1 AND fm.is_active = true
      ORDER BY fm.joined_at DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.json(null);
    }

    const family = result.rows[0];

    res.json({
      id: family.id.toString(),
      name: family.name,
      description: family.description,
      logo: family.cover_image,
      members: family.members_count || 1,
      maxMembers: family.max_members || 50,
      level: family.level || 1,
      familyRole: family.family_role, // Separate from global user role
      joinedAt: family.joined_at,
      type: 'FAMILY'
    });

  } catch (error) {
    console.error('Error fetching user family:', error);
    res.status(500).json({ error: 'Gagal mengambil data keluarga pengguna' });
  }
});

// Get specific family details
app.get('/api/families/:familyId', async (req, res) => {
  try {
    const { familyId } = req.params;

    const result = await pool.query(`
      SELECT 
        f.*,
        COUNT(fm.id) as actual_members_count
      FROM families f
      LEFT JOIN family_members fm ON f.id = fm.family_id AND fm.is_active = true
      WHERE f.id = $1
      GROUP BY f.id
    `, [familyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Family not found' });
    }

    const family = result.rows[0];

    res.json({
      id: family.id.toString(),
      name: family.name,
      description: family.description,
      coverImage: family.cover_image,
      createdBy: family.created_by_username,
      membersCount: family.actual_members_count || 1,
      maxMembers: family.max_members || 50,
      level: family.level || 1,
      createdAt: family.created_at
    });

  } catch (error) {
    console.error('Error fetching family details:', error);
    res.status(500).json({ error: 'Failed to fetch family details' });
  }
});

// Get user's family badge info (for ProfileScreen)
app.get('/api/users/:userId/family-badge', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(`
      SELECT f.name as family_name, f.level as family_level, fm.family_role, fm.joined_at
      FROM families f
      JOIN family_members fm ON f.id = fm.family_id
      WHERE fm.user_id = $1 AND fm.is_active = true
      ORDER BY fm.joined_at DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length === 0) {
      return res.json(null);
    }

    const familyBadge = result.rows[0];

    res.json({
      familyName: familyBadge.family_name,
      familyLevel: familyBadge.family_level || 1,
      familyRole: familyBadge.family_role,
      joinedAt: familyBadge.joined_at
    });

  } catch (error) {
    console.error('Error fetching user family badge:', error);
    res.status(500).json({ error: 'Failed to fetch family badge' });
  }
});

// Serve family cover images
app.get('/api/families/cover/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;

    const result = await pool.query(
      'SELECT asset_data FROM family_assets WHERE filename LIKE $1 AND asset_type = $2',
      [`%${imageId}%`, 'cover']
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cover image not found' });
    }

    const imageData = result.rows[0].asset_data;
    const buffer = Buffer.from(imageData, 'base64');

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.send(buffer);

  } catch (error) {
    console.error('Error serving family cover:', error);
    res.status(500).json({ error: 'Error serving cover image' });
  }
});

// Get family members with their family roles
app.get('/api/families/:familyId/members', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;

    // Check if user is a member of this family
    const memberCheck = await pool.query(`
      SELECT family_role FROM family_members 
      WHERE family_id = $1 AND user_id = $2 AND is_active = true
    `, [familyId, req.user.id]);

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this family.' });
    }

    const userFamilyRole = memberCheck.rows[0].family_role;

    // Get all family members
    const result = await pool.query(`
      SELECT 
        fm.user_id,
        fm.username,
        fm.family_role,
        fm.joined_at,
        u.avatar,
        u.level,
        u.verified
      FROM family_members fm
      JOIN users u ON fm.user_id = u.id
      WHERE fm.family_id = $1 AND fm.is_active = true
      ORDER BY 
        CASE fm.family_role 
          WHEN 'admin' THEN 1 
          WHEN 'moderator' THEN 2 
          ELSE 3 
        END,
        fm.joined_at ASC
    `, [familyId]);

    const members = result.rows.map(row => ({
      userId: row.user_id.toString(),
      username: row.username,
      familyRole: row.family_role,
      joinedAt: row.joined_at,
      avatar: row.avatar,
      level: row.level || 1,
      verified: row.verified || false
    }));

    res.json({
      members,
      userFamilyRole, // Current user's role in this family
      canManageRoles: userFamilyRole === 'admin' // Only family admins can manage roles
    });

  } catch (error) {
    console.error('Error fetching family members:', error);
    res.status(500).json({ error: 'Failed to fetch family members' });
  }
});

// Update family member role (only family admins can do this)
app.put('/api/families/:familyId/members/:userId/role', authenticateToken, async (req, res) => {
  try {
    const { familyId, userId } = req.params;
    const { familyRole } = req.body;

    if (!['member', 'moderator', 'admin'].includes(familyRole)) {
      return res.status(400).json({ error: 'Invalid family role' });
    }

    // Check if requester is family admin
    const adminCheck = await pool.query(`
      SELECT family_role FROM family_members 
      WHERE family_id = $1 AND user_id = $2 AND family_role = 'admin' AND is_active = true
    `, [familyId, req.user.id]);

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Only family admins can change member roles' });
    }

    // Prevent demoting the family creator (first admin)
    const creatorCheck = await pool.query(`
      SELECT fm.user_id, f.created_by_id
      FROM family_members fm
      JOIN families f ON fm.family_id = f.id
      WHERE fm.family_id = $1 AND fm.user_id = $2 AND fm.family_role = 'admin'
      ORDER BY fm.joined_at ASC
      LIMIT 1
    `, [familyId, userId]);

    if (creatorCheck.rows.length > 0 && creatorCheck.rows[0].user_id.toString() === creatorCheck.rows[0].created_by_id.toString() && familyRole !== 'admin') {
      return res.status(400).json({ error: 'Cannot demote the family creator' });
    }

    // Update family role
    const result = await pool.query(`
      UPDATE family_members 
      SET family_role = $1 
      WHERE family_id = $2 AND user_id = $3 AND is_active = true
      RETURNING username
    `, [familyRole, familyId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Family member not found' });
    }

    console.log(`Family role updated: ${result.rows[0].username} is now ${familyRole} in family ${familyId}`);

    res.json({
      success: true,
      message: `${result.rows[0].username} is now a family ${familyRole}`,
      newFamilyRole: familyRole
    });

  } catch (error) {
    console.error('Error updating family member role:', error);
    res.status(500).json({ error: 'Failed to update family member role' });
  }
});

// Update family cover image (admins and moderators only)
app.put('/api/families/:familyId/cover', authenticateToken, async (req, res) => {
  try {
    const { familyId } = req.params;
    const { imagePath } = req.body;
    const userId = req.user.id;

    if (!imagePath) {
      return res.status(400).json({ error: 'Image path is required' });
    }

    // Check if user is admin or moderator in this family
    const roleCheck = await pool.query(`
      SELECT family_role FROM family_members 
      WHERE family_id = $1 AND user_id = $2 AND is_active = true
    `, [familyId, userId]);

    if (roleCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this family' });
    }

    const userRole = roleCheck.rows[0].family_role;
    if (!['admin', 'moderator'].includes(userRole)) {
      return res.status(403).json({ error: 'Only admins and moderators can update family cover' });
    }

    // Update family cover image
    const result = await pool.query(`
      UPDATE families 
      SET cover_image = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [imagePath, familyId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Family not found' });
    }

    const family = result.rows[0];

    console.log(`Family cover updated: Family ${familyId} cover set to ${imagePath} by user ${userId}`);

    res.json({
      success: true,
      message: 'Family cover updated successfully',
      coverImage: family.cover_image
    });

  } catch (error) {
    console.error('Error updating family cover:', error);
    res.status(500).json({ error: 'Failed to update family cover' });
  }
});

// Create family_assets table
pool.query(`
  CREATE TABLE IF NOT EXISTS family_assets (
    id SERIAL PRIMARY KEY,
    family_id INTEGER,
    asset_type VARCHAR(20) NOT NULL,
    asset_data TEXT NOT NULL,
    filename VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(err => console.error('Error creating family_assets table:', err));

// Get user's active headwear frame
app.get('/api/user/active-headwear', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT uh.id, uh.expires_at, hi.name, hi.image
      FROM user_headwear uh
      JOIN headwear_items hi ON uh.headwear_id = hi.id
      WHERE uh.user_id = $1 
        AND uh.is_active = true 
        AND uh.expires_at > NOW()
      ORDER BY uh.purchased_at DESC
      LIMIT 1
    `, [userId]);

    if (result.rows.length > 0) {
      const headwear = result.rows[0];
      res.json({
        hasActiveHeadwear: true,
        headwear: {
          id: headwear.id,
          name: headwear.name,
          image: headwear.image,
          expiresAt: headwear.expires_at
        }
      });
    } else {
      res.json({
        hasActiveHeadwear: false,
        headwear: null
      });
    }
  } catch (error) {
    console.error('Error fetching active headwear:', error);
    res.status(500).json({ error: 'Failed to fetch active headwear' });
  }
});

// Serve headwear images (placeholder endpoint)
app.get('/api/headwear/images/:imageName', (req, res) => {
  const { imageName } = req.params;

  // For now, return a placeholder response
  // In production, you would serve actual headwear frame images
  res.status(200).json({
    message: 'Headwear image placeholder',
    imageName: imageName,
    note: 'Replace this with actual image serving logic'
  });
});

// Auth routes
// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
  console.log('Registration request received:', req.body);

  try {
    const { username, password, email, phone, country, gender } = req.body;

    // Validation
    if (!username || !password || !email || !phone || !country || !gender) {
      console.log('Missing required fields');
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      console.log('User already exists:', username);
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user in database
    const result = await pool.query(
      `INSERT INTO users (username, email, password, phone, country, gender, bio, avatar, verified, exp, level, last_login, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id, username, email`,
      [username, email, hashedPassword, phone, country, gender, '', null, false, 0, 1, null, 'offline']
    );

    const newUser = result.rows[0];
    console.log('User created successfully in database:', newUser.username);

    // Generate verification token
    const verificationToken = jwt.sign({ userId: newUser.id, type: 'verification' }, JWT_SECRET, { expiresIn: '1h' });
    verificationTokens.push({ token: verificationToken, userId: newUser.id });

    // Send verification email (simulation)
    sendVerificationEmail(email, verificationToken);

    res.status(201).json({
      message: 'User created successfully. Please verify your email.',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    console.log('Login request received:', { username: req.body.username });

    const { username, password } = req.body;

    if (!username || !password) {
      console.log('Missing login credentials');
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await pool.query(
      'SELECT id, username, email, password, bio, phone, gender, birth_date, country, signature, avatar, level, verified, role FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      console.log('User not found:', username);
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('Invalid password for user:', username);
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    // Check for daily login reward
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const lastLogin = user.last_login ? new Date(user.last_login).toISOString().split('T')[0] : null;

    let dailyReward = null;
    if (lastLogin !== today) {
      try {
        // Check if user already got today's reward
        const todayReward = await pool.query(
          'SELECT * FROM daily_login_rewards WHERE user_id = $1 AND login_date = $2',
          [user.id, today]
        );

        if (todayReward.rows.length === 0) {
          // Calculate consecutive days
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          const yesterdayReward = await pool.query(
            'SELECT consecutive_days FROM daily_login_rewards WHERE user_id = $1 AND login_date = $2',
            [user.id, yesterdayStr]
          );

          const consecutiveDays = yesterdayReward.rows.length > 0 ? yesterdayReward.rows[0].consecutive_days + 1 : 1;
          const baseReward = 50;
          const bonusReward = Math.min(consecutiveDays * 10, 200); // Max bonus 200
          const totalReward = baseReward + bonusReward;

          // Add daily login reward
          await pool.query(`
            INSERT INTO daily_login_rewards (user_id, login_date, exp_reward, consecutive_days)
            VALUES ($1, $2, $3, $4)
          `, [user.id, today, totalReward, consecutiveDays]);

          // Add EXP to user
          const expResult = await addUserEXP(user.id, totalReward, 'daily_login');

          dailyReward = {
            exp: totalReward,
            consecutiveDays: consecutiveDays,
            leveledUp: expResult?.leveledUp || false,
            newLevel: expResult?.newLevel || user.level || 1
          };
        }

        // Update last login timestamp and set status to online
        await pool.query(
          'UPDATE users SET last_login = CURRENT_TIMESTAMP, status = $1 WHERE id = $2',
          ['online', user.id]
        );
      } catch (error) {
        console.error('Error processing daily login reward:', error);
      }
    } else {
      // If logged in again on the same day, just ensure status is online if last_login is recent
      if (user.last_login && new Date(user.last_login) > new Date(Date.now() - 5 * 60 * 1000)) {
        await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['online', user.id]);
      }
    }

    // Get updated user data with level and EXP
    const updatedUserResult = await pool.query(
      'SELECT id, username, email, bio, phone, avatar, verified, role, exp, level FROM users WHERE id = $1',
      [user.id]
    );
    const updatedUser = updatedUserResult.rows[0];

    // Mask sensitive data before sending response
    const maskedUser = maskSensitiveData({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      bio: updatedUser.bio,
      phone: updatedUser.phone,
      avatar: updatedUser.avatar,
      verified: updatedUser.verified,
      role: updatedUser.role,
      exp: updatedUser.exp || 0,
      level: updatedUser.level || 1
    });

    console.log('Refreshed user data:', maskedUser);

    console.log('Login successful for user:', username);

    res.json({
      token,
      user: maskedUser,
      dailyReward: dailyReward
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Logout endpoint
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    // In a real app, you would invalidate the token on the server-side
    // For example, by adding it to a blacklist or using a short expiration time
    console.log(`User ${req.user.username} logged out successfully`);
    // Optionally set status to offline
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['offline', req.user.id]);
    res.json({ message: 'Logged out successfully', success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error during logout' });
  }
});

// Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get user's current password
    const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Verify old password
    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password in database
    await pool.query(
      'UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [hashedNewPassword, userId]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if user has PIN
app.get('/api/auth/check-pin', authenticateToken, async (req, res) => {
  try {
    console.log('=== CHECK PIN REQUEST ===');
    console.log('User ID:', req.user.id);

    const userId = req.user.id;

    const result = await pool.query('SELECT pin FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      console.log('User not found for PIN check');
      return res.status(404).json({ error: 'User not found' });
    }

    const hasPin = result.rows[0].pin !== null && result.rows[0].pin !== '123456';
    console.log('User has custom PIN:', hasPin);
    res.json({ hasPin });
  } catch (error) {
    console.error('Check PIN error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change PIN
app.post('/api/auth/change-pin', authenticateToken, async (req, res) => {
  try {
    console.log('=== CHANGE PIN REQUEST ===');
    console.log('User ID:', req.user.id);
    console.log('Request body:', req.body);

    const { oldPin, newPin } = req.body;
    const userId = req.user.id;

    if (!newPin) {
      return res.status(400).json({ error: 'New PIN is required' });
    }

    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      return res.status(400).json({ error: 'PIN must be exactly 6 digits' });
    }

    // Get user's current PIN
    const userResult = await pool.query('SELECT pin FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      console.log('User not found for PIN change');
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const currentPin = user.pin || '123456'; // Default PIN
    console.log('Current PIN exists:', !!user.pin);

    // Verify old PIN
    if (oldPin !== currentPin) {
      console.log('PIN verification failed');
      return res.status(400).json({ error: 'Current PIN is incorrect' });
    }

    // Update PIN in database
    await pool.query(
      'UPDATE users SET pin = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [newPin, userId]
    );

    res.json({ message: 'PIN changed successfully' });
  } catch (error) {
    console.error('Change PIN error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Forgot password endpoint
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Check if user exists
    const userResult = await pool.query('SELECT id, username FROM users WHERE email = $1', [email]);

    if (userResult.rows.length === 0) {
      // Don't reveal if email exists or not for security
      return res.json({ message: 'If this email exists, a reset link has been sent.' });
    }

    const user = userResult.rows[0];

    // Generate reset token (in real app, use crypto.randomBytes)
    const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in database
    await pool.query(
      'INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET token = $2, expires_at = $3',
      [user.id, resetToken, expiresAt]
    );

    // In real app, send email with reset link
    console.log(`=== PASSWORD RESET EMAIL ===`);
    console.log(`To: ${maskEmail(email)}`);
    console.log(`Subject: Reset Your ChatMe Password`);
    console.log(`Reset Link: http://localhost:5000/api/auth/reset-password?token=${maskToken(resetToken)}`);
    console.log(`This link will expire in 1 hour.`);
    console.log(`===========================`);

    res.json({ message: 'If this email exists, a reset link has been sent.' });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin endpoints with /api prefix
app.get('/api/admin/emojis', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

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

app.post('/api/admin/emojis', authenticateToken, async (req, res) => {
  try {
    console.log('=== ADD EMOJI REQUEST ===');
    console.log('User:', req.user.username);
    console.log('Body keys:', Object.keys(req.body));
    console.log('Has emojiFile:', !!req.body.emojiFile);
    console.log('Has emoji:', !!req.body.emoji);

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, category = 'general', emoji, emojiFile, emojiType, fileName } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    if (!emojiFile && !emoji) {
      return res.status(400).json({ error: 'Either emoji file or emoji character is required' });
    }

    let emojiValue = emoji;

    // If file is uploaded, save it and use as emoji
    if (emojiFile) {
      try {
        // Validate base64 data
        if (typeof emojiFile !== 'string' || emojiFile.length < 100) {
          return res.status(400).json({ error: 'Invalid emoji file data' });
        }

        // Create uploads directory if not exists
        const uploadDir = 'uploads/emojis';
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Determine file extension
        const fileExt = emojiType || 'png';
        const uniqueFileName = `emoji_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${uploadDir}/${uniqueFileName}`;

        // Save base64 file
        const buffer = Buffer.from(emojiFile, 'base64');

        // Check buffer size (max 2MB)
        if (buffer.length > 2 * 1024 * 1024) {
          return res.status(400).json({ error: 'File too large. Maximum size is 2MB.' });
        }

        fs.writeFileSync(filePath, buffer);

        // Use file path as emoji value
        emojiValue = `/uploads/emojis/${uniqueFileName}`;

        console.log('Emoji file saved:', filePath, 'Size:', buffer.length, 'bytes');
      } catch (fileError) {
        console.error('Error saving emoji file:', fileError);
        return res.status(500).json({ error: 'Failed to save emoji file: ' + fileError.message });
      }
    }

    // Save to database
    const result = await pool.query(`
      INSERT INTO custom_emojis (name, emoji, category, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name.trim(), emojiValue, category, req.user.id]);

    console.log('Emoji added successfully:', result.rows[0]);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding emoji:', error);
    res.status(500).json({ error: 'Failed to add emoji: ' + error.message });
  }
});

app.delete('/api/admin/emojis/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    // Attempt to get emoji path to delete the file
    const emojiResult = await pool.query('SELECT emoji FROM custom_emojis WHERE id = $1', [id]);
    if (emojiResult.rows.length > 0 && emojiResult.rows[0].emoji.startsWith('/uploads/emojis/')) {
      const filePath = emojiResult.rows[0].emoji.substring(1); // Remove leading slash
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

// Banner Management Endpoints

// Create banners table if not exists
pool.query(`
  CREATE TABLE IF NOT EXISTS banners (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT NOT NULL,
    link_url TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(err => console.error('Error creating banners table:', err));

// Get active banners (public endpoint)
app.get('/api/banners', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, title, description, image_url, link_url, display_order
      FROM banners 
      WHERE is_active = true 
      ORDER BY display_order ASC, created_at DESC
    `);

    const banners = result.rows.map(row => ({
      id: row.id.toString(),
      title: row.title,
      description: row.description,
      imageUrl: row.image_url,
      linkUrl: row.link_url,
      displayOrder: row.display_order
    }));

    res.json(banners);
  } catch (error) {
    console.error('Error fetching banners:', error);
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

// Track banner clicks
app.post('/api/banners/:bannerId/click', async (req, res) => {
  try {
    const { bannerId } = req.params;

    await pool.query(
      'UPDATE banners SET click_count = click_count + 1 WHERE id = $1',
      [bannerId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking banner click:', error);
    res.status(500).json({ error: 'Failed to track click' });
  }
});

// Admin: Get all banners
app.get('/api/admin/banners', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(`
      SELECT * FROM banners 
      ORDER BY display_order ASC, created_at DESC
    `);

    const banners = result.rows.map(row => ({
      id: row.id.toString(),
      title: row.title,
      description: row.description,
      imageUrl: row.image_url,
      linkUrl: row.link_url,
      isActive: row.is_active,
      displayOrder: row.display_order,
      clickCount: row.click_count,
      createdAt: row.created_at
    }));

    res.json(banners);
  } catch (error) {
    console.error('Error fetching admin banners:', error);
    res.status(500).json({ error: 'Failed to fetch banners' });
  }
});

// Admin: Create banner
app.post('/api/admin/banners', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { title, description, linkUrl, displayOrder, bannerImage, imageType } = req.body;

    if (!title || !bannerImage) {
      return res.status(400).json({ error: 'Title and banner image are required' });
    }

    let imagePath = null;

    // Handle banner image upload
    if (bannerImage && imageType) {
      try {
        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(__dirname, 'uploads', 'banners');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Generate unique filename
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        const fileExtension = imageType.includes('/') ? imageType.split('/')[1] : 'jpg';
        const filename = `banner_${uniqueSuffix}.${fileExtension}`;
        const filepath = path.join(uploadsDir, filename);

        // Write base64 image to file
        const imageBuffer = Buffer.from(bannerImage, 'base64');
        fs.writeFileSync(filepath, imageBuffer);

        imagePath = `/uploads/banners/${filename}`;
        console.log('Banner image saved:', filename);
      } catch (error) {
        console.error('Error saving banner image:', error);
        return res.status(500).json({ error: 'Failed to save banner image' });
      }
    }

    const result = await pool.query(`
      INSERT INTO banners (title, description, image_url, link_url, display_order, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `, [title, description || '', imagePath, linkUrl || '', displayOrder || 0]);

    const banner = result.rows[0];

    res.json({
      id: banner.id.toString(),
      title: banner.title,
      description: banner.description,
      imageUrl: banner.image_url,
      linkUrl: banner.link_url,
      isActive: banner.is_active,
      displayOrder: banner.display_order,
      clickCount: banner.click_count,
      createdAt: banner.created_at
    });
  } catch (error) {
    console.error('Error creating banner:', error);
    res.status(500).json({ error: 'Failed to create banner' });
  }
});

// Admin: Update banner
app.put('/api/admin/banners/:bannerId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { bannerId } = req.params;
    const { title, description, linkUrl, displayOrder, isActive } = req.body;

    const result = await pool.query(`
      UPDATE banners 
      SET title = $1, description = $2, link_url = $3, display_order = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [title, description, linkUrl, displayOrder, isActive, bannerId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Banner not found' });
    }

    const banner = result.rows[0];
    res.json({
      id: banner.id.toString(),
      title: banner.title,
      description: banner.description,
      imageUrl: banner.image_url,
      linkUrl: banner.link_url,
      isActive: banner.is_active,
      displayOrder: banner.display_order,
      clickCount: banner.click_count,
      createdAt: banner.created_at
    });
  } catch (error) {
    console.error('Error updating banner:', error);
    res.status(500).json({ error: 'Failed to update banner' });
  }
});

// Admin: Delete banner
app.delete('/api/admin/banners/:bannerId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { bannerId } = req.params;

    // Get banner info to delete image file
    const bannerResult = await pool.query('SELECT image_url FROM banners WHERE id = $1', [bannerId]);
    if (bannerResult.rows.length > 0) {
      const imageUrl = bannerResult.rows[0].image_url;
      if (imageUrl && imageUrl.startsWith('/uploads/banners/')) {
        const filePath = path.join(__dirname, imageUrl);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }

    await pool.query('DELETE FROM banners WHERE id = $1', [bannerId]);
    res.json({ message: 'Banner deleted successfully' });
  } catch (error) {
    console.error('Error deleting banner:', error);
    res.status(500).json({ error: 'Failed to delete banner' });
  }
});

// Serve banner images
app.get('/uploads/banners/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(__dirname, 'uploads', 'banners', filename);

    if (fs.existsSync(filepath)) {
      res.sendFile(filepath);
    } else {
      res.status(404).json({ error: 'Banner image not found' });
    }
  } catch (error) {
    console.error('Error serving banner image:', error);
    res.status(500).json({ error: 'Failed to serve banner image' });
  }
});

// Serve gift images and videos
app.get('/uploads/gifts/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(__dirname, 'uploads', 'gifts', filename);

    if (fs.existsSync(filepath)) {
      // Set appropriate content type based on file extension
      const ext = path.extname(filename).toLowerCase();
      const contentTypes = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.gif': 'image/gif',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg'
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);

      // For video files, enable partial content support
      if (contentType.startsWith('video/')) {
        res.setHeader('Accept-Ranges', 'bytes');
      }

      res.sendFile(filepath);
    } else {
      res.status(404).json({ error: 'Gift file not found' });
    }
  } catch (error) {
    console.error('Error serving gift file:', error);
    res.status(500).json({ error: 'Failed to serve gift file' });
  }
});

// Admin endpoints for gift management
app.get('/api/admin/gifts', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('🔐 Admin endpoint accessed');
    console.log('Headers:', { authorization: req.headers.authorization ? 'Present' : 'Missing', 'content-type': req.headers['content-type'] });
    console.log('Body:', req.body);

    console.log('User authenticated:', req.user.username, 'Role:', req.user.role);

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

// Add new gift (admin only)
app.post('/api/admin/gifts', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

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
      isAnimated = false,
      duration = null
    } = req.body;

    if (!name || !icon || !price) {
      return res.status(400).json({ error: 'Name, icon, and price are required' });
    }

    if (!giftImage) {
      return res.status(400).json({ error: 'Gift image/video is required' });
    }

    let imagePath = null;
    let animationPath = null;

    // Handle gift image/video upload
    if (giftImage && imageType && imageName) {
      try {
        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(__dirname, 'uploads', 'gifts');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Generate unique filename
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        // Extract file extension from imageType (e.g., 'image/jpeg' -> 'jpeg', 'video/mp4' -> 'mp4')
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

        // Write base64 data to file
        const fileBuffer = Buffer.from(giftImage, 'base64');

        // Check file size limits
        const isVideo = ['mp4', 'webm', 'mov'].includes(fileExtension);
        const maxSize = isVideo ? 15 * 1024 * 1024 : 5 * 1024 * 1024; // 15MB for videos, 5MB for images

        if (fileBuffer.length > maxSize) {
          return res.status(400).json({ 
            error: `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB.` 
          });
        }

        fs.writeFileSync(filepath, fileBuffer);

        const filePath = `/uploads/gifts/${filename}`;

        // For video files or animated GIFs, store as animation
        if (isVideo || fileExtension === 'gif' || isAnimated) {
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
          isVideo: isVideo,
          isAnimated: isAnimated || fileExtension === 'gif'
        });

      } catch (error) {
        console.error('Error saving gift file:', error);
        return res.status(500).json({ error: 'Failed to save gift file: ' + error.message });
      }
    }

    // Determine the final type based on file and settings
    const finalType = (hasAnimation || isAnimated || animationPath) ? 'animated' : 'static';

    const result = await pool.query(`
      INSERT INTO custom_gifts (name, icon, image, animation, price, type, category, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [name, icon, imagePath, animationPath, parseInt(price), finalType, category, req.user.id]);

    const gift = result.rows[0];

    // Return full URLs for images and animations
    const responseGift = {
      ...gift,
      id: gift.id.toString(),
      image: gift.image ? `${API_BASE_URL}${gift.image}` : null,
      animation: gift.animation ? `${API_BASE_URL}${gift.animation}` : null
    };

    console.log('Gift created successfully:', responseGift.name);
    res.json(responseGift);

  } catch (error) {
    console.error('Error adding gift:', error);
    res.status(500).json({ error: 'Failed to add gift: ' + error.message });
  }
});

// Upload endpoint for admin gift management
app.post('/api/admin/upload-gift', uploadGift.single('gift'), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, icon, price, type = 'static' } = req.body;

    if (!name || !icon || !price) {
      return res.status(400).json({ error: 'Name, icon, and price are required' });
    }

    const animationPath = `/uploads/gifts/${req.file.filename}`;

    const result = await pool.query(`
      INSERT INTO custom_gifts (name, icon, animation, price, type, created_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name, icon, animationPath, parseInt(price), type, req.user.id]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding gift:', error);
    res.status(500).json({ error: 'Failed to add gift' });
  }
});

// Get all gifts for admin management
app.get('/api/admin/gifts', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query('SELECT * FROM custom_gifts ORDER BY created_at DESC');
    
    const gifts = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      price: row.price,
      type: row.type || 'static',
      category: row.category || 'popular',
      image: row.image,
      animation: row.animation,
      created_at: row.created_at
    }));

    res.json(gifts);
  } catch (error) {
    console.error('Error fetching gifts for admin:', error);
    res.status(500).json({ error: 'Failed to fetch gifts' });
  }
});

// Add new gift (admin only)
app.post('/api/admin/gifts', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, icon, price, type, category, image, animation } = req.body;

    if (!name || !icon || !price) {
      return res.status(400).json({ error: 'Name, icon, and price are required' });
    }

    const result = await pool.query(`
      INSERT INTO custom_gifts (name, icon, price, type, category, image, animation, created_by, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `, [name, icon, price, type || 'static', category || 'popular', image, animation, req.user.id]);

    res.json({ message: 'Gift added successfully', gift: result.rows[0] });
  } catch (error) {
    console.error('Error adding gift:', error);
    res.status(500).json({ error: 'Failed to add gift' });
  }
});

// Update gift (admin only)
app.put('/api/admin/gifts/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;
    const { name, icon, price, type, category, image, animation } = req.body;

    if (!name || !icon || price === undefined) {
      return res.status(400).json({ error: 'Name, icon, and price are required' });
    }

    const result = await pool.query(`
      UPDATE custom_gifts 
      SET name = $1, icon = $2, price = $3, type = $4, category = $5, image = $6, animation = $7
      WHERE id = $8
      RETURNING *
    `, [name, icon, price, type || 'static', category || 'popular', image, animation, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Gift not found' });
    }

    res.json({ message: 'Gift updated successfully', gift: result.rows[0] });
  } catch (error) {
    console.error('Error updating gift:', error);
    res.status(500).json({ error: 'Failed to update gift' });
  }
});

app.delete('/api/admin/gifts/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { id } = req.params;

    // Attempt to get file path to delete the file
    const giftResult = await pool.query('SELECT animation FROM custom_gifts WHERE id = $1', [id]);
    if (giftResult.rows.length > 0 && giftResult.rows[0].animation) {
      const filePath = giftResult.rows[0].animation.substring(1); // Remove leading slash
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

// Public endpoint to get emojis for chat emoji picker
app.get('/api/emojis', async (req, res) => {
  try {
    console.log('Loading emojis for emoji picker...');
    const result = await pool.query(`
      SELECT id, name, emoji, category, created_at 
      FROM custom_emojis 
      ORDER BY created_at DESC
    `);

    const emojis = result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      url: row.emoji.startsWith('/uploads/') ? `${req.protocol}://${req.get('host')}${row.emoji}` : row.emoji,
      type: row.emoji.startsWith('/uploads/') ? 'image' : 'text',
      category: row.category,
      emoji: row.emoji.startsWith('/uploads/') ? undefined : row.emoji
    }));

    console.log(`Returning ${emojis.length} emojis for emoji picker`);
    res.json(emojis);
  } catch (error) {
    console.error('Error fetching emojis for picker:', error);
    res.status(500).json({ error: 'Failed to fetch emojis' });
  }
});

// Public endpoint to get gifts for chat gift picker
app.get('/api/gifts', async (req, res) => {
  try {
    console.log('Loading gifts for gift picker...');

    // Get custom gifts from database
    const result = await pool.query('SELECT * FROM custom_gifts ORDER BY created_at DESC');

    const gifts = result.rows.map(row => {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      
      let imageUrl = null;
      if (row.image) {
        if (row.image.startsWith('http://') || row.image.startsWith('https://')) {
          imageUrl = row.image;
        } else if (row.image.startsWith('/')) {
          imageUrl = `${baseUrl}${row.image}`;
        } else {
          imageUrl = `${baseUrl}/${row.image}`;
        }
      }
      
      let animationUrl = null;
      if (row.animation) {
        if (row.animation.startsWith('http://') || row.animation.startsWith('https://')) {
          animationUrl = row.animation;
        } else if (row.animation.startsWith('/')) {
          animationUrl = `${baseUrl}${row.animation}`;
        } else {
          animationUrl = `${baseUrl}/${row.animation}`;
        }
      }
      
      return {
        id: row.id.toString(),
        name: row.name,
        icon: row.icon,
        price: row.price,
        type: row.type || 'static',
        category: row.category || 'popular',
        image: imageUrl,
        animation: animationUrl,
        mediaType: row.media_type || 'image',
        thumbnailUrl: row.thumbnail_url ? `${baseUrl}${row.thumbnail_url}` : null,
        duration: row.duration
      };
    });

    // If no custom gifts in database, return default gifts
    if (gifts.length === 0) {
      const defaultGifts = [
        { id: '1001', name: 'Lucky Rose', icon: '🌹', price: 150, type: 'static', category: 'popular' },
        { id: '1002', name: 'Ionceng', icon: '🔔', price: 300, type: 'static', category: 'popular' },
        { id: '1003', name: 'Lucky Pearls', icon: '🦪', price: 500, type: 'static', category: 'lucky' },
        { id: '1004', name: 'Kertas Perkamen', icon: '📜', price: 4500, type: 'static', category: 'bangsa' },
        { id: '1005', name: 'Kincir Angin', icon: '🌪️', price: 100000, type: 'animated', category: 'set kostum' },
        { id: '1006', name: 'Blind Box', icon: '📦', price: 1880000, type: 'animated', category: 'tas saya' },
        { id: '1007', name: 'Hiasan Berlapis', icon: '✨', price: 1000000, type: 'animated', category: 'bangsa' },
        { id: '1008', name: 'Doa Bintang', icon: '⭐', price: 10000000, type: 'animated', category: 'tas saya' },
      ];
      console.log(`Returning ${defaultGifts.length} default gifts for gift picker`);
      return res.json(defaultGifts);
    }

    console.log(`Returning ${gifts.length} gifts for gift picker`);
    res.json(gifts);
  } catch (error) {
    console.error('Error fetching gifts for picker:', error);
    res.status(500).json({ error: 'Failed to fetch gifts' });
  }
});

// Check gift balance endpoint
app.post('/api/gifts/check-balance', authenticateToken, async (req, res) => {
  try {
    const { giftPrice } = req.body;
    const userId = req.user.id;

    if (!giftPrice) {
      return res.status(400).json({ error: 'Gift price is required' });
    }

    // Get user balance
    const balanceResult = await pool.query('SELECT balance FROM user_credits WHERE user_id = $1', [userId]);
    const currentBalance = balanceResult.rows.length > 0 ? balanceResult.rows[0].balance : 0;

    const canAfford = currentBalance >= giftPrice;

    res.json({
      canAfford,
      currentBalance,
      giftPrice
    });

  } catch (error) {
    console.error('Error checking gift balance:', error);
    res.status(500).json({ error: 'Failed to check balance' });
  }
});

// Gift purchase endpoint
app.post('/api/gift/purchase', authenticateToken, async (req, res) => {
  try {
    const { giftId, giftPrice, recipientUsername, roomId, isPrivate } = req.body;
    const userId = req.user.id;
    const senderUsername = req.user.username;

    console.log('=== GIFT PURCHASE REQUEST ===');
    console.log('Gift ID:', giftId);
    console.log('Price:', giftPrice);
    console.log('Sender:', senderUsername);
    console.log('Recipient:', recipientUsername);
    console.log('Room ID:', roomId);
    console.log('Is Private:', isPrivate);

    if (!giftId || !recipientUsername || !roomId) {
      return res.status(400).json({ error: 'Gift ID, recipient, and room ID are required' });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Fetch authoritative gift price from database (security: don't trust client)
      const giftResult = await pool.query('SELECT price, name FROM custom_gifts WHERE id = $1', [giftId]);
      if (giftResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid gift ID' });
      }
      
      const giftPrice = giftResult.rows[0].price;
      const giftName = giftResult.rows[0].name;

      // Check sender balance
      const balanceResult = await pool.query('SELECT balance FROM user_credits WHERE user_id = $1', [userId]);
      const currentBalance = balanceResult.rows.length > 0 ? balanceResult.rows[0].balance : 0;

      if (currentBalance < giftPrice) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Get recipient user ID
      const recipientResult = await pool.query('SELECT id FROM users WHERE username = $1', [recipientUsername]);
      if (recipientResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'Recipient not found' });
      }

      const recipientId = recipientResult.rows[0].id;

      // Deduct from sender
      await pool.query(
        'UPDATE user_credits SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [giftPrice, userId]
      );

      // Calculate earnings for recipient based on chat type
      // Verify room type and membership from database (security: authoritative server-side verification)
      let isPrivateChat = false;
      
      // Check if it's a private chat in the database
      const privateCheck = await pool.query('SELECT id FROM private_chats WHERE id = $1', [roomId]);
      if (privateCheck.rows.length > 0) {
        isPrivateChat = true;
        
        // Validate private chat membership: roomId should match participants
        const expectedPrivateId1 = `private_${userId}_${recipientId}`;
        const expectedPrivateId2 = `private_${recipientId}_${userId}`;
        
        if (roomId !== expectedPrivateId1 && roomId !== expectedPrivateId2) {
          await pool.query('ROLLBACK');
          return res.status(403).json({ error: 'You are not authorized to send gifts in this private chat' });
        }
      } else {
        // Check if it's a public room in the database
        const roomCheck = await pool.query('SELECT id FROM rooms WHERE id = $1', [roomId]);
        if (roomCheck.rows.length === 0) {
          await pool.query('ROLLBACK');
          return res.status(400).json({ error: 'Invalid room ID' });
        }
        
        // For public rooms, verify sender membership (basic validation)
        // Note: More comprehensive membership checks could be added here if needed
      }
      
      // All gifts: 30% to recipient, 70% to system (both private and public)
      const recipientPercentage = 0.3;
      const earnings = Math.floor(giftPrice * recipientPercentage);
      
      console.log(`💰 Gift distribution: ${isPrivateChat ? 'Private' : 'Public'} chat (${roomId}), ${Math.round(recipientPercentage * 100)}% to recipient`);

      // Add earnings to recipient's gift earnings balance
      await pool.query(`
        INSERT INTO user_gift_earnings_balance (user_id, balance, total_earned)
        VALUES ($1, $2, $2)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          balance = user_gift_earnings_balance.balance + $2,
          total_earned = user_gift_earnings_balance.total_earned + $2,
          updated_at = CURRENT_TIMESTAMP
      `, [recipientId, earnings]);

      // Record gift transaction
      await pool.query(`
        INSERT INTO gift_earnings (user_id, gift_id, gift_name, gift_price, sender_username, user_share, system_share, room_id, is_private)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [recipientId, giftId, `Gift ${giftId}`, giftPrice, senderUsername, earnings, giftPrice - earnings, roomId, isPrivate || false]);

      // Record credit transaction
      await pool.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type)
        VALUES ($1, $2, $3, 'gift_purchase')
      `, [userId, recipientId, giftPrice]);

      await pool.query('COMMIT');

      console.log(`Gift purchased successfully: ${senderUsername} -> ${recipientUsername}, Price: ${giftPrice}, Earnings: ${earnings}`);

      res.json({
        success: true,
        message: 'Gift sent successfully',
        earnings: earnings,
        newBalance: currentBalance - giftPrice
      });

    } catch (transactionError) {
      await pool.query('ROLLBACK');
      throw transactionError;
    }

  } catch (error) {
    console.error('Error purchasing gift:', error);
    res.status(500).json({ error: 'Failed to send gift' });
  }
});

// Email verification endpoint
app.get('/api/verify-email', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send('<h1>Invalid verification link</h1>');
  }

  // Find token in our list
  const tokenEntry = verificationTokens.find(t => t.token === token);
  if (!tokenEntry) {
    return res.status(400).send('<h1>Invalid or expired verification link</h1>');
  }

  // Verify token validity (e.g., check expiry if you implemented it)
  // For simplicity, we assume the token is valid if found.

  // Update user verification status
  const updateUserResult = await pool.query(
    'UPDATE users SET verified = true WHERE id = $1 RETURNING id',
    [tokenEntry.userId]
  );

  if (updateUserResult.rows.length === 0) {
    return res.status(404).send('<h1>User not found</h1>');
  }

  // Remove the used token
  verificationTokens = verificationTokens.filter(t => t.token !== token);

  res.send(`
    <html>
      <head><title>Email Verified</title></head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1 style="color: #FF6B35;">Email Verified Successfully!</h1>
        <p>Your ChatMe account has been verified. You can now use all features.</p>
        <p>You can close this window and return to the app.</p>
      </body>
    </html>
  `);
});

// Profile routes
// Get user profile details
app.get('/api/users/:userId/profile', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log(`=== GET USER PROFILE REQUEST ===`);
    console.log(`User ID: ${userId}`);

    const result = await pool.query(
      `SELECT id, username, email, bio, phone, gender, birth_date, country, signature, avatar, avatar_frame, profile_background, level, role, verified, status, is_busy, busy_until FROM users 
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Convert snake_case to camelCase for consistency with frontend
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      bio: user.bio || '',
      phone: user.phone || '',
      gender: user.gender || '',
      birthDate: user.birth_date,
      country: user.country || '',
      signature: user.signature || '',
      avatar: user.avatar,
      avatarFrame: user.avatar_frame,
      profileBackground: user.profile_background,
      level: user.level || 1,
      role: user.role || 'user', // Always ensure role is included
      verified: user.verified || false,
      status: user.status || 'offline',
      isBusy: user.is_busy || false,
      busyUntil: user.busy_until
    };

    console.log(`Profile retrieved successfully for user: ${user.username}, role: ${user.role} (from DB)`);
    console.log(`Sending role to client: ${userData.role}`);
    res.json(userData);

  } catch (error) {
    console.error('Error getting user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
app.put('/api/users/:userId/profile', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      username,
      bio,
      phone,
      gender,
      birthDate,
      country,
      signature
    } = req.body;

    console.log(`=== UPDATE USER PROFILE REQUEST ===`);
    console.log(`User ID: ${userId}`);
    console.log(`Update data:`, maskSensitiveData({ username, bio, phone, gender, birthDate, country, signature }));

    // Build the SET clause dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (username !== undefined) {
      updates.push(`username = $${paramCount}`);
      values.push(username);
      paramCount++;
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramCount}`);
      values.push(bio);
      paramCount++;
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount}`);
      values.push(phone);
      paramCount++;
    }
    if (gender !== undefined) {
      updates.push(`gender = $${paramCount}`);
      values.push(gender);
      paramCount++;
    }
    if (birthDate !== undefined) {
      updates.push(`birth_date = $${paramCount}`);
      values.push(birthDate);
      paramCount++;
    }
    if (country !== undefined) {
      updates.push(`country = $${paramCount}`);
      values.push(country);
      paramCount++;
    }
    if (signature !== undefined) {
      updates.push(`signature = $${paramCount}`);
      values.push(signature);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Add the WHERE clause parameter
    values.push(userId);
    const whereParam = `$${paramCount}`;

    const query = `
      UPDATE users 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = ${whereParam}
      RETURNING id, username, email, bio, phone, avatar, gender, birth_date, country, signature, level, role
    `;

    console.log('Executing query:', query);
    console.log('With values:', values);

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result.rows[0];

    // Convert snake_case to camelCase for consistency with frontend
    const userData = {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      bio: updatedUser.bio || '',
      phone: updatedUser.phone || '',
      gender: updatedUser.gender || '',
      birthDate: updatedUser.birth_date,
      country: updatedUser.country || '',
      signature: updatedUser.signature || '',
      avatar: updatedUser.avatar,
      level: updatedUser.level || 1,
      role: updatedUser.role || 'user'
    };

    console.log(`Profile updated successfully:`, updatedUser.username, `role:`, updatedUser.role);
    res.json(userData);

  } catch (error) {
    console.error('Error updating user profile:', error);

    // Handle unique constraint violations
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username already exists' });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update profile background
app.put('/api/users/:userId/profile-background', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { backgroundUrl } = req.body;

    console.log(`=== UPDATE PROFILE BACKGROUND REQUEST ===`);
    console.log(`User ID from params: ${userId} (type: ${typeof userId})`);
    console.log(`User ID from token: ${req.user.id} (type: ${typeof req.user.id})`);
    console.log(`Background URL: ${backgroundUrl}`);

    // Verify user can only update their own profile - convert both to integers for comparison
    if (parseInt(userId, 10) !== parseInt(req.user.id, 10)) {
      console.log(`Authorization failed: ${parseInt(userId, 10)} !== ${parseInt(req.user.id, 10)}`);
      return res.status(403).json({ error: 'Unauthorized to update this profile' });
    }

    const query = `
      UPDATE users 
      SET profile_background = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, username, profile_background
    `;

    const result = await pool.query(query, [backgroundUrl, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updatedUser = result.rows[0];
    console.log(`Profile background updated successfully for user:`, updatedUser.username);
    
    res.json({
      success: true,
      profileBackground: updatedUser.profile_background
    });

  } catch (error) {
    console.error('Error updating profile background:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API health check - ensure this comes before catch-all
app.get('/api/health', (req, res) => {
  res.json({
    message: 'ChatMe API Server is running!',
    endpoints: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/test',
      'GET /api/rooms',
      'GET /api/messages/:roomId',
      'GET /api/feed/posts',
      'POST /api/feed/posts',
      'GET /api/friends',
      'GET /api/support/tickets',
      'GET /api/lowcard/status/:roomId',
      'POST /api/lowcard/command',
      'POST /api/lowcard/init/:roomId',
      'POST /api/lowcard/shutdown/:roomId',
      'GET /api/lowcard/games',
    ],
    timestamp: new Date().toISOString()
  });
});

// Ban Management Endpoints
// Get banned devices and IPs
app.get('/api/admin/banned-devices', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(`
      SELECT 
        id,
        user_id,
        ban_type,
        target_value,
        ban_reason,
        banned_by_id,
        banned_by_username,
        banned_at,
        unbanned_at,
        unbanned_by_id,
        unbanned_by_username,
        is_active
      FROM banned_devices_ips 
      WHERE is_active = true
      ORDER BY banned_at DESC
    `);

    const bannedList = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      type: row.ban_type,
      target: row.target_value,
      reason: row.ban_reason,
      bannedBy: row.banned_by_username,
      bannedAt: row.banned_at,
      isActive: row.is_active
    }));

    res.json({ bannedList });
  } catch (error) {
    console.error('Error fetching banned devices:', error);
    res.status(500).json({ error: 'Failed to fetch banned devices' });
  }
});

// Ban device
app.post('/api/admin/ban-device', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId, username, target, reason } = req.body;

    if (!target || !reason) {
      return res.status(400).json({ error: 'Target device and reason are required' });
    }

    // Check if device is already banned
    const existingBan = await pool.query(
      'SELECT id FROM banned_devices_ips WHERE target_value = $1 AND ban_type = $2 AND is_active = true',
      [target, 'device']
    );

    if (existingBan.rows.length > 0) {
      return res.status(400).json({ error: 'Device is already banned' });
    }

    // Insert ban record
    await pool.query(`
      INSERT INTO banned_devices_ips 
      (user_id, ban_type, target_value, ban_reason, banned_by_id, banned_by_username, banned_at, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), true)
    `, [userId, 'device', target, reason, req.user.id, req.user.username]);

    res.json({ message: 'Device banned successfully' });
  } catch (error) {
    console.error('Error banning device:', error);
    res.status(500).json({ error: 'Failed to ban device' });
  }
});

// Ban IP
app.post('/api/admin/ban-ip', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId, username, target, reason } = req.body;

    if (!target || !reason) {
      return res.status(400).json({ error: 'Target IP and reason are required' });
    }

    // Check if IP is already banned
    const existingBan = await pool.query(
      'SELECT id FROM banned_devices_ips WHERE target_value = $1 AND ban_type = $2 AND is_active = true',
      [target, 'ip']
    );

    if (existingBan.rows.length > 0) {
      return res.status(400).json({ error: 'IP is already banned' });
    }

    // Insert ban record
    await pool.query(`
      INSERT INTO banned_devices_ips 
      (user_id, ban_type, target_value, ban_reason, banned_by_id, banned_by_username, banned_at, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), true)
    `, [userId, 'ip', target, reason, req.user.id, req.user.username]);

    res.json({ message: 'IP banned successfully' });
  } catch (error) {
    console.error('Error banning IP:', error);
    res.status(500).json({ error: 'Failed to ban IP' });
  }
});

// Unban device or IP
app.post('/api/admin/unban', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { banId, banType } = req.body;

    if (!banId || !banType) {
      return res.status(400).json({ error: 'Ban ID and type are required' });
    }

    // Update ban record
    const result = await pool.query(`
      UPDATE banned_devices_ips 
      SET 
        is_active = false,
        unbanned_at = NOW(),
        unbanned_by_id = $1,
        unbanned_by_username = $2
      WHERE id = $3 AND is_active = true
      RETURNING *
    `, [req.user.id, req.user.username, banId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ban record not found or already inactive' });
    }

    res.json({ message: `${banType.toUpperCase()} unbanned successfully` });
  } catch (error) {
    console.error('Error unbanning:', error);
    res.status(500).json({ error: 'Failed to unban' });
  }
});

// Get admin users status with device info
app.get('/api/admin/users/status', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const result = await pool.query(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.phone,
        u.role,
        u.last_login,
        uc.balance as credits,
        'online' as status,
        'Unknown Device' as device,
        '127.0.0.1' as ip,
        'Unknown Location' as location
      FROM users u
      LEFT JOIN user_credits uc ON u.id = uc.user_id
      WHERE u.role IN ('admin', 'mentor', 'user')
      ORDER BY u.last_login DESC NULLS LAST
      LIMIT 20
    `);

    const users = result.rows.map(row => ({
      id: row.id.toString(),
      username: row.username,
      email: row.email,
      phone: row.phone,
      role: row.role,
      lastLogin: row.last_login,
      credits: row.credits || 0,
      status: row.status,
      device: row.device,
      ip: row.ip,
      location: row.location
    }));

    res.json({ users });
  } catch (error) {
    console.error('Error fetching user status:', error);
    res.status(500).json({ error: 'Failed to fetch user status' });
  }
});

// Admin Room Management Endpoints

// Get all rooms (admin only)
app.get('/api/admin/rooms', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

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
app.put('/api/admin/rooms/:roomId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { roomId } = req.params;
    const { name, description, maxMembers, managedBy } = req.body;

    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }

    if (!maxMembers || typeof maxMembers !== 'number' || maxMembers < 1 || maxMembers > 9999) {
      return res.status(400).json({ error: 'Invalid max members. Must be between 1 and 9999' });
    }

    // Check if room exists
    const roomCheck = await pool.query('SELECT id FROM rooms WHERE id = $1', [roomId]);
    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if new name conflicts with existing room (excluding current room)
    const nameCheck = await pool.query(
      'SELECT id FROM rooms WHERE LOWER(name) = LOWER($1) AND id != $2',
      [name.trim(), roomId]
    );

    if (nameCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Room name already exists' });
    }

    // Update room in database
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

    // Update in-memory rooms array
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex !== -1) {
      rooms[roomIndex] = {
        id: updatedRoom.id.toString(),
        name: updatedRoom.name,
        description: updatedRoom.description,
        managedBy: updatedRoom.managed_by,
        type: updatedRoom.type,
        members: updatedRoom.members || 0,
        maxMembers: updatedRoom.max_members,
        createdBy: updatedRoom.created_by,
        createdAt: updatedRoom.created_at
      };
    }

    console.log(`Room ${roomId} updated by admin ${req.user.username}`);
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
app.delete('/api/admin/rooms/:roomId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { roomId } = req.params;

    // Check if room exists
    const roomCheck = await pool.query('SELECT name FROM rooms WHERE id = $1', [roomId]);
    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const roomName = roomCheck.rows[0].name;

    // Delete related data first (foreign key constraints)
    await pool.query('DELETE FROM chat_messages WHERE room_id = $1', [roomId]);
    await pool.query('DELETE FROM room_banned_users WHERE room_id = $1', [roomId]);
    await pool.query('DELETE FROM room_security WHERE room_id = $1', [roomId]);
    await pool.query('DELETE FROM room_moderators WHERE room_id = $1', [roomId]);

    // Delete room from database
    await pool.query('DELETE FROM rooms WHERE id = $1', [roomId]);

    // Remove from in-memory rooms array
    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex !== -1) {
      rooms.splice(roomIndex, 1);
    }

    // Participants cleanup handled by socket gateway

    console.log(`Room ${roomName} (ID: ${roomId}) deleted by admin ${req.user.username}`);
    res.json({ 
      message: 'Room deleted successfully',
      roomName: roomName
    });

  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
});

// Rankings endpoint for TopRankScreen
app.get('/api/rankings/:type', async (req, res) => {
  try {
    const { type } = req.params;
    console.log(`Fetching ${type} rankings...`);

    let query, orderBy;

    switch (type) {
      case 'games':
        // Ranking based on level and exp
        query = `
          SELECT u.id, u.username, u.avatar, u.level, u.verified, u.exp as score
          FROM users u 
          WHERE u.level > 1 OR u.exp > 0
        `;
        orderBy = 'ORDER BY u.level DESC, u.exp DESC LIMIT 100';
        break;

      case 'wealth':
        // Ranking based on credits balance
        query = `
          SELECT u.id, u.username, u.avatar, u.level, u.verified, uc.balance as credits
          FROM users u 
          LEFT JOIN user_credits uc ON u.id = uc.user_id
          WHERE uc.balance > 0
        `;
        orderBy = 'ORDER BY uc.balance DESC LIMIT 100';
        break;

      case 'gifts':
        // Ranking based on total gifts received
        query = `
          SELECT u.id, u.username, u.avatar, u.level, u.verified, 
                 COALESCE(SUM(ge.gift_price), 0) as total_gifts
          FROM users u 
          LEFT JOIN gift_earnings ge ON u.id = ge.user_id
          GROUP BY u.id, u.username, u.avatar, u.level, u.verified
          HAVING COALESCE(SUM(ge.gift_price), 0) > 0
        `;
        orderBy = 'ORDER BY total_gifts DESC LIMIT 100';
        break;

      default:
        return res.status(400).json({ error: 'Invalid ranking type' });
    }

    const result = await pool.query(`${query} ${orderBy}`);

    const rankings = result.rows.map((user, index) => ({
      rank: index + 1,
      id: user.id.toString(),
      username: user.username,
      avatar: user.avatar,
      level: user.level || 1,
      verified: user.verified || false,
      score: user.score || 0,
      credits: user.credits || 0,
      totalGifts: user.total_gifts || 0
    }));

    console.log(`Returning ${rankings.length} ${type} rankings`);
    res.json(rankings);

  } catch (error) {
    console.error(`Error fetching ${req.params.type} rankings:`, error);
    res.status(500).json({ error: 'Failed to fetch rankings' });
  }
});

// Debug endpoint to check headwear status
app.get('/api/debug/headwear', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, image, price, duration_days, is_active, created_at
      FROM headwear_items
      ORDER BY id ASC
    `);

    res.json({
      message: 'Headwear items in database',
      totalItems: result.rows.length,
      items: result.rows
    });
  } catch (error) {
    console.error('Error fetching headwear debug info:', error);
    res.status(500).json({ error: 'Failed to fetch headwear debug info' });
  }
});

// Debug endpoint to check available routes
app.get('/debug/routes', (req, res) => {
  const routes = [];

  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Simple route
      const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
      routes.push(`${methods} ${middleware.route.path}`);
    } else if (middleware.name === 'router') {
      // Router middleware
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const methods = Object.keys(handler.route.methods).join(', ').toUpperCase();
          routes.push(`${methods} ${handler.route.path}`);
        }
      });
    }
  });

  res.json({
    message: 'Available routes',
    routes: routes.sort(),
    timestamp: new Date().toISOString()
  });
});



// Test endpoint
app.get('/api/test', (req, res) => {
  console.log('Test endpoint hit');
  res.json({
    message: 'Server is working!',
    timestamp: new Date().toISOString(),
    server: 'ChatMe API Server'
  });
});

// Gateway configuration endpoint
app.get('/api/gateway-config', (req, res) => {
  res.json({
    socketGatewayUrl: SOCKET_GATEWAY_URL,
    gatewayPort: process.env.GATEWAY_PORT || 5001,
    message: 'Use this URL for Socket.IO connections'
  });
});

// Create room endpoint
app.post('/api/rooms', async (req, res) => {
  console.log('POST /api/rooms -', new Date().toISOString());
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);

  const { name, description, type, maxMembers, createdBy } = req.body;
  const creatorUsername = createdBy || 'admin';

  // Validate required fields
  if (!name || !description) {
    return res.status(400).json({
      error: 'Room name and description are required'
    });
  }

  // Validate capacity
  const validCapacities = [25, 40, 80];
  if (!validCapacities.includes(maxMembers)) {
    return res.status(400).json({
      error: 'Invalid capacity. Must be 25, 40, or 80'
    });
  }

  try {
    // Check if room name already exists (case-insensitive)
    const existingRoom = await pool.query(
      'SELECT id, name FROM rooms WHERE LOWER(name) = LOWER($1)',
      [name.trim()]
    );

    if (existingRoom.rows.length > 0) {
      return res.status(400).json({
        error: `Room name "${name.trim()}" already exists. Please choose a different name.`
      });
    }

    // Save room to database
    const result = await pool.query(`
      INSERT INTO rooms (name, description, managed_by, type, members, max_members, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name.trim(), description.trim(), creatorUsername, type || 'room', 1, maxMembers, creatorUsername]);

    const dbRoom = result.rows[0];

    const newRoom = {
      id: dbRoom.id.toString(),
      name: dbRoom.name,
      description: dbRoom.description,
      managedBy: dbRoom.managed_by,
      type: dbRoom.type,
      members: dbRoom.members,
      maxMembers: dbRoom.max_members,
      createdBy: dbRoom.created_by,
      createdAt: dbRoom.created_at
    };

    // Add to in-memory rooms array
    rooms.push(newRoom);
    console.log('Room created and saved to database:', newRoom);
    res.json(newRoom);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

app.post('/api/rooms/:roomId/join', (req, res) => {
  try {
    const { roomId } = req.params;
    const { password } = req.body;

    console.log(`Join room request for ID: ${roomId}`);
    console.log('Available rooms:', rooms.map(r => ({ id: r.id, name: r.name })));

    const room = rooms.find(r => r.id === roomId);
    if (!room) {
      console.log(`Room ${roomId} not found. Available rooms:`, rooms.map(r => r.id));
      return res.status(404).json({ error: `Room with ID ${roomId} not found` });
    }

    // Check if room is locked and requires password
    if (room.type === 'locked' && global.roomLocks && global.roomLocks[roomId]) {
      if (!password || password !== global.roomLocks[roomId]) {
        return res.status(403).json({
          error: 'Room is password protected',
          requiresPassword: true,
          message: 'This room is locked. Please enter the correct password to join.'
        });
      }
    }

    // Check if room is at capacity
    if (room.members >= room.maxMembers) {
      return res.status(400).json({ error: 'Room is at maximum capacity' });
    }

    console.log(`User attempting to join room: ${room.name} (ID: ${room.id})`);

    res.json({
      message: 'Successfully joined room',
      room: room
    });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get messages for a specific room
app.get('/api/messages/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    console.log(`Fetching messages for room: ${roomId} - returning empty array (real-time only)`);

    // Return empty array - messages are real-time only, not persistent
    res.json([]);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/rooms/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;

    const roomIndex = rooms.findIndex(r => r.id === roomId);
    if (roomIndex === -1) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const deletedRoom = rooms.splice(roomIndex, 1)[0];
    console.log('Room deleted:', deletedRoom.name);

    // Participants cleanup handled by socket gateway

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Participants endpoints moved to /api/rooms router (server/routes/rooms.js)

// Friends API endpoints
// Add friend endpoint
app.post('/api/friends/add', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { friendId } = req.body;

    console.log(`=== ADD FRIEND REQUEST ===`);
    console.log(`User ${userId} wants to add friend ${friendId}`);

    if (!friendId) {
      return res.status(400).json({ error: 'Friend ID is required' });
    }

    if (userId === friendId) {
      return res.status(400).json({ error: 'Cannot add yourself as friend' });
    }

    // Check if friendship already exists
    const existingFriendship = await pool.query(
      'SELECT * FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
      [userId, friendId]
    );

    if (existingFriendship.rows.length > 0) {
      return res.status(400).json({ error: 'Friendship already exists or pending' });
    }

    // Check if target user exists
    const targetUser = await pool.query('SELECT * FROM users WHERE id = $1', [friendId]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create friendship (assuming auto-accept for now, you can modify for friend requests)
    await pool.query(
      'INSERT INTO friendships (user_id, friend_id, status, created_at) VALUES ($1, $2, $3, NOW())',
      [userId, friendId, 'accepted']
    );

    // Also create the reverse relationship
    await pool.query(
      'INSERT INTO friendships (user_id, friend_id, status, created_at) VALUES ($1, $2, $3, NOW())',
      [friendId, userId, 'accepted']
    );

    console.log(`Friendship created between user ${userId} and ${friendId}`);
    res.json({ success: true, message: 'Friend added successfully' });

  } catch (error) {
    console.error('Error adding friend:', error);
    res.status(500).json({ error: 'Failed to add friend' });
  }
});

app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('User ID:', userId);

    // Fetch friends from friendships table
    const friendsQuery = await pool.query(`
      SELECT u.id, u.username as name, u.avatar, 
             CASE WHEN u.last_login > NOW() - INTERVAL '5 minutes' THEN 'online' ELSE 'offline' END as status,
             CASE 
               WHEN u.last_login > NOW() - INTERVAL '5 minutes' THEN 'Active now'
               WHEN u.last_login IS NULL THEN 'Recently'
               ELSE
                 CASE 
                   WHEN FLOOR(EXTRACT(EPOCH FROM (NOW() - u.last_login))/60) < 1 THEN 'Active now'
                   WHEN FLOOR(EXTRACT(EPOCH FROM (NOW() - u.last_login))/60) < 60 THEN 
                     FLOOR(EXTRACT(EPOCH FROM (NOW() - u.last_login))/60)::text || ' min ago'
                   WHEN FLOOR(EXTRACT(EPOCH FROM (NOW() - u.last_login))/3600) < 24 THEN 
                     FLOOR(EXTRACT(EPOCH FROM (NOW() - u.last_login))/3600)::text || ' hours ago'
                   ELSE 
                     FLOOR(EXTRACT(EPOCH FROM (NOW() - u.last_login))/86400)::text || ' days ago'
                 END
             END as lastSeen
      FROM users u
      JOIN friendships f ON (f.friend_id = u.id)
      WHERE f.user_id = $1 AND f.status = 'accepted'
      ORDER BY u.last_login DESC NULLS LAST
    `, [userId]);

    const friendsData = friendsQuery.rows.map(friend => ({
      id: friend.id.toString(),
      name: friend.name,
      avatar: friend.avatar || friend.name.charAt(0).toUpperCase(),
      status: friend.status,
      lastSeen: friend.lastseen
    }));

    console.log(`Returning ${friendsData.length} friends for user ${userId}`);
    res.json(friendsData);
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search friends
app.get('/api/friends/search', (req, res) => {
  try {
    const { query } = req.query;
    console.log('=== SEARCH FRIENDS REQUEST ===');
    console.log('Query:', query);

    // Mock search results
    const searchResults = [
      {
        id: '3',
        name: 'Search User',
        username: 'searchuser',
        status: 'offline',
        lastSeen: '1 day ago',
        avatar: 'S',
        level: 2
      }
    ];

    res.json(searchResults);
  } catch (error) {
    console.error('Error searching friends:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search users
app.get('/api/users/search', async (req, res) => {
  try {
    const { query } = req.query;
    console.log('=== SEARCH USERS REQUEST ===');
    console.log('Query:', query);

    if (!query) {
      return res.json([]);
    }

    // Search users in database
    const result = await pool.query(`
      SELECT id, username, avatar, verified, role, exp, level
      FROM users
      WHERE username ILIKE $1
      LIMIT 10
    `, [`%${query}%`]);

    const searchResults = result.rows.map(user => {
      const maskedUser = maskSensitiveData(user);
      return {
        id: maskedUser.id.toString(),
        name: maskedUser.username,
        username: maskedUser.username,
        status: 'online', // Mock status
        lastSeen: 'Active now', // Mock last seen
        avatar: maskedUser.avatar || maskedUser.username?.charAt(0).toUpperCase(),
        level: maskedUser.level || 1,
        verified: maskedUser.verified,
        role: maskedUser.role
      };
    });

    res.json(searchResults);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user status
app.put('/api/user/status', (req, res) => {
  try {
    const { status } = req.body;
    console.log('=== UPDATE STATUS REQUEST ===');
    console.log('New status:', status);

    res.json({ success: true, status });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Room endpoints moved to /routes/rooms.js

// Get chat history for user
app.get('/api/chat/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('Fetching chat history for user:', userId);

    // First get the username for this user
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const username = userResult.rows[0].username;

    // Get recent private chats for the user
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

    // Get recent room conversations (rooms the user has been in)
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

    // Combine results
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

    console.log(`Returning ${chatHistory.length} chat history items for user ${userId}`);
    res.json(chatHistory);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Feed endpoints moved to /routes/feed.js

// Post creation endpoints moved to /routes/feed.js

// Like/Unlike post
app.post('/api/feed/posts/:postId/like', async (req, res) => {
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
app.post('/api/feed/posts/:postId/comment', async (req, res) => {
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
app.post('/api/feed/posts/:postId/share', (req, res) => {
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

// Get comments for a post
app.get('/api/feed/posts/:postId/comments', (req, res) => {
  try {
    const { postId } = req.params;

    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(post.comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



// Follow/Unfollow user
app.post('/api/users/:userId/follow', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { action } = req.body;
    const currentUserId = req.user.id;

    console.log('=== FOLLOW/UNFOLLOW REQUEST ===');
    console.log('Current User ID:', currentUserId);
    console.log('Target User ID:', userId);
    console.log('Action:', action);

    // Validate input
    if (!action || !['follow', 'unfollow'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "follow" or "unfollow".' });
    }

    // Check if target user exists
    const userResult = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];

    // Cannot follow yourself
    if (currentUserId.toString() === userId.toString()) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    // Start transaction to ensure data consistency
    await pool.query('BEGIN');

    try {
      if (action === 'follow') {
        // Add follow relationship
        const insertResult = await pool.query(`
          INSERT INTO user_follows (follower_id, following_id, created_at) 
          VALUES ($1, $2, NOW()) 
          ON CONFLICT (follower_id, following_id) DO NOTHING
          RETURNING *
        `, [currentUserId, userId]);

        // Award XP for following someone (only if it's a new follow)
        if (insertResult.rows.length > 0) {
          const expResult = await addUserEXP(currentUserId, 10, 'follow_user');
          console.log('XP awarded for following user:', expResult);
        }

        console.log(`Added follow relationship: ${currentUserId} -> ${userId}`);
      } else if (action === 'unfollow') {
        // Remove follow relationship
        const deleteResult = await pool.query(`
          DELETE FROM user_follows 
          WHERE follower_id = $1 AND following_id = $2
        `, [currentUserId, userId]);
        console.log(`Removed follow relationship: ${currentUserId} -> ${userId}, rows affected: ${deleteResult.rowCount}`);
      }

      // Get updated follower count for target user
      const followersResult = await pool.query(
        'SELECT COUNT(*) FROM user_follows WHERE following_id = $1',
        [userId]
      );

      // Get updated following count for current user
      const followingResult = await pool.query(
        'SELECT COUNT(*) FROM user_follows WHERE follower_id = $1',
        [currentUserId]
      );

      await pool.query('COMMIT');

      const result = {
        success: true,
        action: action,
        message: action === 'follow' ? 'User followed successfully' : 'User unfollowed successfully',
        targetUser: targetUser.username,
        followers: parseInt(followersResult.rows[0].count),
        following: parseInt(followingResult.rows[0].count)
      };

      console.log(`User ${targetUser.username} ${action}ed successfully`);
      console.log('Updated counts:', result);
      res.json(result);

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error updating follow status:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get user's followers
app.get('/api/users/:userId/followers', (req, res) => {
  try {
    const { userId } = req.params;
    console.log('=== GET USER FOLLOWERS REQUEST ===');
    console.log('User ID:', userId);

    // Mock followers data
    const followers = [
      {
        id: 'follower1',
        username: 'follower1',
        avatar: null,
        isFollowing: false
      },
      {
        id: 'follower2',
        username: 'follower2',
        avatar: null,
        isFollowing: true
      }
    ];

    res.json(followers);
  } catch (error) {
    console.error('Error fetching followers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's following
app.get('/api/users/:userId/following', (req, res) => {
  try {
    const { userId } = req.params;
    console.log('=== GET USER FOLLOWING REQUEST ===');
    console.log('User ID:', userId);

    // Mock following data
    const following = [
      {
        id: 'following1',
        username: 'following1',
        avatar: null,
        isFollowing: true
      },
      {
        id: 'following2',
        username: 'following2',
        avatar: null,
        isFollowing: true
      }
    ];

    res.json(following);
  } catch (error) {
    console.error('Error fetching following:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check follow status
app.get('/api/users/:userId/follow-status', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    console.log('=== CHECK FOLLOW STATUS REQUEST ===');
    console.log('Current User ID:', currentUserId);
    console.log('Target User ID:', userId);

    // Check if current user is following the target user
    const result = await pool.query(
      'SELECT COUNT(*) FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [currentUserId, userId]
    );

    const isFollowing = parseInt(result.rows[0].count) > 0;

    console.log('Follow status:', isFollowing);
    res.json({ isFollowing });
  } catch (error) {
    console.error('Error checking follow status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user profile for profile screen (different from /api/users/:userId/profile)
app.get('/api/users/:userId/profile', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('=== GET USER PROFILE REQUEST ===');
    console.log('User ID/Username:', userId);

    // Check if userId is numeric (ID) or string (username)
    const isNumeric = /^\d+$/.test(userId);
    let actualUserId = userId;

    if (!isNumeric) {
      // Convert username to user ID
      const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [userId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      actualUserId = userResult.rows[0].id;
    }

    // Get user data
    const userResult = await pool.query(
      'SELECT id, username, email, bio, phone, avatar, gender, birth_date, country, signature, verified, role, exp, level FROM users WHERE id = $1',
      [actualUserId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get real followers/following count
    const followersResult = await pool.query(
      'SELECT COUNT(*) FROM user_follows WHERE following_id = $1',
      [actualUserId]
    );
    const followingResult = await pool.query(
      'SELECT COUNT(*) FROM user_follows WHERE follower_id = $1',
      [actualUserId]
    );

    // Get achievements from database
    const achievementsResult = await pool.query(`
      SELECT achievement_type, count
      FROM user_achievements
      WHERE user_id = $1
    `, [actualUserId]);

    const achievements = [
      {
        id: 'wealth',
        name: 'Kekayaan',
        icon: '⚡',
        color: '#FFA500',
        count: achievementsResult.rows.find(a => a.achievement_type === 'wealth')?.count || 0
      },
      {
        id: 'persona',
        name: 'pesona',
        icon: '💖',
        color: '#FF69B4',
        count: achievementsResult.rows.find(a => a.achievement_type === 'persona')?.count || 0
      },
      {
        id: 'gaming',
        name: 'Permainan',
        icon: '🎮',
        color: '#00BFFF',
        count: achievementsResult.rows.find(a => a.achievement_type === 'gaming')?.count || 0
      },
      {
        id: 'kasmaran',
        name: 'KASMARAN',
        icon: '💝',
        color: '#32CD32',
        count: achievementsResult.rows.find(a => a.achievement_type === 'kasmaran')?.count || 0
      }
    ];

    // Construct avatar URL
    let avatarUrl = null;
    if (user.avatar) {
      if (user.avatar.startsWith('/api/users/avatar/')) {
        avatarUrl = `${req.protocol}://${req.get('host')}${user.avatar}`;
      } else if (user.avatar.startsWith('http')) {
        avatarUrl = user.avatar;
      } else {
        // Assume it's a local file path or an ID, construct URL
        avatarUrl = `${req.protocol}://${req.get('host')}/api/users/avatar/${user.avatar}`;
      }
    } else {
      // Default avatar if none exists
      avatarUrl = user.username?.charAt(0).toUpperCase();
    }

    const profile = {
      id: user.id.toString(),
      username: user.username,
      bio: user.bio || user.signature || 'tanda tangan: cukup tau aj',
      followers: parseInt(followersResult.rows[0].count),
      following: parseInt(followingResult.rows[0].count),
      avatar: avatarUrl,
      level: user.level || 1,
      achievements: achievements,
      isOnline: Math.random() > 0.5, // TODO: implement real online status
      country: user.country || 'ID',
      isFollowing: false // TODO: check if current user follows this user
    };

    console.log('Profile data sent:', profile.username);
    res.json(profile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload avatar
app.post('/api/users/:userId/avatar', async (req, res) => {
  try {
    const { userId } = req.params;
    const { avatar, filename } = req.body;

    console.log('Avatar upload request for user:', userId);
    console.log('Filename:', filename);
    console.log('Avatar data length:', avatar ? avatar.length : 0);

    if (!avatar || !filename) {
      return res.status(400).json({ error: 'Avatar data and filename are required' });
    }

    // Validate base64 data
    let cleanBase64 = avatar;
    if (avatar.startsWith('data:')) {
      const base64Match = avatar.match(/^data:[^;]+;base64,(.+)$/);
      if (base64Match) {
        cleanBase64 = base64Match[1];
      } else {
        return res.status(400).json({ error: 'Invalid base64 data format' });
      }
    } else if (avatar.match(/^[A-Za-z0-9+/]+={0,2}$/)) {
      cleanBase64 = avatar;
    } else {
      return res.status(400).json({ error: 'Invalid base64 data format' });
    }

    // Test if base64 is valid
    try {
      const testBuffer = Buffer.from(cleanBase64, 'base64');
      if (testBuffer.length === 0) {
        return res.status(400).json({ error: 'Empty image data' });
      }
      console.log('Base64 validation successful, buffer size:', testBuffer.length);
    } catch (base64Error) {
      console.error('Base64 validation failed:', base64Error);
      return res.status(400).json({ error: 'Invalid base64 data' });
    }

    // Check if user exists in database
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate unique avatar ID
    const avatarId = `avatar_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const avatarUrl = `/api/users/avatar/${avatarId}`;

    // Store avatar data in database with consistent naming
    await pool.query(`
      INSERT INTO user_album (user_id, filename, file_data) 
      VALUES ($1, $2, $3)
    `, [userId, `${avatarId}_avatar`, cleanBase64]);

    console.log(`Avatar stored in database with filename: ${avatarId}_avatar`);

    // Store avatar data in memory for immediate access
    if (!global.avatars) {
      global.avatars = {};
    }

    global.avatars[avatarId] = {
      id: avatarId,
      filename,
      data: cleanBase64, // Clean base64 data without data URL prefix
      uploadedBy: userId,
      uploadedAt: new Date().toISOString()
    };

    console.log(`Avatar stored in database and memory with ID: ${avatarId}`);

    // Update user avatar in database
    await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatarUrl, userId]);

    console.log(`Avatar uploaded successfully for user ${userId}:`, filename);

    res.json({
      avatarUrl,
      message: 'Avatar uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Serve avatar files
app.get('/api/users/avatar/:avatarId', async (req, res) => {
  try {
    const { avatarId } = req.params;
    console.log(`Serving avatar: ${avatarId}`);

    if (!global.avatars || !global.avatars[avatarId]) {
      console.log(`Avatar not found in memory: ${avatarId}, checking database...`);

      // Try to load from database
      try {
        // Try exact match first
        let dbResult = await pool.query(
          'SELECT file_data, filename FROM user_album WHERE filename = $1 LIMIT 1',
          [`${avatarId}_avatar`]
        );

        // If not found, try to match the full avatarId as prefix in filename
        if (dbResult.rows.length === 0) {
          dbResult = await pool.query(
            'SELECT file_data, filename FROM user_album WHERE filename LIKE $1 LIMIT 1',
            [`%${avatarId}%`]
          );
        }

        if (dbResult.rows.length > 0) {
          const dbAvatar = dbResult.rows[0];
          console.log(`Avatar found in database: ${dbAvatar.filename}`);

          // Restore to memory for faster access next time
          if (!global.avatars) {
            global.avatars = {};
          }

          global.avatars[avatarId] = {
            id: avatarId,
            filename: dbAvatar.filename,
            data: dbAvatar.file_data,
            uploadedBy: 'unknown',
            uploadedAt: new Date().toISOString()
          };

          // Continue with serving the avatar
        } else {
          console.log(`Avatar not found in database: ${avatarId}`);
          // Return a default avatar or placeholder instead of 404
          return res.status(200).json({ 
            error: 'Avatar not found',
            message: 'Default avatar should be used',
            avatarId: avatarId
          });
        }
      } catch (dbError) {
        console.error('Error loading avatar from database:', dbError);
        return res.status(200).json({ 
          error: 'Database error',
          message: 'Default avatar should be used',
          avatarId: avatarId
        });
      }
    }

    const avatar = global.avatars[avatarId];
    console.log(`Avatar found: ${avatar.filename}, data length: ${avatar.data.length}`);

    try {
      const buffer = Buffer.from(avatar.data, 'base64');
      console.log(`Buffer created, size: ${buffer.length} bytes`);

      let contentType = 'image/jpeg';
      if (avatar.filename.toLowerCase().includes('png')) {
        contentType = 'image/png';
      } else if (avatar.filename.toLowerCase().includes('gif')) {
        contentType = 'image/gif';
      } else if (avatar.filename.toLowerCase().includes('webp')) {
        contentType = 'image/webp';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      res.setHeader('Content-Disposition', `inline; filename="${avatar.filename}"`);

      console.log(`Sending avatar with content-type: ${contentType}`);
      res.send(buffer);
    } catch (bufferError) {
      console.error('Error creating buffer from base64:', bufferError);
      return res.status(500).json({ error: 'Invalid image data' });
    }
  } catch (error) {
    console.error('Error serving avatar:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user album
app.get('/api/users/:userId/album', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('=== GET USER ALBUM REQUEST ===');
    console.log('User ID/Username:', userId);

    // Check if userId is numeric (ID) or string (username)
    const isNumeric = /^\d+$/.test(userId);
    let actualUserId = userId;

    if (!isNumeric) {
      // Convert username to user ID
      const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [userId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      actualUserId = userResult.rows[0].id;
    }

    // Fetch from database
    const result = await pool.query(`
      SELECT * FROM user_album WHERE user_id = $1 ORDER BY uploaded_at DESC
    `, [actualUserId]);

    const photos = result.rows.map(row => ({
      id: row.id,
      image_url: `/api/users/album/${row.id}`,
      filename: row.filename,
      uploaded_at: row.uploaded_at
    }));

    console.log(`✅ Found ${photos.length} photos for user ${actualUserId}`);

    res.json({ photos });
  } catch (error) {
    console.error('Error fetching album:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user gifts
app.get('/api/users/:userId/gifts', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('=== GET USER GIFTS REQUEST ===');
    console.log('User ID/Username:', userId);

    // Check if userId is numeric (ID) or string (username)
    const isNumeric = /^\d+$/.test(userId);
    let actualUserId = userId;

    if (!isNumeric) {
      // Convert username to user ID
      const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [userId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      actualUserId = userResult.rows[0].id;
    }

    // Fetch from database
    const result = await pool.query(`
      SELECT gift_type, count(*) as count
      FROM user_gifts
      WHERE user_id = $1
      GROUP BY gift_type
    `, [actualUserId]);

    const gifts = result.rows.map(row => {
      const giftConfig = {
        'rose': { name: 'Rose', icon: '🌹', color: '#FF69B4' },
        'diamond': { name: 'Diamond', icon: '💎', color: '#87CEEB' },
        'crown': { name: 'Crown', icon: '👑', color: '#FFD700' },
        'heart': { name: 'Heart', icon: '❤️', color: '#FF6B6B' }
      };

      const config = giftConfig[row.gift_type] || { name: row.gift_type, icon: '🎁', color: '#999' };

      return {
        id: row.gift_type,
        name: config.name,
        icon: config.icon,
        color: config.color,
        count: parseInt(row.count)
      };
    });

    res.json(gifts);
  } catch (error) {
    console.error('Error fetching gifts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload photo/video for posts
app.post('/api/users/:userId/album', async (req, res) => {
  try {
    const { userId } = req.params;
    const { photo, filename } = req.body;

    console.log('Album photo upload request for user:', userId);

    if (!photo || !filename) {
      return res.status(400).json({ error: 'Photo data and filename are required' });
    }

    // Check if user exists in database
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const uploadedAt = new Date().toISOString();

    // Save to database for persistence (auto-generate ID)
    const insertResult = await pool.query(`
      INSERT INTO user_album (user_id, filename, file_data, uploaded_at)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [userId, filename, photo, uploadedAt]);

    const dbId = insertResult.rows[0].id;
    const photoUrl = `/api/users/album/${dbId}`;

    console.log(`Album photo uploaded successfully for user ${userId}:`, filename, 'DB ID:', dbId);

    // Return response in format expected by frontend
    res.json({
      id: dbId.toString(),
      url: photoUrl,
      filename,
      uploadedAt,
      message: 'Photo uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading album photo:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Delete album photo
app.delete('/api/users/:userId/album/:photoId', authenticateToken, async (req, res) => {
  try {
    const { userId, photoId } = req.params;

    console.log(`=== DELETE ALBUM PHOTO REQUEST ===`);
    console.log(`User ID from params: ${userId} (type: ${typeof userId})`);
    console.log(`User ID from token: ${req.user.id} (type: ${typeof req.user.id})`);
    console.log(`Photo ID: ${photoId}`);

    // Verify user can only delete their own photos - convert both to integers for comparison
    if (parseInt(userId, 10) !== parseInt(req.user.id, 10)) {
      console.log(`Authorization failed: ${parseInt(userId, 10)} !== ${parseInt(req.user.id, 10)}`);
      return res.status(403).json({ error: 'Unauthorized to delete this photo' });
    }

    // Check if photo exists and belongs to user
    const photoResult = await pool.query(
      'SELECT * FROM user_album WHERE id = $1 AND user_id = $2',
      [photoId, userId]
    );

    if (photoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found or does not belong to user' });
    }

    // Delete the photo from database
    await pool.query('DELETE FROM user_album WHERE id = $1', [photoId]);

    console.log(`Album photo deleted successfully: ${photoId}`);
    
    res.json({
      success: true,
      message: 'Photo deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting album photo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve album photos
app.get('/api/users/album/:photoId', async (req, res) => {
  try {
    const { photoId } = req.params;

    // Try to fetch from database first
    const result = await pool.query('SELECT * FROM user_album WHERE id = $1', [photoId]);
    
    if (result.rows.length === 0) {
      // Fallback to memory if not in database
      if (!global.albumPhotos || !global.albumPhotos[photoId]) {
        return res.status(404).json({ error: 'Photo not found' });
      }
      
      const photo = global.albumPhotos[photoId];
      const buffer = Buffer.from(photo.data, 'base64');

      let contentType = 'image/jpeg';
      if (photo.filename.toLowerCase().includes('png')) {
        contentType = 'image/png';
      } else if (photo.filename.toLowerCase().includes('gif')) {
        contentType = 'image/gif';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${photo.filename}"`);
      return res.send(buffer);
    }

    // Serve from database
    const photo = result.rows[0];
    const buffer = Buffer.from(photo.file_data, 'base64');

    let contentType = 'image/jpeg';
    if (photo.filename.toLowerCase().includes('png')) {
      contentType = 'image/png';
    } else if (photo.filename.toLowerCase().includes('gif')) {
      contentType = 'image/gif';
    } else if (photo.filename.toLowerCase().includes('webp')) {
      contentType = 'image/webp';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Content-Disposition', `inline; filename="${photo.filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Error serving album photo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile with extended fields
app.put('/api/users/:userId/profile', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      username,
      bio,
      phone,
      gender,
      birthDate,
      country,
      signature
    } = req.body;

    // Check if user exists
    const existingUser = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Build update query dynamically
    const updateFields = [];
    const values = [];
    let paramCounter = 1;

    if (username !== undefined) {
      updateFields.push(`username = $${paramCounter++}`);
      values.push(username);
    }
    if (bio !== undefined) {
      updateFields.push(`bio = $${paramCounter++}`);
      values.push(bio);
      paramCounter++;
    }
    if (phone !== undefined) {
      updateFields.push(`phone = $${paramCounter++}`);
      values.push(phone);
    }
    if (gender !== undefined) {
      updateFields.push(`gender = $${paramCounter++}`);
      values.push(gender);
    }
    if (birthDate !== undefined) {
      updateFields.push(`birth_date = $${paramCounter++}`);
      values.push(birthDate === null || birthDate === '' ? null : birthDate);
    }
    if (country !== undefined) {
      updateFields.push(`country = $${paramCounter++}`);
      values.push(country);
    }
    if (signature !== undefined) {
      updateFields.push(`signature = $${paramCounter++}`);
      values.push(signature);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Add updated_at timestamp
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const updateQuery = `
      UPDATE users
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCounter}
      RETURNING id, username, email, bio, phone, avatar, gender, birth_date, country, signature, verified, role
    `;

    const result = await pool.query(updateQuery, values);
    const updatedUser = result.rows[0];

    console.log(`Profile updated for user ${userId}`);
    res.json({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      bio: updatedUser.bio,
      phone: updatedUser.phone,
      avatar: updatedUser.avatar,
      gender: updatedUser.gender,
      birthDate: updatedUser.birth_date,
      country: updatedUser.country,
      signature:signature,
      verified: updatedUser.verified,
      role: updatedUser.role
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload photo/video for posts
app.post('/api/feed/upload', (req, res) => {
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

    // Detailed validation with specific error messages
    const missingFields = [];
    if (!req.body.type) missingFields.push('type');
    if (!req.body.data) missingFields.push('data');
    if (!req.body.filename) missingFields.push('filename');
    if (!req.body.user) missingFields.push('user');

    if (missingFields.length > 0) {
      console.error('Missing required fields:', missingFields);
      return res.status(400).json({
        error: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields: missingFields,
        received: {
          type: req.body.type || 'missing',
          data: req.body.data ? `${req.body.data.length} characters` : 'missing',
          filename: req.body.filename || 'missing',
          user: req.body.user || 'missing'
        }
      });
    }

    // Validate file type
    const validTypes = ['photo', 'video'];
    if (!validTypes.includes(req.body.type)) {
      console.error('Invalid file type:', req.body.type);
      return res.status(400).json({
        error: `Invalid file type "${req.body.type}". Must be one of: ${validTypes.join(', ')}`
      });
    }

    // Validate filename
    if (typeof req.body.filename !== 'string' || req.body.filename.trim().length === 0) {
      console.error('Invalid filename:', req.body.filename);
      return res.status(400).json({ error: 'Filename must be a non-empty string' });
    }

    // Validate user
    if (typeof req.body.user !== 'string' || req.body.user.trim().length === 0) {
      console.error('Invalid user:', req.body.user);
      return res.status(400).json({ error: 'User must be a non-empty string' });
    }

    // Validate base64 data
    if (typeof req.body.data !== 'string' || req.body.data.length === 0) {
      console.error('Data is not a string or is empty');
      return res.status(400).json({ error: 'Data must be a non-empty string' });
    }

    // Check for placeholder data
    if (req.body.data === 'video_placeholder' || req.body.data === 'photo_placeholder') {
      console.error('Received placeholder data');
      return res.status(400).json({
        error: 'File processing failed. Please try selecting the file again.'
      });
    }

    let isValidBase64 = false;
    let actualData = req.body.data;

    if (req.body.data.startsWith('data:')) {
      // Extract base64 data from data URL
      const base64Match = req.body.data.match(/^data:[^;]+;base64,(.+)$/);
      if (base64Match) {
        actualData = base64Match[1];
        isValidBase64 = true;
      }
    } else if (req.body.data.match(/^[A-Za-z0-9+/]+={0,2}$/)) {
      isValidBase64 = true;
      actualData = req.body.data;
    }

    // Check minimum data length (should be more than a few bytes for real media)
    if (actualData.length < 100) {
      console.error('Data too short for', req.body.type, 'length:', actualData.length);
      return res.status(400).json({
        error: 'File data appears to be corrupted or incomplete. Please try uploading again.'
      });
    }

    if (!isValidBase64) {
      console.error('Invalid base64 data format');
      return res.status(400).json({
        error: 'Invalid file data format. Please ensure the file is properly encoded as base64.'
      });
    }

    // Use the validated base64 data
    let base64Data = actualData;

    // Generate unique filename with proper extension
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    let fileExtension = path.extname(req.body.filename);

    // If no extension, determine from type and content
    if (!fileExtension) {
      if (req.body.type === 'video') {
        fileExtension = '.mp4'; // Default to mp4 for videos
      } else {
        fileExtension = '.jpg'; // Default to jpg for photos
      }
    }

    const fileId = `file_${timestamp}_${randomSuffix}${fileExtension}`;
    const filePath = path.join(__dirname, 'uploads', 'media', fileId);

    // Ensure the uploads/media directory exists
    const uploadsDir = path.join(__dirname, 'uploads', 'media');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    try {
      // Write the base64 data to a file
      fs.writeFileSync(filePath, base64Data, 'base64');

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
      filename: req.body.filename,
      type: req.body.type, // 'photo' or 'video'
      data: base64Data, // base64 data
      uploadedBy: req.body.user,
      uploadedAt: new Date().toISOString(),
      url: `/api/feed/media/${fileId}`, // URL to access the file
      size: Buffer.byteLength(base64Data, 'base64') // Accurate file size in bytes
    };

    // Store in memory (in production, use proper file storage)
    if (!global.uploadedFiles) {
      global.uploadedFiles = {};
    }
    global.uploadedFiles[fileId] = uploadedFile;

    console.log(`${req.body.type} uploaded:`, req.body.filename, 'by', req.body.user, `Size: ${uploadedFile.size} bytes`);

    res.json({
      success: true,
      fileId: fileId.replace(fileExtension, ''), // Return ID without extension for compatibility
      url: `/api/feed/media/${fileId}`, // But use full filename in URL
      filename: req.body.filename,
      type: req.body.type
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve uploaded media files
app.use('/api/feed/media', express.static(path.join(__dirname, 'uploads/media')));

// Serve card assets for LowCard game
app.use('/cards', express.static(path.join(__dirname, '../assets/card')));

// Serve assets folder statically
app.use('/assets', express.static(path.join(__dirname, '../assets')));


// Serve uploaded emoji files (legacy support)
app.get('/uploads/emojis/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    // Redirect to assets path for legacy support
    const filePath = path.join(__dirname, '../assets/emoticon', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Emoji file not found' });
    }

    // Determine content type
    const ext = filename.toLowerCase().split('.').pop();
    let contentType = 'image/png';

    switch (ext) {
      case 'gif':
        contentType = 'image/gif';
        break;
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg';
        break;
      case 'webm':
        contentType = 'video/webm';
        break;
      case 'png':
      default:
        contentType = 'image/png';
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving emoji file:', error);
    res.status(500).json({ error: 'Error serving emoji file' });
  }
});

// Serve avatar files without /api prefix (backward compatibility)
app.get('/users/avatar/:avatarId', (req, res) => {
  // Redirect to the API endpoint
  res.redirect(301, `/api/users/avatar/${req.params.avatarId}`);
});

// Serve uploaded gift files
app.get('/uploads/gifts/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../uploads/gifts', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Gift file not found' });
    }

    // Determine content type
    const ext = filename.toLowerCase().split('.').pop();
    let contentType = 'image/png';

    switch (ext) {
      case 'gif':
        contentType = 'image/gif';
        break;
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg';
        break;
      case 'webm':
        contentType = 'video/webm';
        break;
      case 'png':
      default:
        contentType = 'image/png';
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving gift file:', error);
    res.status(500).json({ error: 'Error serving gift file' });
  }
});

// Serve frame avatar assets
app.get('/assets/frame_ava/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../assets/frame_ava', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Frame avatar file not found' });
    }

    // Determine content type
    const ext = filename.toLowerCase().split('.').pop();
    let contentType = 'image/png';

    switch (ext) {
      case 'gif':
        contentType = 'image/gif';
        break;
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg';
        break;
      case 'png':
        contentType = 'image/png';
        break;
      case 'webm':
        contentType = 'video/webm';
        break;
      default:
        contentType = 'image/png';
        break;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving frame avatar file:', error);
    res.status(500).json({ error: 'Error serving frame avatar file' });
  }
});

// Serve uploaded media files
app.get('/api/feed/media/:fileId', (req, res) => {
  try {
    const { fileId } = req.params;
    console.log(`GET /api/feed/media/${fileId} - ${new Date().toISOString()}`);

    // Ensure media directory exists
    const mediaDir = path.join(__dirname, 'uploads', 'media');
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

      // Check if it's a known missing file and clean up database reference
      if (fileId.includes('file_1755819832061_3xjv6')) {
        console.log('Detected missing file from error, should clean up database reference');
      }

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

// Create post with media
app.post('/api/feed/posts/with-media', async (req, res) => {
  try {
    const { content, user, username, level = 1, avatar = 'U', mediaFiles = [] } = req.body;

    console.log('=== CREATE POST WITH MEDIA REQUEST ===');
    console.log('Content:', content);
    console.log('User:', user);
    console.log('Username:', username);
    console.log('Media Files:', JSON.stringify(mediaFiles, null, 2));

    // Find user by username
    const userResult = await pool.query('SELECT id, level FROM users WHERE username = $1', [username || user]);
    const userId = userResult.rows.length > 0 ? userResult.rows[0].id : 1; // Default to user ID 1 if not found
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
      INSERT INTO posts (user_id, username, content, media_files, likes, shares)
      VALUES ($1, $2, $3, $4, 0, 0)
      RETURNING *
    `, [userId, username || user, content ? content.trim() : '', JSON.stringify(processedMediaFiles)]);

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
      mediaFiles: processedMediaFiles
    };

    console.log('New post with media created successfully:', newPost.id);
    console.log('Response post media files:', responsePost.mediaFiles);
    res.status(201).json(responsePost);
  } catch (error) {
    console.error('Error creating post with media:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Deduct coins for calls with recipient share (70% balance + 30% withdraw)
app.post('/api/user/deduct-coins', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.userId;
    const { amount, type, description, recipientUsername } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!recipientUsername) {
      return res.status(400).json({ error: 'Recipient username required' });
    }

    // Prevent self-calling to avoid abuse
    if (req.user.username === recipientUsername) {
      return res.status(400).json({ error: 'Cannot call yourself' });
    }

    await client.query('BEGIN');

    try {
      // Lock and check balance caller balance to prevent race conditions
      const userResult = await client.query('SELECT balance FROM user_credits WHERE user_id = $1 FOR UPDATE', [userId]);
      if (userResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'User not found' });
      }

      const currentBalance = userResult.rows[0].balance;
      if (currentBalance < amount) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Calculate shares: 70% to recipient balance, 30% to recipient withdraw
      const recipientBalanceShare = Math.floor(amount * 0.7);
      const recipientWithdrawShare = amount - recipientBalanceShare;

      // Get recipient ID and validate exists
      const recipientResult = await client.query('SELECT id FROM users WHERE username = $1', [recipientUsername]);
      if (recipientResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Recipient not found' });
      }
      const recipientId = recipientResult.rows[0].id;

      // Deduct from caller
      await client.query(
        'UPDATE user_credits SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [amount, userId]
      );

      // Add 70% to recipient's regular balance
      await client.query(`
        INSERT INTO user_credits (user_id, balance) VALUES ($1, $2)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          balance = user_credits.balance + EXCLUDED.balance,
          updated_at = CURRENT_TIMESTAMP
      `, [recipientId, recipientBalanceShare]);

      // Add 30% to recipient's balance withdraw
      await client.query(`
        INSERT INTO user_gift_earnings_balance (user_id, balance, total_earned)
        VALUES ($1, $2, $2)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          balance = user_gift_earnings_balance.balance + EXCLUDED.balance,
          total_earned = user_gift_earnings_balance.total_earned + EXCLUDED.balance,
          updated_at = CURRENT_TIMESTAMP
      `, [recipientId, recipientWithdrawShare]);

      // Record transaction
      await client.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
        VALUES ($1, $2, $3, 'call', $4)
      `, [userId, recipientId, amount, description || 'Credit transfer']);

      await client.query('COMMIT');

      // Get updated balance
      const updatedUser = await client.query('SELECT balance FROM user_credits WHERE user_id = $1', [userId]);

      res.json({
        success: true,
        newBalance: updatedUser.rows[0].balance,
        deducted: amount,
        recipientBalanceShare,
        recipientWithdrawShare
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error deducting coins:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Get user balance
app.get('/api/user/balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await pool.query('SELECT balance FROM user_credits WHERE user_id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ balance: result.rows[0].balance });
  } catch (error) {
    console.error('Error getting balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Note: Agora video calling is now handled client-side with channel names
// No server-side room creation needed as Agora uses channel-based architecture

// Private chat routes are handled by the chat router at /api/chat
// See server/routes/chat.js for all private chat endpoints
// Old duplicate endpoints removed to prevent routing conflicts (lines 6033-6279)

/*
// REMOVED: Duplicate private chat endpoints that were conflicting with chat router
app.post('/api/chat/private', authenticateToken, async (req, res) => {
  console.log('POST /chat/private -', new Date().toISOString());
  console.log('=== AUTH TOKEN MIDDLEWARE ===');
  console.log('Auth header:', req.headers.authorization ? 'Present' : 'Missing');
  console.log('Token:', req.headers.authorization ? maskToken(req.headers.authorization) : 'Missing');
  console.log('Token verified for user ID:', req.user.userId);
  console.log('User authenticated:', req.user.username, 'Role:', req.user.role);

  try {
    const { participants, initiatedBy, targetUserId } = req.body;
    const currentUserId = req.user.userId;

    console.log('=== CREATE PRIVATE CHAT REQUEST ===');
    console.log('Participants:', participants);
    console.log('Initiated by:', initiatedBy);
    console.log('Current user ID:', currentUserId);

    if (!participants || !Array.isArray(participants) || participants.length !== 2) {
      return res.status(400).json({ error: 'Exactly 2 participants required' });
    }

    if (!participants.includes(req.user.username)) {
      return res.status(403).json({ error: 'You must be one of the participants' });
    }

    // Get the other participant (target user)
    const targetUsername = participants.find(p => p !== req.user.username);

    if (!targetUsername) {
      return res.status(400).json({ error: 'Could not determine target user' });
    }

    // Check if target user exists and get their status
    const targetUserResult = await pool.query(`
      SELECT id, username, status FROM users WHERE username = $1
    `, [targetUsername]);

    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({ error: `User ${targetUsername} not found` });
    }

    const targetUser = targetUserResult.rows[0];
    const targetStatus = targetUser.status || 'online';
    console.log('Found target user:', targetUser, 'Status:', targetStatus);

    // Check user status and block chat creation if needed
    if (targetStatus === 'busy') {
      return res.status(423).json({ 
        error: 'This user is currently busy and cannot be contacted' 
      });
    }

    // Create a consistent chat ID based on participant IDs
    const userIds = [req.user.userId, targetUser.id].sort((a, b) => parseInt(a) - parseInt(b));
    const chatId = `private_${userIds[0]}_${userIds[1]}`;

    console.log('Generated chat ID:', chatId, 'for user IDs:', userIds);

    // Check if chat already exists
    const existingChat = await pool.query(`
      SELECT * FROM private_chats WHERE id = $1
    `, [chatId]);

    if (existingChat.rows.length > 0) {
      console.log('Private chat already exists:', chatId);
      return res.json({
        id: chatId,
        participants,
        created_at: existingChat.rows[0].created_at,
        isExisting: true
      });
    }

    // Create new private chat
    const chatResult = await pool.query(`
      INSERT INTO private_chats (id, participant1_id, participant1_username, participant2_id, participant2_username, initiated_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [chatId, userIds[0], participants[0], userIds[1], participants[1], initiatedBy]);

    // Add participants
    for (let i = 0; i < participants.length; i++) {
      await pool.query(`
        INSERT INTO private_chat_participants (chat_id, user_id, username, joined_at)
        VALUES ($1, $2, $3, NOW())
      `, [chatId, parseInt(userIds[i]), participants[i]]);
    }

    console.log('Private chat created successfully:', chatId);

    res.json({
      id: chatId,
      participants,
      created_at: chatResult.rows[0].created_at,
      isExisting: false
    });

  } catch (error) {
    console.error('Error creating private chat:', error);

    // Handle unique constraint violation (chat already exists)
    if (error.code === '23505') {
      // Extract chat ID from participants
      const userIds = [req.user.userId, parseInt(req.body.targetUserId || 0)].sort((a, b) => a - b);
      const chatId = `private_${userIds[0]}_${userIds[1]}`;

      // Fetch existing chat info
      const existingChat = await pool.query('SELECT created_at FROM private_chats WHERE id = $1', [chatId]);

      return res.json({
        id: chatId,
        participants: req.body.participants,
        createdAt: existingChat.rows.length > 0 ? existingChat.rows[0].created_at : new Date().toISOString(),
        isExisting: true
      });
    }

    res.status(500).json({ error: 'Failed to create private chat' });
  }
});

// Route for getting private chat messages
app.get('/api/chat/private/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    console.log('=== GET PRIVATE CHAT MESSAGES ===');
    console.log('Chat ID:', chatId);

    // Get messages from database
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

    console.log(`Returning ${messages.length} private chat messages for ${chatId}`);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching private chat messages:', error);
    res.status(500).json({ error: 'Failed to fetch private chat messages' });
  }
});

// Save private chat message
app.post('/api/chat/private/:chatId/messages', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content, type = 'message' } = req.body;
    const userId = req.user.id;
    const username = req.user.username;

    console.log('=== SAVE PRIVATE CHAT MESSAGE ===');
    console.log('Chat ID:', chatId);
    console.log('User:', username);
    console.log('Content:', content);

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Save message to database
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

    console.log('Private chat message saved successfully');
    res.json(savedMessage);
  } catch (error) {
    console.error('Error saving private chat message:', error);
    res.status(500).json({ error: 'Failed to save private chat message' });
  }
});

// Clear private chat messages
app.delete('/api/chat/private/:chatId/messages', authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.id;
    const username = req.user.username;

    console.log('=== CLEAR PRIVATE CHAT MESSAGES ===');
    console.log('Chat ID:', chatId);
    console.log('User:', username);

    // Check if user is participant in this chat
    const participantCheck = await pool.query(`
      SELECT 1 FROM private_chat_participants 
      WHERE chat_id = $1 AND username = $2
    `, [chatId, username]);

    if (participantCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a participant in this chat' });
    }

    // Delete all messages in this private chat
    const result = await pool.query(`
      DELETE FROM chat_messages 
      WHERE room_id = $1 AND is_private = true
    `, [chatId]);

    console.log(`Cleared ${result.rowCount} messages from private chat ${chatId}`);
    res.json({ 
      message: 'Private chat cleared successfully',
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('Error clearing private chat messages:', error);
    res.status(500).json({ error: 'Failed to clear private chat messages' });
  }
});
*/
// END OF REMOVED DUPLICATE ENDPOINTS

// Get message history with pagination
app.get('/api/rooms/:roomId/messages/history', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { limit = 50, before, after } = req.query;

    let query = `
      SELECT
        cm.*,
        u.avatar,
        u.verified
      FROM chat_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.room_id = $1
    `;

    let params = [roomId];
    let paramCount = 1;

    if (before) {
      paramCount++;
      query += ` AND cm.created_at < $${paramCount}`;
      params.push(before);
    }

    if (after) {
      paramCount++;
      query += ` AND cm.created_at > $${paramCount}`;
      params.push(after);
    }

    query += ` ORDER BY cm.created_at DESC LIMIT $${paramCount + 1}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    const messages = result.rows.map(row => ({
      id: row.id.toString(),
      sender: row.username,
      content: row.content,
      timestamp: row.created_at,
      roomId: row.room_id,
      role: row.user_role,
      level: row.user_level,
      type: row.message_type,
      userRole: row.user_role,
      media: row.media_data ? JSON.parse(row.media_data) : null,
      avatar: row.avatar,
      verified: row.verified,
      isPrivate: row.is_private
    }));

    res.json({
      messages: messages.reverse(),
      hasMore: messages.length === parseInt(limit),
      oldest: messages.length > 0 ? messages[0].timestamp : null,
      newest: messages.length > 0 ? messages[messages.length - 1].timestamp : null
    });
  } catch (error) {
    console.error('Error fetching message history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete message (admin only)
app.delete('/api/messages/:messageId', authenticateToken, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete messages' });
    }

    const result = await pool.query(
      'DELETE FROM chat_messages WHERE id = $1 RETURNING *',
      [messageId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const deletedMessage = result.rows[0];

    // Broadcast message deletion to room
    io.to(deletedMessage.room_id).emit('message-deleted', {
      messageId: deletedMessage.id.toString(),
      roomId: deletedMessage.room_id
    });

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check if user can afford gift
app.post('/api/gifts/check-balance', authenticateToken, async (req, res) => {
  try {
    const { giftPrice } = req.body;
    const userId = req.user.id;

    if (!giftPrice || giftPrice <= 0) {
      return res.status(400).json({ error: 'Invalid gift price' });
    }

    // Get user's balance
    const balanceResult = await pool.query('SELECT balance FROM user_credits WHERE user_id = $1', [userId]);
    const balance = balanceResult.rows.length > 0 ? balanceResult.rows[0].balance : 0;

    const canAfford = balance >= giftPrice;
    const recipientShare = Math.floor(giftPrice * 0.3);
    const systemShare = giftPrice - recipientShare;

    res.json({
      canAfford,
      currentBalance: balance,
      giftPrice,
      recipientShare,
      systemShare,
      remainingBalance: balance - giftPrice
    });

  } catch (error) {
    console.error('Error checking gift balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process gift purchase and earnings distribution
app.post('/api/gifts/purchase', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    const { giftId, recipientUserId, roomId } = req.body;
    const senderId = req.user.id;
    const senderUsername = req.user.username;

    if (!giftId || !recipientUserId) {
      return res.status(400).json({ error: 'Gift ID and recipient required' });
    }

    // Prevent self-gifting to avoid converting credits to withdrawable earnings
    if (senderId === recipientUserId) {
      return res.status(400).json({ error: 'Cannot send gifts to yourself' });
    }

    await client.query('BEGIN');

    try {
      // Validate gift exists and get server-side price inside transaction
      const giftResult = await client.query('SELECT name, price FROM custom_gifts WHERE id = $1 FOR SHARE', [giftId]);
      if (giftResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid gift' });
      }

      const { name: giftName, price: giftPrice } = giftResult.rows[0];

      // Runtime validation: ensure gift price is positive to prevent credit minting attacks
      if (giftPrice <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid gift price' });
      }

      // Get recipient username from database for security inside transaction
      const recipientResult = await client.query('SELECT username FROM users WHERE id = $1', [recipientUserId]);
      if  (recipientResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid recipient' });
      }
      const recipientUsername = recipientResult.rows[0].username;

      // Lock and validate sender's balance first to prevent race conditions
      const balanceCheck = await client.query(`
        SELECT balance FROM user_credits WHERE user_id = $1 FOR UPDATE
      `, [senderId]);

      if (balanceCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      const currentBalance = balanceCheck.rows[0].balance;
      if (currentBalance < giftPrice) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Atomic balance deduction with proper locking - prevents race conditions
      const deductResult = await client.query(`
        UPDATE user_credits 
        SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP 
        WHERE user_id = $2 
        RETURNING balance
      `, [giftPrice, senderId]);

      if (deductResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Gift earnings: 30% to recipient balance, 70% to system
      const recipientShare = Math.floor(giftPrice * 0.3);
      const systemShare = giftPrice - recipientShare;

      // Record the gift transaction in credit_transactions table
      await client.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type)
        VALUES ($1, $2, $3, 'gift')
      `, [senderId, recipientUserId, giftPrice]);

      // Record gift earnings for recipient
      await client.query(`
        INSERT INTO gift_earnings (user_id, gift_id, gift_name, gift_price, user_share, system_share, sender_username, room_id, is_private)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [recipientUserId, giftId, giftName, giftPrice, recipientShare, systemShare, senderUsername, roomId, isPrivate || false]);

      // Atomic upsert for gift earnings balance - prevents race conditions
      await client.query(`
        INSERT INTO user_gift_earnings_balance (user_id, balance, total_earned)
        VALUES ($1, $2, $2)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          balance = user_gift_earnings_balance.balance + EXCLUDED.balance,
          total_earned = user_gift_earnings_balance.total_earned + EXCLUDED.balance,
          updated_at = CURRENT_TIMESTAMP
      `, [recipientUserId, recipientShare]);

      await client.query('COMMIT');

      // Get updated balances
      const newSenderBalance = deductResult.rows[0].balance;
      const newRecipientGiftBalance = await client.query('SELECT balance FROM user_gift_earnings_balance WHERE user_id = $1', [recipientUserId]);

      res.json({
        success: true,
        transaction: {
          giftName,
          giftPrice,
          recipientShare,
          systemShare,
          sender: senderUsername,
          recipient: recipientUsername,
          roomId
        },
        balances: {
          senderBalance: newSenderBalance,
          recipientGiftEarnings: newRecipientGiftBalance.rows[0]?.balance || 0
        }
      });

      console.log(`Gift purchased: ${senderUsername} sent ${giftName} (${giftPrice} coins) to ${recipientUsername}. Recipient earned ${recipientShare} coins (30% to balance withdraw), system got ${systemShare} coins (70%)`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error purchasing gift:', error);
    res.status(500).json({ error: 'Failed to send gift' });
  } finally {
    client.release();
  }
});

// Get current exchange rate
app.get('/api/exchange-rate', async (req, res) => {
  try {
    const rate = await getExchangeRate();
    res.json({
      usdToIdr: rate,
      minWithdrawUSD: 10,
      minWithdrawCoins: Math.floor(10 * rate),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    // Fallback to default rate if API fails
    res.json({
      usdToIdr: 15500,
      minWithdrawUSD: 10,
      minWithdrawCoins: 155000,
      timestamp: new Date().toISOString()
    });
  }
});

// Get withdrawal history
app.get('/api/user/withdrawal-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT 
        id,
        amount,
        amount_usd as "amountUSD",
        withdrawal_method as "method",
        account_type as "accountType",
        account_name as "accountName",
        account_number as "accountNumber",
        status,
        failure_reason as "failureReason",
        created_at as "createdAt",
        processed_at as "processedAt"
      FROM withdrawal_requests 
      WHERE user_id = $1 
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId]);

    res.json({
      withdrawals: result.rows
    });

  } catch (error) {
    console.error('Error fetching withdrawal history:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal history' });
  }
});

// Debug endpoint to list media files
app.get('/api/debug/media-files', (req, res) => {
  try {
    const mediaDir = path.join(__dirname, 'uploads', 'media');

    if (!fs.existsSync(mediaDir)) {
      return res.json({ 
        error: 'Media directory does not exist',
        mediaDir: mediaDir 
      });
    }

    const files = fs.readdirSync(mediaDir);
    const fileDetails = files.map(filename => {
      const filePath = path.join(mediaDir, filename);
      const stats = fs.statSync(filePath);
      return {
        filename,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        path: filePath
      };
    });

    res.json({
      mediaDir: mediaDir,
      totalFiles: files.length,
      files: fileDetails
    });
  } catch (error) {
    console.error('Error listing media files:', error);
    res.status(500).json({ error: 'Failed to list media files' });
  }
});

// Cleanup missing avatars (admin only)
app.post('/api/admin/cleanup-missing-avatars', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('Starting cleanup of users with missing avatars...');

    // Get all users with avatar URLs
    const usersWithAvatars = await pool.query(`
      SELECT id, username, avatar FROM users 
      WHERE avatar IS NOT NULL AND avatar LIKE '/api/users/avatar/%'
    `);

    let cleanedUsers = 0;
    const missingAvatars = [];

    for (const user of usersWithAvatars.rows) {
      const avatarId = user.avatar.split('/').pop();

      // Check if avatar exists in database
      const avatarResult = await pool.query(
        'SELECT id FROM user_album WHERE filename LIKE $1 LIMIT 1',
        [`%${avatarId}%`]
      );

      if (avatarResult.rows.length === 0){
        // Avatar not found, clear the avatar field
        await pool.query('UPDATE users SET avatar = NULL WHERE id = $1', [user.id]);
        cleanedUsers++;
        missingAvatars.push({ userId: user.id, username: user.username, avatarId });
        console.log(`Cleaned missing avatar for user ${user.username}: ${avatarId}`);
      }
    }

    res.json({
      message: 'Avatar cleanup completed',
      cleanedUsers: cleanedUsers,
      missingAvatars: missingAvatars.length,
      details: missingAvatars.slice(0, 10) // Show first 10 missing avatars
    });

  } catch (error) {
    console.error('Error during avatar cleanup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cleanup missing media files from posts (admin only)
app.post('/api/admin/cleanup-missing-media', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    console.log('Starting cleanup of posts with missing media files...');

    // Get all posts with media files
    const postsWithMedia = await pool.query(`
      SELECT id, media_files FROM posts 
      WHERE media_files IS NOT NULL AND media_files != '[]'::jsonb
    `);

    const mediaDir = path.join(__dirname, 'uploads', 'media');
    let cleanedPosts = 0;
    const missingFiles = [];

    for (const post of postsWithMedia.rows) {
      const mediaFiles = post.media_files;
      let hasValidMedia = false;

      for (const media of mediaFiles) {
        if (media.url) {
          // Extract filename from URL
          const filename = media.url.split('/').pop();
          const filePath = path.join(mediaDir, filename);

          if (fs.existsSync(filePath)) {
            hasValidMedia = true;
          } else {
            missingFiles.push({ postId: post.id, filename, url: media.url });
          }
        }
      }

      // If no valid media files exist, remove media_files from post
      if (!hasValidMedia && mediaFiles.length > 0) {
        await pool.query(`
          UPDATE posts SET media_files = $1 WHERE id = $2
        `, [JSON.stringify([]), post.id]);
        cleanedPosts++;
        console.log(`Cleaned post ${post.id} with missing media files`);
      }
    }

    res.json({
      message: 'Cleanup completed',
      cleanedPosts: cleanedPosts,
      missingFiles: missingFiles.length,
      details: missingFiles.slice(0, 10) // Show first 10 missing files
    });

  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Credit management endpoints
app.get('/api/credits/balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('=== GET CREDITS BALANCE REQUEST ===');
    console.log('User ID:', userId);

    const result = await pool.query('SELECT balance FROM user_credits WHERE user_id = $1', [userId]);

    let balance = 0;
    if (result.rows.length > 0) {
      balance = result.rows[0].balance;
    } else {
      // Initialize user credits if not exists
      await pool.query('INSERT INTO user_credits (user_id, balance) VALUES ($1, $2)', [userId, 0]);
    }

    res.json({ balance });
  } catch (error) {
    console.error('Error fetching credits balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/credits/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('=== GET CREDITS HISTORY REQUEST ===');
    console.log('User ID:', userId);

    const result = await pool.query(`
      SELECT 
        ct.*,
        CASE 
          WHEN ct.from_user_id = $1 THEN 'send'
          WHEN ct.to_user_id = $1 THEN 'receive'
        END as type,
        CASE 
          WHEN ct.from_user_id = $1 THEN (SELECT username FROM users WHERE id = ct.to_user_id)
          WHEN ct.to_user_id = $1 THEN (SELECT username FROM users WHERE id = ct.from_user_id)
        END as other_user
      FROM credit_transactions ct
      WHERE ct.from_user_id = $1 OR ct.to_user_id = $1
      ORDER BY ct.created_at DESC
      LIMIT 50
    `, [userId]);

    const transactions = result.rows.map(row => ({
      id: row.id,
      amount: row.amount,
      type: row.type,
      otherUser: row.other_user,
      createdAt: row.created_at
    }));

    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching credits history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/credits/transfer', authenticateToken, async (req, res) => {
  try {
    const { toUsername, amount, pin } = req.body;
    const fromUserId = req.user.id;

    console.log('=== CREDIT TRANSFER REQUEST ===');
    console.log('From User ID:', fromUserId);
    console.log('To Username:', toUsername);
    console.log('Amount:', amount);

    // Validate input
    if (!toUsername || !amount || !pin) {
      return res.status(400).json({ error: 'Username, amount, and PIN are required' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    // Verify PIN
    const userResult = await pool.query('SELECT pin FROM users WHERE id = $1', [fromUserId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userPin = userResult.rows[0].pin || '000000';
    if (pin !== userPin) {
      return res.status(400).json({ error: 'Invalid PIN' });
    }

    // Find target user
    const targetUserResult = await pool.query('SELECT id, username FROM users WHERE username = $1', [toUsername]);
    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const toUserId = targetUserResult.rows[0].id;

    if (fromUserId === toUserId) {
      return res.status(400).json({ error: 'Cannot transfer credits to yourself' });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Check sender's balance
      const balanceResult = await pool.query('SELECT balance FROM user_credits WHERE user_id = $1', [fromUserId]);
      let senderBalance = 0;

      if (balanceResult.rows.length > 0) {
        senderBalance = balanceResult.rows[0].balance;
      } else {
        // Initialize sender credits if not exists
        await pool.query('INSERT INTO user_credits (user_id, balance) VALUES ($1, $2)', [fromUserId, 0]);
      }

      if (senderBalance < amount) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Deduct from sender
      await pool.query(
        'UPDATE user_credits SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
        [amount, fromUserId]
      );

      // Add to receiver (create account if doesn't exist)
      const receiverResult = await pool.query('SELECT balance FROM user_credits WHERE user_id = $1', [toUserId]);
      if (receiverResult.rows.length === 0) {
        await pool.query('INSERT INTO user_credits (user_id, balance) VALUES ($1, $2)', [toUserId, amount]);
      } else {
        await pool.query(
          'UPDATE user_credits SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
          [amount, toUserId]
        );
      }

      // Record transaction
      await pool.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type)
        VALUES ($1, $2, $3, 'transfer')
      `, [fromUserId, toUserId, amount]);

      await pool.query('COMMIT');

      console.log(`Credits transferred: ${amount} from user ${fromUserId} to ${toUsername}`);
      res.json({ 
        success: true, 
        message: `Successfully transferred ${amount} credits to ${toUsername}` 
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error transferring credits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// XP Management Endpoints
app.get('/api/user/exp', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query('SELECT exp, level FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const currentExp = user.exp || 0;
    const currentLevel = user.level || 1;
    const expPerLevel = 1000;
    const expForCurrentLevel = (currentLevel - 1) * expPerLevel;
    const expForNextLevel = currentLevel * expPerLevel;
    const expProgress = currentExp - expForCurrentLevel;
    const expNeeded = expForNextLevel - currentExp;

    res.json({
      currentExp: currentExp,
      currentLevel: currentLevel,
      expProgress: expProgress,
      expNeeded: expNeeded,
      expForNextLevel: expPerLevel,
      totalExpForNextLevel: expForNextLevel
    });
  } catch (error) {
    console.error('Error fetching user EXP:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/user/exp-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT activity_type, exp_gained, new_exp, new_level, created_at
      FROM user_exp_history 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 50
    `, [userId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching EXP history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add API endpoint for friends (to avoid 404)
app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    console.log('=== GET FRIENDS REQUEST (API) ===');
    console.log('Headers:', req.headers);
    console.log('User ID:', req.user.id);

    // Get friends from database
    const result = await pool.query(`
      SELECT u.id, u.username, u.avatar, u.verified, u.role, u.exp, u.level
      FROM users u
      JOIN user_follows uf ON u.id = uf.following_id
      WHERE uf.follower_id = $1
      ORDER BY u.username
    `, [req.user.id]);

    const friends = result.rows.map(user => ({
      id: user.id.toString(),
      name: user.username,
      username: user.username,
      status: 'online', // TODO: implement real status
      lastSeen: 'Active now', // TODO: implement real last seen
      avatar: user.avatar || user.username.charAt(0).toUpperCase(),
      level: user.level || 1,
      verified: user.verified,
      role: user.role
    }));

    res.json(friends);
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add API endpoint for feed posts (to avoid 404)
app.get('/api/feed/posts', async (req, res) => {
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
      let avatarUrl = row.avatar;
      if (avatarUrl && avatarUrl.startsWith('/api/')) {
        // Extract avatar ID from the URL
        const avatarId = avatarUrl.split('/').pop();
        avatarUrl = `${req.protocol}://${req.get('host')}/api/users/avatar/${avatarId}`;
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
        mediaFiles: row.media_files || []
      };
    });

    res.json(postsWithComments);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mentor endpoints without /api prefix
app.get('/mentor/merchants', authenticateToken, async (req, res) => {
  try {
    console.log('=== GET MENTOR MERCHANTS REQUEST (no /api) ===');
    console.log('User ID:', req.user.id);
    console.log('User Role:', req.user.role);

    // Check if user is mentor or admin
    if (req.user.role !== 'mentor' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Mentor role required.' });
    }

    // Get all merchant promotions
    const result = await pool.query(`
      SELECT 
        mp.*,
        u.username,
        promoted_by_user.username as promoted_by_username
      FROM merchant_promotions mp
      JOIN users u ON mp.user_id = u.id
      JOIN users promoted_by_user ON mp.promoted_by = promoted_by_user.id
      ORDER BY mp.promoted_at DESC
    `);

    const merchants = result.rows.map(row => ({
      id: row.id.toString(),
      username: row.username,
      promoted_by: row.promoted_by_username,
      promoted_at: row.promoted_at,
      expires_at: row.expires_at,
      status: row.status
    }));

    res.json({ merchants });
  } catch (error) {
    console.error('Error fetching merchants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/mentor/add-merchant', authenticateToken, async (req, res) => {
  try {
    console.log('=== ADD MERCHANT REQUEST (no /api) ===');
    console.log('User ID:', req.user.id);
    console.log('User Role:', req.user.role);
    console.log('Request body:', req.body);

    // Check if user is mentor or admin
    if (req.user.role !== 'mentor' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Mentor role required.' });
    }

    const { username } = req.body;
    const mentorId = req.user.id;

    if (!username || typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Find target user
    const userResult = await pool.query('SELECT id, username, role FROM users WHERE username = $1', [username.trim()]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];

    // Check if user is already a merchant
    if (targetUser.role === 'merchant') {
      return res.status(400).json({ error: 'User is already a merchant' });
    }

    // Check if user has an active merchant promotion
    const existingPromotion = await pool.query(`
      SELECT * FROM merchant_promotions 
      WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
    `, [targetUser.id]);

    if (existingPromotion.rows.length > 0) {
      return res.status(400).json({ error: 'User already has an active merchant promotion' });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Calculate expiration date (1 month from now)
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 1);

      // Create merchant promotion record
      await pool.query(`
        INSERT INTO merchant_promotions (user_id, promoted_by, expires_at, status)
        VALUES ($1, $2, $3, 'active')
      `, [targetUser.id, mentorId, expiresAt]);

      // Update user role to merchant
      await pool.query('UPDATE users SET role = $1 WHERE id = $2', ['merchant', targetUser.id]);

      await pool.query('COMMIT');

      console.log(`User ${username} promoted to merchant by ${req.user.username}`);

      res.json({
        message: `User ${username} has been successfully promoted to merchant`,
        username: targetUser.username,
        expiresAt: expiresAt.toISOString()
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error adding merchant:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Auth endpoints without /api prefix
app.post('/auth/login', async (req, res) => {
  try {
    console.log('Login request received (no /api):', { username: req.body.username });

    const { username, password } = req.body;

    if (!username || !password) {
      console.log('Missing login credentials');
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await pool.query(
      'SELECT id, username, email, password, bio, phone, gender, birth_date, country, signature, avatar, level, verified, role FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      console.log('User not found:', username);
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('Invalid password for user:', username);
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    // Check for daily login reward
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const lastLogin = user.last_login ? new Date(user.last_login).toISOString().split('T')[0] : null;

    let dailyReward = null;
    if (lastLogin !== today) {
      try {
        // Check if user already got today's reward
        const todayReward = await pool.query(
          'SELECT * FROM daily_login_rewards WHERE user_id = $1 AND login_date = $2',
          [user.id, today]
        );

        if (todayReward.rows.length === 0) {
          // Calculate consecutive days
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = yesterday.toISOString().split('T')[0];

          const yesterdayReward = await pool.query(
            'SELECT consecutive_days FROM daily_login_rewards WHERE user_id = $1 AND login_date = $2',
            [user.id, yesterdayStr]
          );

          const consecutiveDays = yesterdayReward.rows.length > 0 ? yesterdayReward.rows[0].consecutive_days + 1 : 1;
          const baseReward = 50;
          const bonusReward = Math.min(consecutiveDays * 10, 200); // Max bonus 200
          const totalReward = baseReward + bonusReward;

          // Add daily login reward
          await pool.query(`
            INSERT INTO daily_login_rewards (user_id, login_date, exp_reward, consecutive_days)
            VALUES ($1, $2, $3, $4)
          `, [user.id, today, totalReward, consecutiveDays]);

          // Add EXP to user
          const expResult = await addUserEXP(user.id, totalReward, 'daily_login');

          dailyReward = {
            exp: totalReward,
            consecutiveDays: consecutiveDays,
            leveledUp: expResult?.leveledUp || false,
            newLevel: expResult?.newLevel || user.level || 1
          };
        }

        // Update last login timestamp and set status to online
        await pool.query(
          'UPDATE users SET last_login = CURRENT_TIMESTAMP, status = $1 WHERE id = $2',
          ['online', user.id]
        );
      } catch (error) {
        console.error('Error processing daily login reward:', error);
      }
    } else {
      // If logged in again on the same day, just ensure status is online if last_login is recent
      if (user.last_login && new Date(user.last_login) > new Date(Date.now() - 5 * 60 * 1000)) {
        await pool.query('UPDATE users SET status = $1 WHERE id = $2', ['online', user.id]);
      }
    }

    // Get updated user data with level and EXP
    const updatedUserResult = await pool.query(
      'SELECT id, username, email, bio, phone, avatar, verified, role, exp, level FROM users WHERE id = $1',
      [user.id]
    );
    const updatedUser = updatedUserResult.rows[0];

    // Mask sensitive data before sending response
    const maskedUser = maskSensitiveData({
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      bio: updatedUser.bio,
      phone: updatedUser.phone,
      avatar: updatedUser.avatar,
      verified: updatedUser.verified,
      role: updatedUser.role,
      exp: updatedUser.exp || 0,
      level: updatedUser.level || 1
    });

    console.log('Refreshed user data:', maskedUser);

    console.log('Login successful for user:', username);

    res.json({
      token,
      user: maskedUser,
      dailyReward: dailyReward
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Admin credit management endpoints
app.post('/api/admin/credits/add', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    console.log('=== ADMIN ADD CREDITS REQUEST ===');
    console.log('User ID:', req.user.id);
    console.log('User Role:', req.user.role);

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { username, amount, reason } = req.body;

    if (!username || !amount) {
      return res.status(400).json({ error: 'Username and amount are required' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    // Find target user
    const userResult = await client.query('SELECT id, username FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];

    await client.query('BEGIN');

    try {
      // Check if user already has credits record
      const creditsResult = await client.query('SELECT balance FROM user_credits WHERE user_id = $1', [targetUser.id]);

      if (creditsResult.rows.length === 0) {
        // Create new credits record with only required fields
        await client.query(`
          INSERT INTO user_credits (user_id, balance, created_at, updated_at) 
          VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `, [targetUser.id, amount]);
      } else {
        // Update existing balance
        await client.query(`
          UPDATE user_credits 
          SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP 
          WHERE user_id = $2
        `, [amount, targetUser.id]);
      }

      // Record admin transaction
      await client.query(`
        INSERT INTO credit_transactions (to_user_id, amount, type, created_at)
        VALUES ($1, $2, 'admin_add', CURRENT_TIMESTAMP)
      `, [targetUser.id, amount]);

      await client.query('COMMIT');

      console.log(`Admin added ${amount} credits to user ${username}`);
      res.json({ 
        success: true, 
        message: `Successfully added ${amount} credits to ${username}`,
        reason: reason || 'Admin credit addition'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Transaction error:', error);

      // Check if it's a constraint error
      if (error.code === '23514') {
        return res.status(400).json({ 
          error: 'Database constraint violation. Please contact system administrator.',
          details: 'Legacy constraint issue detected'
        });
      }

      throw error;
    }

  } catch (error) {
    console.error('Error adding admin credits:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  } finally {
    client.release();
  }
});

app.get('/api/admin/users/history/:userId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { userId } = req.params;

    const result = await pool.query(`
      SELECT 
        ct.*,
        CASE 
          WHEN ct.from_user_id IS NULL THEN 'admin_add'
          WHEN ct.from_user_id = $1 THEN 'send'
          WHEN ct.to_user_id = $1 THEN 'receive'
        END as transaction_type,
        CASE 
          WHEN ct.from_user_id = $1 THEN (SELECT username FROM users WHERE id = ct.to_user_id)
          WHEN ct.to_user_id = $1 THEN (SELECT username FROM users WHERE id = ct.from_user_id)
          ELSE 'Admin'
        END as other_party
      FROM credit_transactions ct
      WHERE ct.from_user_id = $1 OR ct.to_user_id = $1
      ORDER BY ct.created_at DESC
      LIMIT 50
    `, [userId]);

    const transactions = result.rows.map(row => ({
      id: row.id,
      amount: row.amount,
      type: row.transaction_type,
      otherParty: row.other_party,
      createdAt: row.created_at
    }));

    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching credit history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin user management endpoints
app.get('/api/admin/users/search', authenticateToken, async (req, res) => {
  try {
    console.log('=== ADMIN USER SEARCH REQUEST ===');
    console.log('User ID:', req.user.id);
    console.log('User Role:', req.user.role);

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const { username } = req.query;

    if (!username || typeof username !== 'string' || username.trim().length < 2) {
      return res.status(400).json({ error: 'Username must be at least 2 characters' });
    }

    const result = await pool.query(`
      SELECT id, username, role, email, verified, created_at
      FROM users 
      WHERE username ILIKE $1 
      ORDER BY username ASC 
      LIMIT 20
    `, [`%${username.trim()}%`]);

    const users = result.rows.map(row => ({
      id: row.id.toString(),
      username: row.username,
      role: row.role,
      email: row.email,
      verified: row.verified
    }));

    res.json({ users });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/admin/users/promote', authenticateToken, async (req, res) => {
  try {
    console.log('=== ADMIN USER PROMOTION REQUEST ===');
    console.log('User ID:', req.user.id);
    console.log('User Role:', req.user.role);
    console.log('Request body:', req.body);

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const { userId, newRole } = req.body;

    if (!userId || !newRole) {
      return res.status(400).json({ error: 'userId and newRole are required' });
    }

    if (!['admin', 'mentor'].includes(newRole)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin or mentor' });
    }

    // Get target user
    const userResult = await pool.query('SELECT id, username, role FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Update user role
      await pool.query('UPDATE users SET role = $1 WHERE id = $2', [newRole, userId]);

      // If promoting to mentor, add expiration record
      if (newRole === 'mentor') {
        // Remove any existing mentor promotion record
        await pool.query('DELETE FROM mentor_promotions WHERE user_id = $1', [userId]);

        // Calculate expiration date (1 month from now)
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        // Create new mentor promotion record
        await pool.query(`
          INSERT INTO mentor_promotions (user_id, promoted_by, expires_at, status)
          VALUES ($1, $2, $3, 'active')
        `, [userId, req.user.id, expiresAt]);
      }

      await pool.query('COMMIT');

      console.log(`User ${targetUser.username} promoted to ${newRole} by ${req.user.username}`);

      res.json({
        message: `User ${targetUser.username} has been successfully promoted to ${newRole}${newRole === 'mentor' ? ' (expires in 1 month)' : ''}`,
        username: targetUser.username,
        newRole: newRole
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error promoting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cleanup expired tokens periodically
const cleanupExpiredTokens = async () => {
  try {
    const result = await pool.query('DELETE FROM tokens WHERE expires_at < NOW()');
    console.log(`Cleaned up ${result.rowCount} expired tokens`);
  } catch (error) {
    console.error('Error cleaning up expired tokens:', error);
  }
};

// Cleanup expired mentor roles
const cleanupExpiredMentors = async () => {
  try {
    // Find expired mentor promotions
    const expiredResult = await pool.query(`
      SELECT mp.user_id, u.username 
      FROM mentor_promotions mp
      JOIN users u ON mp.user_id = u.id
      WHERE mp.expires_at < NOW() AND mp.status = 'active' AND u.role = 'mentor'
    `);

    if (expiredResult.rows.length > 0) {
      console.log(`Found ${expiredResult.rows.length} expired mentor roles to cleanup`);

      // Start transaction
      await pool.query('BEGIN');

      try {
        // Update expired mentor promotions status
        await pool.query(`
          UPDATE mentor_promotions 
          SET status = 'expired' 
          WHERE expires_at < NOW() AND status = 'active'
        `);

        // Demote users back to regular user role
        await pool.query(`
          UPDATE users 
          SET role = 'user' 
          WHERE id IN (
            SELECT mp.user_id 
            FROM mentor_promotions mp
            WHERE mp.expires_at < NOW() AND mp.status = 'expired'
          ) AND role = 'mentor'
        `);

        await pool.query('COMMIT');

        const expiredUsernames = expiredResult.rows.map(row => row.username).join(', ');
        console.log(`Demoted expired mentors: ${expiredUsernames}`);

      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    }
  } catch (error) {
    console.error('Error cleaning up expired mentor roles:', error);
  }
};

// Cleanup expired headwear items
const cleanupExpiredHeadwear = async () => {
  try {
    // Find expired headwear items
    const expiredResult = await pool.query(`
      SELECT uh.id, uh.user_id, u.username, hi.name 
      FROM user_headwear uh
      JOIN users u ON uh.user_id = u.id
      JOIN headwear_items hi ON uh.headwear_id = hi.id
      WHERE uh.expires_at < NOW() AND uh.is_active = true
    `);

    if (expiredResult.rows.length > 0) {
      console.log(`Found ${expiredResult.rows.length} expired headwear items to cleanup`);

      // Start transaction
      await pool.query('BEGIN');

      try {
        // Mark expired headwear as inactive
        await pool.query(`
          UPDATE user_headwear 
          SET is_active = false 
          WHERE expires_at < NOW() AND is_active = true
        `);

        // Remove avatar frame from users with expired headwear
        const expiredUserIds = [...new Set(expiredResult.rows.map(row => row.user_id))];
        for (const userId of expiredUserIds) {
          // Check if user has any active headwear left
          const activeHeadwear = await pool.query(`
            SELECT COUNT(*) FROM user_headwear 
            WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
          `, [userId]);

          // If no active headwear, remove avatar frame
          if (parseInt(activeHeadwear.rows[0].count) === 0) {
            await pool.query(`
              UPDATE users 
              SET avatar_frame = NULL 
              WHERE id = $1
            `, [userId]);
          }
        }

        await pool.query('COMMIT');

        const expiredItems = expiredResult.rows.map(row => 
          `${row.name} (User: ${row.username})`
        ).join(', ');
        console.log(`Removed expired headwear: ${expiredItems}`);

      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    }
  } catch (error) {
    console.error('Error cleaning up expired headwear:', error);
  }
};

// Cleanup expired frame items
const cleanupExpiredFrames = async () => {
  try {
    // Find expired frame items
    const expiredResult = await pool.query(`
      SELECT uf.id, uf.user_id, u.username, u.avatar_frame, fi.name, fi.image 
      FROM user_frames uf
      JOIN users u ON uf.user_id = u.id
      JOIN frame_items fi ON uf.frame_id = fi.id
      WHERE uf.expires_at < NOW() AND uf.is_active = true
    `);

    if (expiredResult.rows.length > 0) {
      console.log(`Found ${expiredResult.rows.length} expired frame items to cleanup`);

      // Start transaction
      await pool.query('BEGIN');

      try {
        // Mark expired frames as inactive
        await pool.query(`
          UPDATE user_frames 
          SET is_active = false 
          WHERE expires_at < NOW() AND is_active = true
        `);

        // Remove avatar frame from users with expired frames
        for (const row of expiredResult.rows) {
          // Check if the user's current avatar_frame matches the expired frame
          if (row.avatar_frame === row.image) {
            // Check if user has any other active frames
            const activeFrames = await pool.query(`
              SELECT COUNT(*) FROM user_frames 
              WHERE user_id = $1 AND is_active = true AND expires_at > NOW()
            `, [row.user_id]);

            // If no active frames, remove avatar_frame
            if (parseInt(activeFrames.rows[0].count) === 0) {
              await pool.query(`
                UPDATE users 
                SET avatar_frame = NULL 
                WHERE id = $1
              `, [row.user_id]);
              console.log(`Removed avatar_frame from user ${row.username} (expired frame: ${row.name})`);
            }
          }
        }

        await pool.query('COMMIT');

        const expiredItems = expiredResult.rows.map(row => 
          `${row.name} (User: ${row.username})`
        ).join(', ');
        console.log(`Deactivated expired frames: ${expiredItems}`);

      } catch (error) {
        await pool.query('ROLLBACK');
        throw error;
      }
    }
  } catch (error) {
    console.error('Error cleaning up expired frames:', error);
  }
};

// Run cleanup every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);
// Run mentor cleanup every 6 hours
setInterval(cleanupExpiredMentors, 6 * 60 * 60 * 1000);
// Run headwear cleanup every hour
setInterval(cleanupExpiredHeadwear, 60 * 60 * 1000);
// Run frame cleanup every hour
setInterval(cleanupExpiredFrames, 60 * 60 * 1000);

// Add root endpoint for web preview
app.get('/', (req, res) => {
  res.json({ 
    message: 'ChatMe API Server is running!',
    status: 'active',
    timestamp: new Date().toISOString(),
    port: PORT,
    endpoints: [
      'GET /api/test - Test endpoint'

    ]
  });
});

// Add test endpoint for external connectivity
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'success', 
    message: 'ChatMe backend is running and accessible!',
    timestamp: new Date().toISOString(),
    port: PORT 
  });
});

// Add rankings endpoints for games, wealth, and gifts
app.get('/api/rankings/games', async (req, res) => {
  try {
    console.log('Fetching games rankings...');

    // Query users with game scores, ordered by score
    const query = `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY COALESCE(game_score, 0) DESC) as rank,
        id::text,
        username,
        avatar,
        level,
        verified,
        COALESCE(game_score, 0) as score
      FROM users 
      WHERE COALESCE(game_score, 0) > 0
      ORDER BY COALESCE(game_score, 0) DESC
      LIMIT 50
    `;

    const result = await pool.query(query);

    const rankings = result.rows.map(row => {
      let avatarUrl = null;
      if (row.avatar) {
        if (row.avatar.startsWith('/api/')) {
          // Extract avatar ID from the URL
          const avatarId = row.avatar.split('/').pop();
          avatarUrl = `${req.protocol}://${req.get('host')}/api/users/avatar/${avatarId}`;
        } else if (row.avatar.startsWith('http')) {
          avatarUrl = row.avatar;
        } else {
          avatarUrl = `${req.protocol}://${req.get('host')}/api/users/avatar/${row.avatar}`;
        }
      }

      return {
        rank: row.rank,
        id: row.id,
        username: row.username,
        avatar: avatarUrl,
        level: row.level || 1,
        verified: row.verified || false,
        score: row.score
      };
    });

    console.log(`Returning ${rankings.length} game rankings`);
    res.json(rankings);
  } catch (error) {
    console.error('Error fetching game rankings:', error);
    res.status(500).json({ error: 'Failed to fetch game rankings' });
  }
});

app.get('/api/rankings/wealth', async (req, res) => {
  try {
    console.log('Fetching wealth rankings...');

    // Query users with total spending from gifts and games, ordered by total spending
    const query = `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY total_spending DESC) as rank,
        id::text,
        username,
        avatar,
        level,
        verified,
        COALESCE(total_spending, 0) as credits
      FROM users 
      LEFT JOIN (
        SELECT 
          from_user_id as user_id,
          SUM(amount) as total_spending
        FROM credit_transactions 
        WHERE from_user_id IS NOT NULL
        GROUP BY from_user_id
      ) spending ON u.id = spending.user_id
      WHERE COALESCE(total_spending, 0) > 0
      ORDER BY total_spending DESC
      LIMIT 50
    `;

    const result = await pool.query(query);

    const rankings = result.rows.map(row => {
      let avatarUrl = null;
      if (row.avatar) {
        if (row.avatar.startsWith('/api/users/avatar/')) {
          // Extract avatar ID from the URL
          const avatarId = row.avatar.split('/').pop();
          avatarUrl = `${req.protocol}://${req.get('host')}/api/users/avatar/${avatarId}`;
        } else if (row.avatar.startsWith('http')) {
          avatarUrl = row.avatar;
        } else {
          avatarUrl = `${req.protocol}://${req.get('host')}/api/users/avatar/${row.avatar}`;
        }
      }

      return {
        rank: row.rank,
        id: row.id,
        username: row.username,
        avatar: avatarUrl,
        level: row.level || 1,
        verified: row.verified || false,
        credits: row.credits || 0
      };
    });

    console.log(`Returning ${rankings.length} wealth rankings`);
    res.json(rankings);
  } catch (error) {
    console.error('Error fetching wealth rankings:', error);
    res.status(500).json({ error: 'Failed to fetch wealth rankings' });
  }
});

app.get('/api/rankings/gifts', async (req, res) => {
  try {
    console.log('Fetching gifts rankings...');

    // Query users with total gifts received, ordered by total gifts
    const query = `
      SELECT 
        ROW_NUMBER() OVER (ORDER BY COALESCE(total_gifts_received, 0) DESC) as rank,
        id::text,
        username,
        avatar,
        level,
        verified,
        COALESCE(total_gifts_received, 0) as totalGifts
      FROM users 
      WHERE COALESCE(total_gifts_received, 0) > 0
      ORDER BY COALESCE(total_gifts_received, 0) DESC
      LIMIT 50
    `;

    const result = await pool.query(query);

    const rankings = result.rows.map(row => {
      let avatarUrl = null;
      if (row.avatar) {
        if (row.avatar.startsWith('/api/users/avatar/')) {
          // Extract avatar ID from the URL
          const avatarId = row.avatar.split('/').pop();
          avatarUrl = `${req.protocol}://${req.get('host')}/api/users/avatar/${avatarId}`;
        } else if (row.avatar.startsWith('http')) {
          avatarUrl = row.avatar;
        } else {
          avatarUrl = `${req.protocol}://${req.get('host')}/api/users/avatar/${row.avatar}`;
        }
      }

      return {
        rank: row.rank,
        id: row.id,
        username: row.username,
        avatar: avatarUrl,
        level: row.level || 1,
        verified: row.verified || false,
        totalGifts: row.totalgifts
      };
    });

    console.log(`Returning ${rankings.length} gift rankings`);
    res.json(rankings);
  } catch (error) {
    console.error('Error fetching gift rankings:', error);
    res.status(500).json({ error: 'Failed to fetch gift rankings' });
  }
});

// Run initial cleanup on server start (after all tables are initialized)
setTimeout(() => {
  cleanupExpiredMentors();
  cleanupExpiredHeadwear();
  cleanupExpiredFrames();
}, 2000); // Wait 2 seconds for tables to be fully initialized


server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Server accessible at: http://0.0.0.0:${PORT}`);
  console.log(`📋 API Endpoints:`);
  console.log(`   POST /api/auth/register - User registration`);
  console.log(`   POST /api/auth/login - User login`);
  console.log(`   POST /api/auth/forgot-password - Request password reset`);
  console.log(`   GET  /api/verify-email - Verify email address`);
     console.log(`   GET  /api/rooms - Get chat rooms`);
  console.log(`   POST /api/chat/private - Create private chat`);
  console.log(`   GET  /api/chat/private/:chatId/messages - Get private chat messages`);
  console.log(`   GET  /api/messages/:roomId - Get messages for a room (legacy)`);
  console.log(`   GET  /api/feed/posts - Get feed posts`);
  console.log(`   POST /api/feed/posts - Create a new post`);
  console.log(`   POST /api/feed/posts/with-media - Create a post with media`);
  console.log(`   POST /api/feed/upload - Upload media for posts`);
  console.log(`   GET  /api/friends - Get friends list`);
  console.log(`   GET  /api/users/search?query=<username> - Search for users`);
  console.log(`   GET  /api/support/tickets - Get support tickets`);
  console.log(`   POST /api/users/:userId/follow - Follow/Unfollow a user`);
  console.log(`   GET  /api/users/:userId/profile - Get user profile details`);
  console.log(`   GET  /api/users/:userId/followers - Get user followers`);
  console.log(`   GET  /api/users/:userId/following - Get users being followed`);
  console.log(`   POST /api/users/:userId/avatar - Upload user avatar`);
  console.log(`   GET  /api/users/:userId/album - Get user photo album`);
  console.log(`   POST /users/:userId/album - Upload photo to user album`);
  console.log(`   GET  /api/users/:userId/gifts - Get user gifts received`);
  console.log(`   GET  /api/credits/balance - Get user credits balance`);
  console.log(`   GET  /api/credits/history - Get user credits transaction history`);
  console.log(`   POST /api/credits/transfer - Transfer credits to another user`);
  console.log(`   POST /mentor/add-merchant - Promote user to merchant`);
  console.log(`   GET  /mentor/merchants - Get list of merchant promotions`);
  console.log(`   DELETE /api/messages/:messageId - Delete a chat message (admin only)`);
  console.log(`   GET  /api/lowcard/status/:roomId - Get LowCard bot status for room`);
  console.log(`   POST /api/lowcard/command - Send command to LowCard bot`);
  console.log(`   POST /api/lowcard/init/:roomId - Initialize LowCard bot in room`);
  console.log(`   POST /api/lowcard/shutdown/:roomId - Shutdown LowCard bot in room`);
  console.log(`   GET  /api/lowcard/games - Get all active LowCard games`);
  console.log(`   GET  /api/support/faq/categories - Get FAQ categories`);
  console.log(`   GET  /api/support/faq/:category - Get FAQ items by category`);
  console.log(`   GET  /api/support/live-chat/status - Get live chat availability status`);
  console.log(`   POST /api/support/live-chat/start - Start a live chat session`);
  console.log(`   POST /api/gift/purchase - Purchase gift with 70% system cut, 30% user withdraw`);
  console.log(`   POST /api/gifts/check-balance - Check if user can afford gift`);
  console.log(`   POST /api/gifts/purchase - Legacy gift purchase endpoint`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    console.log(`🔧 Trying to find and kill existing processes...`);

    // Try to kill existing processes
    const { exec } = require('child_process');
    exec(`lsof -ti:${PORT} | xargs kill -9`, (killErr) => {
      if (killErr) {
        console.error('Could not kill existing processes:', killErr.message);
        console.log('Please manually stop other processes using port', PORT);
        process.exit(1);
      } else {
        console.log('✅ Killed existing processes, restarting...');
        setTimeout(() => {
          server.listen(PORT, '0.0.0.0');
        }, 1000);
      }
    });
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});