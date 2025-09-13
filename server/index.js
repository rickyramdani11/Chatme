const express = require('express');
const http = require('http');
// const socketIo = require('socket.io'); // Removed - handled by gateway
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const fs = require('fs');

// Import LowCard bot using CommonJS require
let lowCardBot = null;
try {
  // Load JavaScript version to resolve TypeScript syntax error
  lowCardBot = require('./games/lowcard.js');
  console.log('LowCard bot loaded successfully from JavaScript');
} catch (error) {
  console.error('Failed to load LowCard bot from JavaScript:', error);
  console.error('Error details:', error.message);
}

const app = express();
const server = http.createServer(app);

// Socket.IO removed - now handled by dedicated gateway server

const PORT = process.env.PORT || 5000;
const API_BASE_URL = process.env.API_BASE_URL || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${PORT}`); // For constructing image URLs

// Multer storage configuration for emojis
const storageEmoji = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/emojis/');
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const uploadEmoji = multer({ storage: storageEmoji });

// Multer storage configuration for gifts
const storageGift = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/gifts/');
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const uploadGift = multer({ storage: storageGift });

// Multer storage configuration for generic uploads (e.g., media for posts)
const storageUpload = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/media/');
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

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Successfully connected to PostgreSQL database');
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

// In-memory database for non-critical data (posts will be moved to DB later)
let posts = [];

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

    return result.rows[0];
  } catch (error) {
    console.error('Error saving chat message:', error);
    return null;
  }
};

// Database initialization - create tables if they don't exist
const initDatabase = async () => {
  try {
    // Create users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        bio TEXT DEFAULT '',
        phone VARCHAR(20) DEFAULT '',
        avatar VARCHAR(255) DEFAULT '',
        verified BOOLEAN DEFAULT false,
        role VARCHAR(20) DEFAULT 'user',
        exp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        credits INTEGER DEFAULT 0,
        pin VARCHAR(6) DEFAULT '',
        pin_enabled BOOLEAN DEFAULT false,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        game_score INTEGER DEFAULT 0,
        total_gifts_received INTEGER DEFAULT 0
      )
    `);

    // Add ranking columns if they don't exist
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS game_score INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS total_gifts_received INTEGER DEFAULT 0
      `);
    } catch (error) {
      // Columns might already exist, ignore error
      console.log('Ranking columns already exist or error adding them:', error.message);
    }


    // Add role column if it doesn't exist (for existing databases)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
          ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';
        END IF;
      END $$;
    `);

    // Add pin column if it doesn't exist (for existing databases)
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='pin') THEN
          ALTER TABLE users ADD COLUMN pin VARCHAR(6) DEFAULT '123456';
        END IF;
      END $$;
    `);

    // Add last_login, exp, and level columns if they don't exist
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_login') THEN
          ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='exp') THEN
          ALTER TABLE users ADD COLUMN exp INTEGER DEFAULT 0;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='level') THEN
          ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1;
        END IF;
      END $$;
    `);


    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        managed_by VARCHAR(50),
        type VARCHAR(20) DEFAULT 'room',
        members INTEGER DEFAULT 0,
        max_members INTEGER DEFAULT 100,
        created_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        username VARCHAR(50) NOT NULL,
        content TEXT,
        media_files JSONB DEFAULT '[]',
        likes INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS post_comments (
        id BIGSERIAL PRIMARY KEY,
        post_id INTEGER REFERENCES posts(id),
        user_id INTEGER REFERENCES users(id),
        username VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS privacy_settings (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) UNIQUE,
        profile_visibility VARCHAR(20) DEFAULT 'public',
        privacy_notifications BOOLEAN DEFAULT true,
        location_sharing BOOLEAN DEFAULT false,
        biometric_auth BOOLEAN DEFAULT false,
        two_factor_auth BOOLEAN DEFAULT true,
        active_sessions BOOLEAN DEFAULT true,
        data_download BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_activity_logs (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        activity_type VARCHAR(50) NOT NULL,
        description TEXT,
        ip_address INET,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_album (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        filename VARCHAR(255) NOT NULL,
        file_data TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_gifts (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        gift_type VARCHAR(50) NOT NULL,
        given_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_follows (
        id BIGSERIAL PRIMARY KEY,
        follower_id INTEGER REFERENCES users(id),
        following_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, following_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_achievements (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        achievement_type VARCHAR(50) NOT NULL,
        count INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, achievement_type)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGSERIAL PRIMARY KEY,
        room_id VARCHAR(100) NOT NULL,
        user_id INTEGER REFERENCES users(id),
        username VARCHAR(50) NOT NULL,
        content TEXT NOT NULL,
        media_data TEXT,
        message_type VARCHAR(20) DEFAULT 'message',
        user_role VARCHAR(20) DEFAULT 'user',
        user_level INTEGER DEFAULT 1,
        is_private BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(room_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
    `);

    // Support tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id BIGSERIAL PRIMARY KEY,
        ticket_id VARCHAR(50) UNIQUE NOT NULL,
        user_id INTEGER REFERENCES users(id),
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        category VARCHAR(50) NOT NULL,
        priority VARCHAR(20) DEFAULT 'medium',
        status VARCHAR(20) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS support_responses (
        id BIGSERIAL PRIMARY KEY,
        ticket_id VARCHAR(50) REFERENCES support_tickets(ticket_id),
        user_id INTEGER REFERENCES users(id),
        message TEXT NOT NULL,
        response_type VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_feedback (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        rating INTEGER CHECK (rating >= 1 AND rating <= 5),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create user_credits table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_credits (
        user_id INTEGER PRIMARY KEY,
        balance INTEGER DEFAULT 0 CHECK (balance >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create credit_transactions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id SERIAL PRIMARY KEY,
        from_user_id INTEGER,
        to_user_id INTEGER,
        amount INTEGER NOT NULL,
        type VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_user_id) REFERENCES users(id),
        FOREIGN KEY (to_user_id) REFERENCES users(id)
      )
    `);

    // Create merchant_promotions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS merchant_promotions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        promoted_by INTEGER NOT NULL,
        promoted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (promoted_by) REFERENCES users(id)
      )
    `);

    // Create notifications table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        from_user_id INTEGER REFERENCES users(id),
        from_username VARCHAR(50),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create private chats tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS private_chats (
        id VARCHAR(255) PRIMARY KEY,
        created_by VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS private_chat_participants (
        id BIGSERIAL PRIMARY KEY,
        chat_id VARCHAR(255) REFERENCES private_chats(id) ON DELETE CASCADE,
        username VARCHAR(50) NOT NULL,
        UNIQUE(chat_id, username)
      )
    `);

    // Create daily_login_rewards table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_login_rewards (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        login_date DATE NOT NULL,
        exp_reward INTEGER NOT NULL,
        consecutive_days INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, login_date)
      )
    `);

    // Create custom_emojis table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_emojis (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        emoji VARCHAR(255) NOT NULL,
        category VARCHAR(50) DEFAULT 'general',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Update existing emoji column if it exists with smaller size
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='custom_emojis' AND column_name='emoji' 
                   AND character_maximum_length = 10) THEN
          ALTER TABLE custom_emojis ALTER COLUMN emoji TYPE VARCHAR(255);
        END IF;
      END $$;
    `);

    // Create custom_gifts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS custom_gifts (
        id BIGSERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        icon VARCHAR(100) NOT NULL,
        image VARCHAR(500),
        animation TEXT,
        price INTEGER NOT NULL DEFAULT 100 CHECK (price > 0),
        type VARCHAR(20) DEFAULT 'static',
        category VARCHAR(100) DEFAULT 'popular',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        type VARCHAR(20) DEFAULT 'text',
        file_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create password_resets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id)
      );
    `);

    // Create emojis table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS emojis (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        filename VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create friendships table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, friend_id)
      )
    `);

    // Create user_exp_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_exp_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        activity_type VARCHAR(50) NOT NULL,
        exp_gained INTEGER NOT NULL,
        new_exp INTEGER NOT NULL,
        new_level INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create mentor_promotions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mentor_promotions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        promoted_by INTEGER NOT NULL,
        promoted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (promoted_by) REFERENCES users(id)
      )
    `);

    // Create room_banned_users table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS room_banned_users (
        id SERIAL PRIMARY KEY,
        room_id VARCHAR(50) NOT NULL,
        banned_user_id VARCHAR(50),
        banned_username VARCHAR(255) NOT NULL,
        banned_by_id VARCHAR(50) NOT NULL,
        banned_by_username VARCHAR(255) NOT NULL,
        ban_reason TEXT,
        banned_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        is_active BOOLEAN DEFAULT true,
        UNIQUE(room_id, banned_username)
      )
    `);

    // Create banned_devices_ips table for device and IP bans
    await pool.query(`
      CREATE TABLE IF NOT EXISTS banned_devices_ips (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50),
        ban_type VARCHAR(10) NOT NULL CHECK (ban_type IN ('device', 'ip')),
        target_value VARCHAR(255) NOT NULL,
        ban_reason TEXT,
        banned_by_id VARCHAR(50) NOT NULL,
        banned_by_username VARCHAR(255) NOT NULL,
        banned_at TIMESTAMP DEFAULT NOW(),
        unbanned_at TIMESTAMP,
        unbanned_by_id VARCHAR(50),
        unbanned_by_username VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        UNIQUE(target_value, ban_type)
      )
    `);

    console.log('✅ Room security and ban management tables initialized successfully');

    // Create gift_earnings table for tracking user earnings from gifts (30% of gift value)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gift_earnings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        gift_id INTEGER,
        gift_name VARCHAR(255),
        gift_price INTEGER NOT NULL CHECK (gift_price > 0),
        user_share INTEGER NOT NULL CHECK (user_share >= 0),
        system_share INTEGER NOT NULL CHECK (system_share >= 0),
        sender_user_id INTEGER,
        sender_username VARCHAR(100),
        room_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (sender_user_id) REFERENCES users(id)
      )
    `);

    // Create withdrawal_requests table for Xendit withdrawals
    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_requests (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        amount_usd DECIMAL(10,2) NOT NULL,
        withdrawal_method VARCHAR(20) NOT NULL CHECK (withdrawal_method IN ('bank', 'ewallet')),
        account_type VARCHAR(50),
        account_name VARCHAR(255),
        account_number VARCHAR(100),
        bank_code VARCHAR(10),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
        xendit_transaction_id VARCHAR(100),
        failure_reason TEXT,
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create user_gift_earnings_balance table to track withdrawable gift earnings balance
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_gift_earnings_balance (
        user_id INTEGER PRIMARY KEY,
        balance INTEGER DEFAULT 0 CHECK (balance >= 0),
        total_earned INTEGER DEFAULT 0 CHECK (total_earned >= 0),
        total_withdrawn INTEGER DEFAULT 0 CHECK (total_withdrawn >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create user_linked_accounts table for withdrawal account management
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_linked_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        account_id VARCHAR(50) NOT NULL,
        account_name VARCHAR(100) NOT NULL,
        account_number VARCHAR(100) NOT NULL,
        holder_name VARCHAR(255) NOT NULL,
        account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('bank', 'ewallet')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, account_id)
      )
    `);

    console.log('✅ Gift earnings and withdrawal tables initialized successfully');

    // Add CHECK constraints to existing tables if they don't exist
    try {
      await pool.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'custom_gifts_price_check') THEN
            ALTER TABLE custom_gifts ADD CONSTRAINT custom_gifts_price_check CHECK (price > 0);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_earnings_price_check') THEN
            ALTER TABLE gift_earnings ADD CONSTRAINT gift_earnings_price_check CHECK (gift_price > 0);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_earnings_shares_check') THEN
            ALTER TABLE gift_earnings ADD CONSTRAINT gift_earnings_shares_check CHECK (user_share >= 0 AND system_share >= 0);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_gift_earnings_balance_check') THEN
            ALTER TABLE user_gift_earnings_balance ADD CONSTRAINT user_gift_earnings_balance_check CHECK (balance >= 0 AND total_earned >= 0 AND total_withdrawn >= 0);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_credits_balance_check') THEN
            ALTER TABLE user_credits ADD CONSTRAINT user_credits_balance_check CHECK (balance >= 0);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gift_earnings_sum_check') THEN
            ALTER TABLE gift_earnings ADD CONSTRAINT gift_earnings_sum_check CHECK (user_share + system_share = gift_price);
          END IF;
        END $$;
      `);
      console.log('✅ Database constraints enforced successfully');
    } catch (error) {
      console.log('⚠️  Warning: Could not add some database constraints:', error.message);
    }

    // Add default admin user 'asu' if not exists
    try {
      const existingUser = await pool.query('SELECT id, role FROM users WHERE username = $1', ['asu']);
      if (existingUser.rows.length === 0) {
        const hashedPassword = await bcrypt.hash('123456', 10);
        const adminUser = await pool.query(`
          INSERT INTO users (username, email, password, role, verified, exp, level, last_login)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id, username, role, exp, level
        `, ['asu', 'asu@admin.com', hashedPassword, 'admin', true, 0, 1, new Date()]);

        // Initialize admin user with credits
        await pool.query(`
          INSERT INTO user_credits (user_id, balance)
          VALUES ($1, $2)
          ON CONFLICT (user_id) DO UPDATE SET balance = $2
        `, [adminUser.rows[0].id, 100000]);

        console.log('Admin user "asu" created successfully with 100,000 coins:', adminUser.rows[0]);
      } else {
        // Always ensure user has admin role and credentials on server start
        const userId = existingUser.rows[0].id;
        const currentRole = existingUser.rows[0].role;
        
        if (currentRole !== 'admin') {
          console.log(`Fixing user "asu" role from "${currentRole}" to "admin"`);
        }
        
        await pool.query('UPDATE users SET role = $1, verified = $2 WHERE username = $3', ['admin', true, 'asu']);

        // Check if user has credits, if not add them
        const creditsResult = await pool.query('SELECT balance FROM user_credits WHERE user_id = $1', [userId]);
        if (creditsResult.rows.length === 0) {
          await pool.query(`
            INSERT INTO user_credits (user_id, balance)
            VALUES ($1, $2)
          `, [userId, 100000]);
        }

        // Verify the role was set correctly
        const verifyResult = await pool.query('SELECT role FROM users WHERE username = $1', ['asu']);
        const finalRole = verifyResult.rows[0]?.role;
        console.log(`User "asu" role verified: ${finalRole} (should be admin)`);
        
        if (finalRole === 'admin') {
          console.log('✅ Admin user "asu" role successfully maintained');
        } else {
          console.error('❌ Failed to maintain admin role for user "asu"');
        }
      }
    } catch (adminError) {
      console.error('Error creating/updating admin user:', adminError);
    }
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

// Load rooms from database on startup
const loadRoomsFromDatabase = async () => {
  try {
    const result = await pool.query('SELECT * FROM rooms ORDER BY created_at ASC');

    // Clear in-memory rooms and load from database
    rooms.length = 0;

    result.rows.forEach(dbRoom => {
      rooms.push({
        id: dbRoom.id.toString(),
        name: dbRoom.name,
        description: dbRoom.description,
        managedBy: dbRoom.managed_by,
        type: dbRoom.type,
        members: dbRoom.members || 0,
        maxMembers: dbRoom.max_members,
        createdBy: dbRoom.created_by,
        createdAt: dbRoom.created_at
      });
    });

    // If no rooms in database, add default rooms
    if (rooms.length === 0) {
      const defaultRooms = [
        {
          name: 'General Chat',
          description: 'General Chat - Welcome to merchant official chatroom',
          managedBy: 'admin_user',
          type: 'room',
          members: 0,
          maxMembers: 100,
          createdBy: 'admin_user'
        },
        {
          name: 'Tech Talk',
          description: 'Tech Talk - Welcome to merchant official chatroom',
          managedBy: 'tech_admin',
          type: 'room',
          members: 0,
          maxMembers: 50,
          createdBy: 'tech_admin'
        },
        {
          name: 'Indonesia',
          description: 'Indonesia - Welcome to merchant official chatroom',
          managedBy: 'admin_user',
          type: 'room',
          members: 0,
          maxMembers: 80,
          createdBy: 'admin_user'
        }
      ];

      for (const roomData of defaultRooms) {
        const result = await pool.query(`
          INSERT INTO rooms (name, description, managed_by, type, members, max_members, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `, [roomData.name, roomData.description, roomData.managedBy, roomData.type, roomData.members, roomData.maxMembers, roomData.createdBy]);

        const dbRoom = result.rows[0];
        rooms.push({
          id: dbRoom.id.toString(),
          name: dbRoom.name,
          description: dbRoom.description,
          managedBy: dbRoom.managed_by,
          type: dbRoom.type,
          members: dbRoom.members,
          maxMembers: dbRoom.max_members,
          createdBy: dbRoom.created_by,
          createdAt: dbRoom.created_at
        });
      }
    }

    console.log(`Loaded ${rooms.length} rooms from database:`, rooms.map(r => `${r.name} (ID: ${r.id})`));
  } catch (error) {
    console.error('Error loading rooms from database:', error);
  }
};

// Initialize database on startup
initDatabase().then(() => {
  loadRoomsFromDatabase();

  // Ensure upload directories exist
  const uploadsDir = path.join(__dirname, 'uploads');
  const giftsDir = path.join(uploadsDir, 'gifts');
  const emojisDir = path.join(uploadsDir, 'emojis');
  const mediaDir = path.join(uploadsDir, 'media');

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  if (!fs.existsSync(giftsDir)) {
    fs.mkdirSync(giftsDir, { recursive: true });
  }
  if (!fs.existsSync(emojisDir)) {
    fs.mkdirSync(emojisDir, { recursive: true });
  }
  if (!fs.existsSync(mediaDir)) {
    fs.mkdirSync(mediaDir, { recursive: true });
  }

  console.log('Upload directories initialized');
});
// Rooms data - starts with initial rooms
const rooms = [
  {
    id: '1',
    name: 'General Chat',
    description: 'General Chat - Welcome to merchant official chatroom',
    managedBy: 'admin_user',
    type: 'room',
    members: 0,
    maxMembers: 100,
    createdBy: 'admin_user'
  },
  {
    id: '2',
    name: 'Tech Talk',
    description: 'Tech Talk - Welcome to merchant official chatroom',
    managedBy: 'tech_admin',
    type: 'room',
    members: 0,
    maxMembers: 50,
    createdBy: 'tech_admin'
  },
  {
    id: '3',
    name: 'Indonesia',
    description: 'Indonesia - Welcome to merchant official chatroom',
    managedBy: 'admin_user',
    type: 'room',
    members: 0,
    maxMembers: 80,
    createdBy: 'admin_user'
  }
];

// Initialize participant data structure
const roomParticipants = {}; // { roomId: [ { id, username, role, isOnline, joinedAt, lastSeen }, ... ], ... }

// Socket.IO handling removed - now handled by dedicated gateway server

// All Socket.IO connection handling moved to dedicated gateway server

// Function to generate room description
const generateRoomDescription = (roomName, creatorUsername) => {
  return `${roomName} - Welcome to merchant official chatroom. This room is managed by ${creatorUsername}`;
};

let verificationTokens = [];

// Email verification simulation (replace with real email service)
const sendVerificationEmail = (email, token) => {
  console.log(`=== EMAIL VERIFICATION ===`);
  console.log(`To: ${email}`);
  console.log(`Subject: Verify Your ChatMe Account`);
  console.log(`Verification Link: http://0.0.0.0:5000/api/verify-email?token=${token}`);
  console.log(`========================`);
  return true;
};

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('=== AUTH TOKEN MIDDLEWARE ===');
  console.log('Auth header:', authHeader ? 'Present' : 'Missing');
  console.log('Token:', token ? `Present (${token.substring(0, 20)}...)` : 'Missing');

  if (token == null) {
    console.log('No token provided');
    return res.status(401).json({ error: 'No token provided' });
  }

  // Validate token format
  if (typeof token !== 'string' || token.split('.').length !== 3) {
    console.log('Invalid token format');
    return res.status(403).json({ error: 'Invalid token format' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      console.log('Token verification failed:', err.message);
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ error: 'Token expired' });
      } else if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({ error: 'Invalid token' });
      }
      return res.status(403).json({ error: 'Token verification failed' });
    }

    console.log('Token verified for user ID:', decoded.userId);

    try {
      // Try to select with pin column first, fallback without pin if it doesn't exist
      let userResult;
      try {
        userResult = await pool.query('SELECT id, username, email, verified, pin, role, exp, level FROM users WHERE id = $1', [decoded.userId]);
      } catch (pinError) {
        if (pinError.code === '42703') { // Column doesn't exist
          console.log('Pin column does not exist, querying without it');
          userResult = await pool.query('SELECT id, username, email, verified, role, exp, level FROM users WHERE id = $1', [decoded.userId]);
        } else {
          throw pinError;
        }
      }

      if (userResult.rows.length === 0) {
        console.log('User not found for token:', decoded.userId);
        return res.status(403).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      console.log('User authenticated:', user.username, 'Role:', user.role);

      req.user = user; // Attach user info to request
      req.user.userId = decoded.userId; // Add userId to req.user for credit endpoints
      next(); // proceed to the next middleware or route handler
    } catch (dbError) {
      console.error('Database error during token authentication:', dbError);
      res.status(500).json({ error: 'Database error during authentication' });
    }
  });
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

    // Define EXP thresholds for leveling up (example)
    const expPerLevel = 1000; // 1000 EXP to reach next level

    const newExp = currentExp + expAmount;
    let newLevel = currentLevel;
    let leveledUp = false;

    // Calculate new level
    if (newExp >= currentLevel * expPerLevel) {
      newLevel = Math.floor(newExp / expPerLevel) || 1;
      leveledUp = true;
    }

    // Update user EXP and level
    await pool.query(
      'UPDATE users SET exp = $1, level = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [newExp, newLevel, userId]
    );

    console.log(`User ${userId} gained ${expAmount} EXP from ${activityType}. New EXP: ${newExp}, New Level: ${newLevel}`);

    // Optionally, record EXP gain in a separate table for history
    await pool.query(`
      INSERT INTO user_exp_history (user_id, activity_type, exp_gained, new_exp, new_level)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, activityType, expAmount, newExp, newLevel]);

    return { success: true, userId, expAmount, newExp, newLevel, leveledUp };

  } catch (error) {
    console.error(`Error adding EXP for user ${userId}:`, error);
    return { success: false, error: error.message };
  }
};


// Helper function to mask sensitive data in responses
const maskSensitiveData = (user) => {
  if (!user) return user;

  return {
    ...user,
    email: user.email ? '***@***.***' : undefined,
    phone: user.phone ? '***' + user.phone.slice(-4) : undefined,
    role: user.role // Keep true role for proper authorization
  };
};

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
      `INSERT INTO users (username, email, password, phone, country, gender, bio, avatar, verified, exp, level, last_login)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, username, email`,
      [username, email, hashedPassword, phone, country, gender, '', null, false, 0, 1, null]
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

        // Update last login timestamp
        await pool.query(
          'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
          [user.id]
        );
      } catch (error) {
        console.error('Error processing daily login reward:', error);
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
    console.log(`To: ${email}`);
    console.log(`Subject: Reset Your ChatMe Password`);
    console.log(`Reset Link: http://localhost:5000/api/auth/reset-password?token=${resetToken}`);
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

    const { name, icon, price, type = 'static', category = 'popular', giftImage, imageType, imageName } = req.body;

    if (!name || !icon || !price) {
      return res.status(400).json({ error: 'Name, icon, and price are required' });
    }

    let imagePath = null;

    // Handle gift image upload
    if (giftImage && imageType && imageName) {
      try {
        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(__dirname, 'uploads', 'gifts');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Generate unique filename
        const uniqueSuffix = Date.now() + '_' + Math.round(Math.random() * 1E9);
        // Extract file extension from imageType (e.g., 'image/jpeg' -> 'jpeg')
        const fileExtension = imageType.includes('/') ? imageType.split('/')[1] : imageType;
        const filename = `gift_${uniqueSuffix}.${fileExtension}`;
        const filepath = path.join(uploadsDir, filename);

        // Write base64 image to file
        const imageBuffer = Buffer.from(giftImage, 'base64');
        fs.writeFileSync(filepath, imageBuffer);

        imagePath = `/uploads/gifts/${filename}`;
        console.log('Gift image saved:', filename);
      } catch (error) {
        console.error('Error saving gift image:', error);
        return res.status(500).json({ error: 'Failed to save gift image' });
      }
    }

    const result = await pool.query(`
      INSERT INTO custom_gifts (name, icon, image, price, type, category, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [name, icon, imagePath, parseInt(price), type, category, req.user.id]);

    const gift = result.rows[0];
    if (gift.image) {
      gift.image = `${API_BASE_URL}${gift.image}`;
    }

    res.json(gift);
  } catch (error) {
    console.error('Error adding gift:', error);
    res.status(500).json({ error: 'Failed to add gift' });
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

    const gifts = result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      icon: row.icon,
      price: row.price,
      type: row.type || 'static',
      category: row.category || 'popular',
      image: row.image ? `${API_BASE_URL}${row.image}` : null,
      animation: row.animation
    }));

    // If no custom gifts in database, return default gifts
    if (gifts.length === 0) {
      const defaultGifts = [
        { id: '1', name: 'Lucky Rose', icon: '🌹', price: 10, type: 'static', category: 'lucky' },
        { id: '2', name: 'Ionceng', icon: '🔔', price: 20, type: 'static', category: 'popular' },
        { id: '3', name: 'Lucky Pearls', icon: '🦪', price: 50, type: 'static', category: 'lucky' },
        { id: '4', name: 'Kertas Perkamen', icon: '📜', price: 450, type: 'static', category: 'bangsa' },
        { id: '5', name: 'Kincir Angin', icon: '🌪️', price: 10000, type: 'animated', category: 'set kostum' },
        { id: '6', name: 'Blind Box', icon: '📦', price: 188000, type: 'animated', category: 'tas saya' },
        { id: '7', name: 'Hiasan Berlapis', icon: '✨', price: 100000, type: 'animated', category: 'bangsa' },
        { id: '8', name: 'Doa Bintang', icon: '⭐', price: 1000000, type: 'animated', category: 'tas saya' },
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
      `SELECT id, username, email, bio, phone, gender, birth_date, country, signature, avatar, level, role, verified
       FROM users 
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
      level: user.level || 1,
      role: user.role || 'user', // Always ensure role is included
      verified: user.verified || false
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
    const { username, bio, phone, gender, birthDate, country, signature } = req.body;

    console.log(`=== UPDATE USER PROFILE REQUEST ===`);
    console.log(`User ID: ${userId}`);
    console.log(`Update data:`, { username, bio, phone, gender, birthDate, country, signature });

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
      RETURNING id, username, email, bio, phone, gender, birth_date, country, signature, avatar, level, role
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
    console.log(`Fetching messages for room: ${roomId} - returning empty array (messages not stored)`);

    // Return empty array since we don't store messages anymore
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

    // Clean up participants for the deleted room
    delete roomParticipants[roomId];

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add participant to room
app.post('/api/rooms/:roomId/participants', (req, res) => {
  try {
    const { roomId } = req.params;
    const { username, role = 'user' } = req.body;

    console.log('=== ADD PARTICIPANT TO ROOM REQUEST ===');
    console.log('Room ID:', roomId);
    console.log('Username:', username);
    console.log('Role:', role);

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Initialize participants array for room if not exists
    if (!roomParticipants[roomId]) {
      roomParticipants[roomId] = [];
    }

    // Check if user is already a participant
    let participant = roomParticipants[roomId].find(p => p.username === username);
    if (participant) {
      // Update existing participant
      participant.role = role;
      participant.isOnline = true;
      participant.lastSeen = new Date().toISOString();
      console.log('Updated existing participant:', username);
    } else {
      // Add new participant
      participant = {
        id: Date.now().toString(),
        username,
        role,
        isOnline: true,
        joinedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      };
      roomParticipants[roomId].push(participant);
      console.log('Added new participant:', username);

      // Update room member count
      const roomIndex = rooms.findIndex(r => r.id === roomId);
      if (roomIndex !== -1) {
        rooms[roomIndex].members = roomParticipants[roomId].length;
      }
    }

    res.status(201).json(participant);
  } catch (error) {
    console.error('Error adding participant to room:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get room participants
app.get('/api/rooms/:roomId/participants', (req, res) => {
  try {
    const { roomId } = req.params;
    console.log('=== GET ROOM PARTICIPANTS REQUEST ===');
    console.log('Room ID:', roomId);

    // Return participants from the roomParticipants structure
    const participants = roomParticipants[roomId] || [];
    res.json(participants);
  } catch (error) {
    console.error('Error fetching room participants:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
             CASE WHEN u.last_login > NOW() - INTERVAL '5 minutes' THEN 'Active now' 
                  ELSE 'Last seen ' || COALESCE(EXTRACT(EPOCH FROM (NOW() - u.last_login))/60, 0) || ' minutes ago' END as lastSeen
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

// Get rooms endpoint
app.get('/api/rooms', (req, res) => {
  try {
    console.log('GET /api/rooms -', new Date().toISOString());
    console.log('Headers:', req.headers);
    res.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all posts
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
        mediaFiles: row.media_files || []
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
app.post('/api/feed/posts', async (req, res) => {
  try {
    console.log('=== CREATE POST REQUEST ===');
    console.log('Headers:', req.headers);
    console.log('Body:', req.body);

    const { content, user, username, level = 1, avatar = 'U' } = req.body;

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
      INSERT INTO posts (user_id, username, content, likes, shares)
      VALUES ($1, $2, $3, 0, 0)
      RETURNING *
    `, [userId, username || user, content ? content.trim() : '']);

    const newPost = result.rows[0];

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
      mediaFiles: []
    };

    console.log('New post created successfully:', newPost.id);
    res.status(201).json(responsePost);
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

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
        await pool.query(`
          INSERT INTO user_follows (follower_id, following_id, created_at) 
          VALUES ($1, $2, NOW()) 
          ON CONFLICT (follower_id, following_id) DO NOTHING
        `, [currentUserId, userId]);
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
    let result;

    if (isNumeric) {
      // Query by ID
      result = await pool.query(
        'SELECT id, username, email, bio, phone, avatar, gender, birth_date, country, signature, verified, role, exp, level FROM users WHERE id = $1',
        [userId]
      );
    } else {
      // Query by username
      result = await pool.query(
        'SELECT id, username, email, bio, phone, avatar, gender, birth_date, country, signature, verified, role, exp, level FROM users WHERE username = $1',
        [userId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Get real followers/following count
    const followersResult = await pool.query(
      'SELECT COUNT(*) FROM user_follows WHERE following_id = $1',
      [userId]
    );
    const followingResult = await pool.query(
      'SELECT COUNT(*) FROM user_follows WHERE follower_id = $1',
      [userId]
    );

    // Get achievements from database
    const achievementsResult = await pool.query(`
      SELECT achievement_type, count
      FROM user_achievements
      WHERE user_id = $1
    `, [userId]);

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

    const profile = {
      id: user.id.toString(),
      username: user.username,
      bio: user.bio || user.signature || 'tanda tangan: cukup tau aj',
      followers: parseInt(followersResult.rows[0].count),
      following: parseInt(followingResult.rows[0].count),
      avatar: user.avatar,
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
            [`${avatarId}%`]
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

    const album = result.rows.map(row => ({
      id: row.id,
      url: `/api/users/album/${row.id}`,
      filename: row.filename,
      uploadedAt: row.uploaded_at
    }));

    res.json(album);
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

    // Store album photo
    const photoId = `album_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const photoUrl = `/api/users/album/${photoId}`;

    if (!global.albumPhotos) {
      global.albumPhotos = {};
    }
    global.albumPhotos[photoId] = {
      id: photoId,
      filename,
      data: photo, // base64 data
      uploadedBy: userId,
      uploadedAt: new Date().toISOString()
    };

    console.log(`Album photo uploaded successfully for user ${userId}:`, filename);

    res.json({
      id: photoId,
      url: photoUrl,
      filename,
      uploadedAt: new Date().toISOString(),
      message: 'Photo uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading album photo:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Serve album photos
app.get('/api/users/album/:photoId', (req, res) => {
  try {
    const { photoId } = req.params;

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
      signature: updatedUser.signature,
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

// Privacy Settings API Endpoints
app.get('/api/users/:userId/privacy-settings', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('GET /api/users/:userId/privacy-settings - User:', req.user.username, 'Role:', req.user.role, 'Requested userId:', userId);

    // Check if user exists and has permission
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    const result = await pool.query(
      'SELECT * FROM privacy_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Create default privacy settings if none exist
      const defaultSettings = {
        user_id: userId,
        profile_visibility: 'public',
        privacy_notifications: true,
        location_sharing: true,
        biometric_auth: false,
        two_factor_auth: true,
        active_sessions: true,
        data_download: true
      };

      const insertResult = await pool.query(
        `INSERT INTO privacy_settings (user_id, profile_visibility, privacy_notifications, location_sharing, biometric_auth, two_factor_auth, active_sessions, data_download)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [userId, defaultSettings.profile_visibility, defaultSettings.privacy_notifications, 
         defaultSettings.location_sharing, defaultSettings.biometric_auth, 
         defaultSettings.two_factor_auth, defaultSettings.active_sessions, defaultSettings.data_download]
      );

      res.json(insertResult.rows[0]);
    } else {
      res.json(result.rows[0]);
    }
  } catch (error) {
    console.error('Error fetching privacy settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/users/:userId/privacy-settings', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('PUT /api/users/:userId/privacy-settings - User:', req.user.username, 'Role:', req.user.role, 'Requested userId:', userId, 'Body:', req.body);

    // Check if user has permission
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      console.log('Access denied for user:', req.user.id, 'requesting userId:', userId);
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const allowedFields = [
      'profile_visibility', 'privacy_notifications', 'location_sharing',
      'biometric_auth', 'two_factor_auth', 'active_sessions', 'data_download'
    ];

    const updates = {};
    const values = [userId];
    let paramCount = 2;

    for (const [key, value] of Object.entries(req.body)) {
      if (allowedFields.includes(key)) {
        updates[key] = `$${paramCount}`;
        values.push(value);
        paramCount++;
      }
    }

    if (Object.keys(updates).length === 0) {
      console.log('No valid fields to update');
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const setClause = Object.entries(updates)
      .map(([key, placeholder]) => `${key} = ${placeholder}`)
      .join(', ');

    const query = `
      UPDATE privacy_settings 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP 
      WHERE user_id = $1 
      RETURNING *
    `;

    console.log('Executing privacy settings update query:', query, 'with values:', values);
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      console.log('Privacy settings not found for user:', userId);
      return res.status(404).json({ success: false, error: 'Privacy settings not found' });
    }

    const updatedSettings = result.rows[0];
    console.log('Privacy settings updated successfully:', updatedSettings);

    // Send consistent response format
    res.status(200).json({
      success: true,
      message: 'Privacy settings updated successfully',
      data: updatedSettings
    });
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      details: error.message 
    });
  }
});

app.post('/api/users/:userId/download-data', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('POST /api/users/:userId/download-data - User:', req.user.username, 'Role:', req.user.role, 'Requested userId:', userId);

    // Check if user has permission
    if (req.user.id !== parseInt(userId) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Log the data download request
    await pool.query(
      `INSERT INTO user_activity_logs (user_id, activity_type, description, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [userId, 'data_download_request', 'User requested data download']
    );

    // In a real implementation, you would:
    // 1. Queue a background job to collect user data
    // 2. Generate a downloadable file
    // 3. Send an email/notification when ready

    res.json({ 
      message: 'Data download request received. You will be notified when your data is ready.',
      request_id: `download_${userId}_${Date.now()}`
    });
  } catch (error) {
    console.error('Error processing data download request:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// LowCard Bot API Endpoints
app.get('/api/lowcard/status/:roomId', (req, res) => {
  try {
    const { roomId } = req.params;

    if (!lowCardBot) {
      return res.status(503).json({ error: 'LowCard bot is not available' });
    }

    const status = lowCardBot.getBotStatus(roomId);
    const isActive = lowCardBot.isBotActiveInRoom(roomId);

    res.json({
      roomId,
      status,
      isActive
    });
  } catch (error) {
    console.error('Error getting LowCard status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/lowcard/command', async (req, res) => {
  try {
    const { roomId, message, userId, username } = req.body;

    if (!lowCardBot) {
      return res.status(503).json({ error: 'LowCard bot is not available' });
    }

    if (!roomId || !message || !userId || !username) {
      return res.status(400).json({ 
        error: 'Missing required fields: roomId, message, userId, username' 
      });
    }

    // Process the command
    await lowCardBot.processLowCardCommand(io, roomId, message, userId, username);

    res.json({
      success: true,
      message: 'Command processed successfully'
    });
  } catch (error) {
    console.error('Error processing LowCard command:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/lowcard/init/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { username } = req.body;

    if (!lowCardBot) {
      return res.status(503).json({ error: 'LowCard bot is not available' });
    }

    if (!roomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    // Initialize bot in the room
    await lowCardBot.processLowCardCommand(io, roomId, '/init_bot', username || 'system', username || 'system');

    res.json({
      success: true,
      message: `LowCard bot initialized in room ${roomId}`
    });
  } catch (error) {
    console.error('Error initializing LowCard bot:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/lowcard/shutdown/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    if (!lowCardBot) {
      return res.status(503).json({ error: 'LowCard bot is not available' });
    }

    if (!roomId) {
      return res.status(400).json({ error: 'Room ID is required' });
    }

    // Shutdown bot in the room
    await lowCardBot.processLowCardCommand(io, roomId, '/bot off', 'system', 'system');

    res.json({
      success: true,
      message: `LowCard bot shutdown in room ${roomId}`
    });
  } catch (error) {
    console.error('Error shutting down LowCard bot:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all active LowCard games
app.get('/api/lowcard/games', (req, res) => {
  try {
    if (!lowCardBot) {
      return res.status(503).json({ error: 'LowCard bot is not available' });
    }

    // Get all rooms and check which ones have active bots
    const activeGames = [];
    rooms.forEach(room => {
      const isActive = lowCardBot.isBotActiveInRoom(room.id);
      if (isActive) {
        const status = lowCardBot.getBotStatus(room.id);
        activeGames.push({
          roomId: room.id,
          roomName: room.name,
          status,
          isActive
        });
      }
    });

    res.json({
      totalGames: activeGames.length,
      games: activeGames
    });
  } catch (error) {
    console.error('Error getting active LowCard games:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



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

    // Validate filename
    if (typeof filename !== 'string' || filename.trim().length === 0) {
      console.error('Invalid filename:', filename);
      return res.status(400).json({ error: 'Filename must be a non-empty string' });
    }

    // Validate user
    if (typeof user !== 'string' || user.trim().length === 0) {
      console.error('Invalid user:', user);
      return res.status(400).json({ error: 'User must be a non-empty string' });
    }

    // Validate base64 data
    if (typeof data !== 'string' || data.length === 0) {
      console.error('Data is not a string or is empty');
      return res.status(400).json({ error: 'Data must be a non-empty string' });
    }

    // Check for placeholder data
    if (data === 'video_placeholder' || data === 'photo_placeholder') {
      console.error('Received placeholder data');
      return res.status(400).json({
        error: 'File processing failed. Please try selecting the file again.'
      });
    }

    let isValidBase64 = false;
    let actualData = data;

    if (data.startsWith('data:')) {
      // Extract base64 data from data URL
      const base64Match = data.match(/^data:[^;]+;base64,(.+)$/);
      if (base64Match) {
        actualData = base64Match[1];
        isValidBase64 = true;
      }
    } else if (data.match(/^[A-Za-z0-9+/]+={0,2}$/)) {
      isValidBase64 = true;
      actualData = data;
    }

    // Check minimum data length (should be more than a few bytes for real media)
    if (actualData.length < 100) {
      console.error('Data too short for', type, 'length:', actualData.length);
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
      filename,
      type, // 'photo' or 'video'
      data: base64Data, // base64 data without data URL prefix
      uploadedBy: user,
      uploadedAt: new Date().toISOString(),
      url: `/api/feed/media/${fileId}`, // URL to access the file
      size: Buffer.byteLength(base64Data, 'base64') // Accurate file size in bytes
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

// Serve uploaded media files
app.use('/api/feed/media', express.static(path.join(__dirname, 'uploads/media')));

// Serve card assets for LowCard game
app.use('/cards', express.static(path.join(__dirname, '../assets/card')));


// Serve uploaded emoji files
app.get('/uploads/emojis/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../uploads/emojis', filename);

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

// Socket Gateway Configuration
const SOCKET_GATEWAY_URL = process.env.SOCKET_GATEWAY_URL || 'http://0.0.0.0:5001';


// Route for creating private chats
// Create private chat
app.post('/api/chat/private', authenticateToken, async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const currentUserId = req.user.userId;

    console.log(`Creating private chat between ${currentUserId} and ${targetUserId}`);

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    if (currentUserId === targetUserId) {
      return res.status(400).json({ error: 'Cannot create chat with yourself' });
    }

    // Check if target user exists
    const targetUser = await pool.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // For simplicity, we'll create a room-based private chat using existing room system
    // Check if private room already exists between these users
    const existingRoom = await pool.query(
      `SELECT r.* FROM rooms r 
       WHERE r.name = $1 OR r.name = $2`,
      [`private_${currentUserId}_${targetUserId}`, `private_${targetUserId}_${currentUserId}`]
    );

    if (existingRoom.rows.length > 0) {
      // Room already exists, return existing room
      return res.json({ 
        chatId: existingRoom.rows[0].id,
        message: 'Private chat already exists' 
      });
    }

    // Create new private room
    const roomResult = await pool.query(
      'INSERT INTO rooms (name, description, type, max_members, created_by, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id',
      [
        `private_${currentUserId}_${targetUserId}`,
        `Private chat between users`,
        'private',
        2,
        currentUserId
      ]
    );

    const roomId = roomResult.rows[0].id;

    console.log(`Private chat room created with ID: ${roomId}`);
    res.json({ 
      chatId: roomId,
      message: 'Private chat created successfully' 
    });

  } catch (error) {
    console.error('Error creating private chat:', error);
    res.status(500).json({ error: 'Failed to create private chat' });
  }
});

// Route for getting private chat messages
app.get('/api/chat/private/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    console.log(`GET /api/chat/private/${chatId}/messages - Getting private chat messages`);

    // Fetch messages from database using chatId
    const result = await pool.query(`
      SELECT
        cm.*,
        u.avatar,
        u.verified
      FROM chat_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.room_id = $1 AND cm.is_private = TRUE
      ORDER BY cm.created_at ASC
    `, [chatId]);

    const messages = result.rows.map(row => ({
      id: row.id.toString(),
      sender: row.username,
      content: row.content,
      timestamp: row.created_at,
      chatId: row.room_id,
      role: row.user_role,
      level: row.user_level,
      type: row.message_type,
      userRole: row.user_role,
      media: row.media_data ? JSON.parse(row.media_data) : null,
      avatar: row.avatar,
      verified: row.verified
    }));

    res.json(messages);
  } catch (error) {
    console.error('Error fetching private chat messages:', error);
    res.status(500).json({ error: 'Failed to fetch messages', details: error.message });
  }
});

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
      if (recipientResult.rows.length === 0) {
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
        return res.status(400).json({ error: 'User not found' });
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

      // Calculate shares: 30% to recipient, 70% to system
      const recipientShare = Math.floor(giftPrice * 0.3);
      const systemShare = giftPrice - recipientShare;

      // Record the gift transaction in credit_transactions table
      await client.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type)
        VALUES ($1, $2, $3, 'gift')
      `, [senderId, recipientUserId, giftPrice]);

      // Record gift earnings for recipient
      await client.query(`
        INSERT INTO gift_earnings (user_id, gift_id, gift_name, gift_price, user_share, system_share, sender_user_id, sender_username, room_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [recipientUserId, giftId, giftName, giftPrice, recipientShare, systemShare, senderId, senderUsername, roomId]);

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

      console.log(`Gift purchased: ${senderUsername} sent ${giftName} (${giftPrice} coins) to ${recipientUsername}. Recipient earned ${recipientShare} coins (30%), system got ${systemShare} coins (70%)`);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error processing gift purchase:', error);
    res.status(500).json({ error: 'Failed to process gift purchase' });
  } finally {
    client.release();
  }
});

// Get user's gift earnings balance for withdrawal
app.get('/api/user/gift-earnings-balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT balance, total_earned, total_withdrawn
      FROM user_gift_earnings_balance 
      WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
      // Create record if doesn't exist
      await pool.query(`
        INSERT INTO user_gift_earnings_balance (user_id, balance, total_earned, total_withdrawn)
        VALUES ($1, 0, 0, 0)
      `, [userId]);
      
      return res.json({
        balance: 0,
        totalEarned: 0,
        totalWithdrawn: 0,
        balanceUSD: 0,
        minWithdrawCoins: 155000,
        minWithdrawUSD: 10,
        canWithdraw: false
      });
    }

    const giftBalance = result.rows[0];
    const exchangeRate = await getExchangeRate();
    const balanceUSD = giftBalance.balance / exchangeRate;
    const minWithdrawCoins = Math.floor(10 * exchangeRate); // 10 USD equivalent
    const canWithdraw = giftBalance.balance >= minWithdrawCoins;

    res.json({
      balance: giftBalance.balance,
      totalEarned: giftBalance.total_earned,
      totalWithdrawn: giftBalance.total_withdrawn,
      balanceUSD: Number(balanceUSD.toFixed(2)),
      minWithdrawCoins,
      minWithdrawUSD: 10,
      exchangeRate,
      canWithdraw
    });

  } catch (error) {
    console.error('Error fetching gift earnings balance:', error);
    res.status(500).json({ error: 'Failed to fetch gift earnings balance' });
  }
});

// ==================== XENDIT WITHDRAWAL SYSTEM ====================

const { Xendit } = require('xendit-node');
const crypto = require('crypto');
const https = require('https');

const xendit = new Xendit({
  secretKey: process.env.XENDIT_SECRET_KEY,
});

// Xendit channel code mapping
const CHANNEL_CODE_MAPPING = {
  // Banks
  'bca': 'BCA',
  'bri': 'BRI',
  'bni': 'BNI',
  'mandiri': 'MANDIRI',
  'cimb': 'CIMB',
  'permata': 'PERMATA',
  'danamon': 'DANAMON',
  'jago': 'JAGO',
  'maybank': 'MAYBANK',
  'btn': 'BTN',
  'panin': 'PANIN',
  'bukopin': 'BUKOPIN',
  'mega': 'MEGA',
  'ocbc': 'OCBC',
  'hsbc': 'HSBC',
  'uob': 'UOB',
  'mayapada': 'MAYAPADA',
  'dbs': 'DBS',
  'bjb': 'BJB',
  'bsi': 'BSI',
  // E-wallets
  'dana': 'DANA',
  'ovo': 'OVO',
  'gopay': 'GOPAY',
  'linkaja': 'LINKAJA',
  'shopeepay': 'SHOPEEPAY',
  'sakuku': 'SAKUKU',
  'astrapay': 'ASTRAPAY',
  'jeniuspay': 'JENIUSPAY'
};

// Currency conversion cache
let exchangeRateCache = {
  rate: 15500, // fallback rate
  lastUpdated: null
};

// Function to get current USD to IDR exchange rate
const getExchangeRate = async () => {
  try {
    // Check if cache is still valid (refresh every 6 hours)
    const now = new Date();
    if (exchangeRateCache.lastUpdated && 
        (now - exchangeRateCache.lastUpdated) < 6 * 60 * 60 * 1000) {
      return exchangeRateCache.rate;
    }

    // Fetch fresh rate from free API
    const response = await new Promise((resolve, reject) => {
      const req = https.get('https://api.exchangerate-api.com/v4/latest/USD', (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => {
        req.abort();
        reject(new Error('Request timeout'));
      });
    });

    if (response.rates && response.rates.IDR) {
      exchangeRateCache.rate = Math.floor(response.rates.IDR);
      exchangeRateCache.lastUpdated = now;
      console.log('Updated USD/IDR exchange rate:', exchangeRateCache.rate);
    }
  } catch (error) {
    console.error('Failed to fetch exchange rate, using cached/fallback:', error.message);
  }
  
  return exchangeRateCache.rate;
};

// Function to verify Xendit webhook signature
const verifyXenditSignature = (payload, signature, webhookToken) => {
  if (!signature || !webhookToken) {
    console.warn('Missing signature or webhook token');
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', webhookToken)
      .update(payload, 'utf8')
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

// Generate idempotency key
const generateIdempotencyKey = (userId, withdrawalId, timestamp) => {
  return crypto.createHash('sha256')
    .update(`${userId}-${withdrawalId}-${timestamp}`)
    .digest('hex')
    .substring(0, 32);
};

// Link user account for withdrawals
app.post('/api/user/link-account', authenticateToken, async (req, res) => {
  try {
    const { accountId, accountName, accountNumber, holderName, type } = req.body;
    const userId = req.user.id;

    if (!accountId || !accountName || !accountNumber || !holderName || !type) {
      return res.status(400).json({ error: 'All account details are required' });
    }

    // Save linked account to database
    const result = await pool.query(`
      INSERT INTO user_linked_accounts (user_id, account_id, account_name, account_number, holder_name, account_type)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, account_id) 
      DO UPDATE SET 
        account_name = EXCLUDED.account_name,
        account_number = EXCLUDED.account_number,
        holder_name = EXCLUDED.holder_name,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [userId, accountId, accountName, accountNumber, holderName, type]);

    res.json({
      success: true,
      account: result.rows[0]
    });

  } catch (error) {
    console.error('Error linking account:', error);
    res.status(500).json({ error: 'Failed to link account' });
  }
});

// Get user's linked accounts
app.get('/api/user/linked-accounts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT account_id as id, account_type as type, account_name as name, 
             account_number as "accountNumber", holder_name as "accountName"
      FROM user_linked_accounts 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [userId]);

    res.json({
      accounts: result.rows
    });

  } catch (error) {
    console.error('Error fetching linked accounts:', error);
    res.status(500).json({ error: 'Failed to fetch linked accounts' });
  }
});

// Process withdrawal request using Xendit
app.post('/api/user/withdraw', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { amount, accountId, currency } = req.body;
    const userId = req.user.id;
    const username = req.user.username;

    if (!amount || !accountId || amount < 10) {
      return res.status(400).json({ error: 'Invalid withdrawal amount (minimum $10 USD)' });
    }

    await client.query('BEGIN');

    try {
      // Check user's gift earnings balance
      const balanceResult = await client.query(`
        SELECT balance FROM user_gift_earnings_balance WHERE user_id = $1 FOR UPDATE
      `, [userId]);

      if (balanceResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No gift earnings balance found' });
      }

      const giftBalance = balanceResult.rows[0].balance;
      
      // Get current exchange rate
      const exchangeRate = await getExchangeRate();
      const amountIDR = Math.floor(amount * exchangeRate);
      const balanceUSD = giftBalance / exchangeRate;
      const minWithdrawCoins = Math.floor(10 * exchangeRate); // 10 USD equivalent

      if (giftBalance < minWithdrawCoins) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Minimum withdrawal is ${minWithdrawCoins.toLocaleString()} coins ($10 USD)`,
          currentRate: exchangeRate
        });
      }

      if (amount > balanceUSD) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Insufficient gift earnings balance' });
      }

      // Get linked account details
      const accountResult = await client.query(`
        SELECT * FROM user_linked_accounts WHERE user_id = $1 AND account_id = $2
      `, [userId, accountId]);

      if (accountResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Linked account not found' });
      }

      const linkedAccount = accountResult.rows[0];

      // Get channel code for Xendit
      const channelCode = CHANNEL_CODE_MAPPING[linkedAccount.account_id.toLowerCase()];
      if (!channelCode) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: `Unsupported account type: ${linkedAccount.account_id}`,
          supportedTypes: Object.keys(CHANNEL_CODE_MAPPING)
        });
      }

      // Calculate Xendit fees (3-5% depending on method)
      const feeRate = linkedAccount.account_type === 'bank' ? 0.03 : 0.05;
      const netAmount = Math.floor(amountIDR * (1 - feeRate));

      // Create withdrawal request record
      const withdrawalResult = await client.query(`
        INSERT INTO withdrawal_requests (
          user_id, amount, amount_usd, withdrawal_method, account_type, 
          account_name, account_number, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING id
      `, [
        userId, 
        amountIDR, 
        amount, 
        linkedAccount.account_type,
        linkedAccount.account_name,
        linkedAccount.account_number,
        'pending'
      ]);

      const withdrawalId = withdrawalResult.rows[0].id;
      const timestamp = Date.now();
      const externalID = `withdrawal_${withdrawalId}_${timestamp}`;
      const idempotencyKey = generateIdempotencyKey(userId, withdrawalId, timestamp);

      // Create Xendit disbursement/charge request
      let xenditResponse;
      try {
        if (linkedAccount.account_type === 'bank') {
          // Bank transfer via Xendit Disbursements API
          xenditResponse = await xendit.Disbursement.create({
            external_id: externalID,
            bank_code: channelCode,
            account_holder_name: linkedAccount.holder_name,
            account_number: linkedAccount.account_number,
            description: `Gift earnings withdrawal - User: ${username}`,
            amount: netAmount,
            currency: 'IDR',
            x_idempotency_key: idempotencyKey,
            email_to: [],
            email_cc: [],
            email_bcc: []
          });
        } else if (linkedAccount.account_type === 'ewallet') {
          // E-wallet charge via Xendit EWallet Charges API
          const { EWalletCharge } = xendit;
          
          let chargeRequest = {
            reference_id: externalID,
            currency: 'IDR',
            amount: netAmount,
            checkout_method: 'ONE_TIME_PAYMENT',
            channel_code: channelCode,
            channel_properties: {
              success_redirect_url: `${process.env.BASE_URL || 'https://localhost:3000'}/withdrawal/success`,
              failure_redirect_url: `${process.env.BASE_URL || 'https://localhost:3000'}/withdrawal/failed`,
              cancel_redirect_url: `${process.env.BASE_URL || 'https://localhost:3000'}/withdrawal/cancelled`
            },
            customer: {
              reference_id: `user_${userId}`,
              type: 'INDIVIDUAL',
              given_names: linkedAccount.holder_name,
              mobile_number: linkedAccount.account_number.startsWith('+') ? linkedAccount.account_number : `+62${linkedAccount.account_number.replace(/^0/, '')}`
            },
            metadata: {
              user_id: userId,
              username: username,
              withdrawal_id: withdrawalId
            }
          };

          // Channel-specific properties
          if (channelCode === 'DANA' || channelCode === 'OVO' || channelCode === 'LINKAJA') {
            chargeRequest.channel_properties.mobile_number = chargeRequest.customer.mobile_number;
          }

          xenditResponse = await EWalletCharge.createEWalletCharge({
            data: chargeRequest,
            idempotencyKey: idempotencyKey
          });
        }

        console.log('Xendit Response:', JSON.stringify(xenditResponse, null, 2));

        // Update withdrawal request with Xendit transaction ID
        const transactionId = xenditResponse.id || xenditResponse.charge_id || xenditResponse.reference_id;
        await client.query(`
          UPDATE withdrawal_requests 
          SET xendit_transaction_id = $1, status = 'processing', processed_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [transactionId, withdrawalId]);

        // Deduct from user's gift earnings balance
        await client.query(`
          UPDATE user_gift_earnings_balance 
          SET 
            balance = balance - $1,
            total_withdrawn = total_withdrawn + $1,
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $2
        `, [amountIDR, userId]);

        await client.query('COMMIT');

        res.json({
          success: true,
          withdrawalId,
          xenditTransactionId: transactionId,
          amount: amountIDR,
          amountUSD: amount,
          netAmount,
          exchangeRate,
          channelCode,
          feeRate: linkedAccount.account_type === 'bank' ? '3%' : '5%',
          status: 'processing',
          message: 'Withdrawal request submitted successfully to Xendit',
          actionUrl: xenditResponse.actions?.desktop_web_checkout_url || xenditResponse.checkout_url
        });

        console.log(`Withdrawal processed: User ${username} withdrew $${amount} USD (${amountIDR} coins) to ${linkedAccount.account_name}`);

      } catch (xenditError) {
        await client.query('ROLLBACK');
        console.error('Xendit API Error:', {
          message: xenditError.message,
          response: xenditError.response?.data,
          status: xenditError.response?.status
        });
        
        // Update withdrawal request status to failed
        await pool.query(`
          UPDATE withdrawal_requests 
          SET status = 'failed', failure_reason = $1, processed_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [xenditError.message || 'Xendit API error', withdrawalId]);

        return res.status(500).json({ 
          error: 'Payment processing failed', 
          details: xenditError.message || 'Unknown Xendit error',
          errorCode: xenditError.response?.data?.error_code,
          exchangeRate
        });
      }

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  } finally {
    client.release();
  }
});

// Xendit webhook callback for withdrawal status updates
app.post('/api/xendit/callback', express.raw({ type: 'application/json' }), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const payload = req.body.toString();
    const signature = req.headers['x-callback-token'];
    const webhookToken = process.env.XENDIT_WEBHOOK_TOKEN;
    
    // Verify webhook signature if webhook token is configured
    if (webhookToken && signature) {
      const isValidSignature = verifyXenditSignature(payload, signature, webhookToken);
      if (!isValidSignature) {
        console.error('Invalid Xendit webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else if (webhookToken) {
      console.warn('Webhook token configured but no signature provided');
      return res.status(401).json({ error: 'Missing signature' });
    }

    const data = JSON.parse(payload);
    console.log('Xendit Callback received:', {
      type: data.event_type || 'unknown',
      id: data.id || data.charge_id,
      status: data.status,
      external_id: data.external_id || data.reference_id
    });

    // Handle different webhook types
    let externalId, status, transactionId, failureReason;
    
    if (data.event_type === 'disbursement.completed' || data.event_type === 'disbursement.failed') {
      // Bank disbursement webhook
      externalId = data.external_id;
      status = data.status;
      transactionId = data.id;
      failureReason = data.failure_code || data.failure_reason;
    } else if (data.event_type && data.event_type.startsWith('ewallet.charge')) {
      // E-wallet charge webhook
      externalId = data.data?.reference_id || data.reference_id;
      status = data.data?.status || data.status;
      transactionId = data.data?.id || data.id;
      failureReason = data.data?.failure_reason || data.failure_reason;
    } else {
      // Fallback for direct webhook data (legacy format)
      externalId = data.external_id || data.reference_id;
      status = data.status;
      transactionId = data.id || data.charge_id;
      failureReason = data.failure_reason || data.failure_code;
    }

    // Extract withdrawal ID from external_id
    const withdrawalId = externalId?.split('_')[1];
    
    if (!withdrawalId || !status) {
      console.error('Invalid callback data:', { externalId, status, transactionId });
      return res.status(400).json({ error: 'Invalid callback data' });
    }

    await client.query('BEGIN');

    try {
      // Get withdrawal info for validation and potential refund
      const withdrawalInfo = await client.query(
        'SELECT id, amount, user_id, status as current_status, xendit_transaction_id FROM withdrawal_requests WHERE id = $1',
        [withdrawalId]
      );

      if (withdrawalInfo.rows.length === 0) {
        await client.query('ROLLBACK');
        console.error(`Withdrawal not found: ${withdrawalId}`);
        return res.status(404).json({ error: 'Withdrawal not found' });
      }

      const withdrawal = withdrawalInfo.rows[0];
      
      // Validate transaction ID matches (security check)
      if (withdrawal.xendit_transaction_id !== transactionId) {
        await client.query('ROLLBACK');
        console.error(`Transaction ID mismatch: expected ${withdrawal.xendit_transaction_id}, got ${transactionId}`);
        return res.status(400).json({ error: 'Transaction ID mismatch' });
      }

      // Don't update if already in final state
      if (['completed', 'failed', 'cancelled'].includes(withdrawal.current_status)) {
        await client.query('COMMIT');
        console.log(`Withdrawal ${withdrawalId} already in final state: ${withdrawal.current_status}`);
        return res.json({ success: true, message: 'Already processed' });
      }

      let updateQuery, updateParams;

      if (status === 'COMPLETED' || status === 'SUCCEEDED' || status === 'SUCCESS_COMPLETED') {
        // Success - mark as completed
        updateQuery = `
          UPDATE withdrawal_requests 
          SET status = 'completed', processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `;
        updateParams = [withdrawalId];
        
        console.log(`✅ Withdrawal ${withdrawalId} completed successfully`);
        
      } else if (status === 'FAILED' || status === 'EXPIRED' || status === 'CANCELLED') {
        // Failed - mark as failed and refund user
        updateQuery = `
          UPDATE withdrawal_requests 
          SET status = 'failed', failure_reason = $1, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `;
        updateParams = [failureReason || `Payment ${status.toLowerCase()}`, withdrawalId];
        
        // Refund the user's balance
        await client.query(`
          UPDATE user_gift_earnings_balance 
          SET 
            balance = balance + $1,
            total_withdrawn = GREATEST(0, total_withdrawn - $1),
            updated_at = CURRENT_TIMESTAMP
          WHERE user_id = $2
        `, [withdrawal.amount, withdrawal.user_id]);
        
        console.log(`❌ Withdrawal ${withdrawalId} failed, refunded ${withdrawal.amount} coins to user ${withdrawal.user_id}`);
        
      } else {
        // Unknown status - just log it
        console.log(`ℹ️  Withdrawal ${withdrawalId} status update: ${status}`);
        await client.query('COMMIT');
        return res.json({ success: true, message: `Status updated: ${status}` });
      }

      // Execute the update
      const result = await client.query(updateQuery, updateParams);
      
      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Withdrawal not found for update' });
      }

      await client.query('COMMIT');
      res.json({ success: true, withdrawalId, status });

    } catch (dbError) {
      await client.query('ROLLBACK');
      throw dbError;
    }

  } catch (error) {
    console.error('Error processing Xendit callback:', {
      message: error.message,
      stack: error.stack,
      body: req.body?.toString?.()?.substring(0, 500)
    });
    res.status(500).json({ error: 'Failed to process callback' });
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

        // Update last login timestamp
        await pool.query(
          'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
          [user.id]
        );
      } catch (error) {
        console.error('Error processing daily login reward:', error);
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
    const userResult = await pool.query('SELECT id, username FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = userResult.rows[0];

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Add credits to user (create account if doesn't exist)
      const creditsResult = await pool.query('SELECT balance FROM user_credits WHERE user_id = $1', [targetUser.id]);
      if (creditsResult.rows.length === 0) {
        await pool.query('INSERT INTO user_credits (user_id, balance) VALUES ($1, $2)', [targetUser.id, amount]);
      } else {
        await pool.query(
          'UPDATE user_credits SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
          [amount, targetUser.id]
        );
      }

      // Record admin transaction
      await pool.query(`
        INSERT INTO credit_transactions (to_user_id, amount, type)
        VALUES ($1, $2, 'admin_add')
      `, [targetUser.id, amount]);

      await pool.query('COMMIT');

      console.log(`Admin added ${amount} credits to user ${username}`);
      res.json({ 
        success: true, 
        message: `Successfully added ${amount} credits to ${username}`,
        reason: reason || 'Admin credit addition'
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error adding admin credits:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/users/status', authenticateToken, async (req, res) => {
  try {
    console.log('=== ADMIN USER STATUS REQUEST ===');
    console.log('User ID:', req.user.id);
    console.log('User Role:', req.user.role);

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
        u.verified,
        u.last_login,
        COALESCE(uc.balance, 0) as credits,
        CASE WHEN u.last_login > NOW() - INTERVAL '5 minutes' THEN 'online' ELSE 'offline' END as status
      FROM users u
      LEFT JOIN user_credits uc ON u.id = uc.user_id
      ORDER BY u.last_login DESC NULLS LAST
      LIMIT 100
    `);

    const users = result.rows.map(row => ({
      id: row.id.toString(),
      username: row.username,
      email: row.email,
      phone: row.phone,
      role: row.role,
      verified: row.verified,
      credits: row.credits,
      status: row.status,
      lastLogin: row.last_login,
      device: 'Mobile App', // Mock data - you can enhance this
      ip: '192.168.1.' + Math.floor(Math.random() * 255), // Mock IP
      location: 'Indonesia' // Mock location
    }));

    res.json({ users });
  } catch (error) {
    console.error('Error fetching user status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/admin/credits/history/:userId', authenticateToken, async (req, res) => {
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

// Run cleanup every hour
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);
// Run mentor cleanup every 6 hours
setInterval(cleanupExpiredMentors, 6 * 60 * 60 * 1000);

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

// Add ranking endpoints for games, wealth, and gifts
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
        u.id::text,
        u.username,
        u.avatar,
        u.level,
        u.verified,
        total_spending as credits
      FROM users u
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

// Run initial cleanup on server start
cleanupExpiredMentors();


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
  console.log(`   POST /api/users/:userId/album - Upload photo to user album`);
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