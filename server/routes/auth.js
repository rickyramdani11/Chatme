
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../services/emailService');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ error: 'No token provided' });
  }

  if (typeof token !== 'string' || token.split('.').length !== 3) {
    return res.status(403).json({ error: 'Invalid token format' });
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ error: 'Token expired' });
      } else if (err.name === 'JsonWebTokenError') {
        return res.status(403).json({ error: 'Invalid token' });
      }
      return res.status(403).json({ error: 'Token verification failed' });
    }

    try {
      const userResult = await pool.query(
        'SELECT id, username, email, password, bio, phone, gender, birth_date, country, signature, avatar, avatar_frame, level, verified, role, exp, last_login, status, is_busy, busy_until FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(403).json({ error: 'User not found' });
      }

      const user = userResult.rows[0];
      req.user = user;
      req.user.userId = decoded.userId;
      next();
    } catch (dbError) {
      console.error('Database error during token authentication:', dbError);
      res.status(500).json({ error: 'Database error during authentication' });
    }
  });
};

// Username validation function
function validateUsername(username) {
  // Check length: 4-12 characters
  if (username.length < 4 || username.length > 12) {
    return { valid: false, error: 'Username must be 4-12 characters' };
  }

  // Check if only lowercase letters, numbers, underscore, and dot
  const validCharsRegex = /^[a-z0-9_.]+$/;
  if (!validCharsRegex.test(username)) {
    return { valid: false, error: 'Username must be lowercase and can only contain letters, numbers, underscore (_), and dot (.)' };
  }

  // Must contain at least one letter (cannot be only numbers)
  const hasLetterRegex = /[a-z]/;
  if (!hasLetterRegex.test(username)) {
    return { valid: false, error: 'Username must contain at least one letter (cannot be only numbers)' };
  }

  return { valid: true };
}

// Registration endpoint
router.post('/register', async (req, res) => {
  try {
    const { username, password, email, phone, country, gender } = req.body;

    if (!username || !password || !email || !phone || !country || !gender) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate username format
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
      return res.status(400).json({ error: usernameValidation.error });
    }

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Generate 6-digit OTP
    const verificationOTP = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const result = await pool.query(
      `INSERT INTO users (username, email, password, phone, country, gender, bio, avatar, verified, exp, level, last_login, status, verification_otp, otp_expiry)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id, username, email`,
      [username, email, hashedPassword, phone, country, gender, '', null, false, 0, 1, null, 'offline', verificationOTP, otpExpiry]
    );

    const newUser = result.rows[0];

    // Send verification email with OTP (non-blocking)
    sendVerificationEmail(email, username, verificationOTP).catch(err => {
      console.error('Failed to send verification email:', err);
    });

    res.status(201).json({
      message: 'User created successfully. Please check your email to verify your account.',
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

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password, deviceInfo, location } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const result = await pool.query(
      'SELECT id, username, email, password, bio, phone, gender, birth_date, country, signature, avatar, level, verified, role FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'Unknown';
    const device = deviceInfo || 'Unknown Device';
    const userLocation = location || 'Unknown';

    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP, status = $1, device_info = $2, last_ip = $3, location = $4 WHERE id = $5',
      ['online', device, ipAddress, userLocation, user.id]
    );

    const updatedUserResult = await pool.query(
      'SELECT id, username, email, bio, phone, avatar, verified, role, exp, level FROM users WHERE id = $1',
      [user.id]
    );
    const updatedUser = updatedUserResult.rows[0];

    res.json({
      token,
      user: {
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
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Logout endpoint
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // Note: We don't update status here because the socket gateway handles online/offline status
    // based on active socket connections. This ensures multi-device support works correctly.
    // The gateway will set status to 'offline' when the last socket connection disconnects.
    res.json({ message: 'Logged out successfully', success: true });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Internal server error during logout' });
  }
});

// Change password
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const validPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
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
router.get('/check-pin', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query('SELECT pin FROM users WHERE id = $1', [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hasPin = result.rows[0].pin !== null && result.rows[0].pin !== '123456';
    res.json({ hasPin });
  } catch (error) {
    console.error('Check PIN error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Email verification endpoint
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const result = await pool.query(
      'SELECT id, username, email, verified, verification_token_expiry FROM users WHERE verification_token = $1',
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    const user = result.rows[0];

    if (user.verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    if (new Date() > new Date(user.verification_token_expiry)) {
      return res.status(400).json({ error: 'Verification token has expired. Please request a new one.' });
    }

    await pool.query(
      'UPDATE users SET verified = true, verification_token = NULL, verification_token_expiry = NULL WHERE id = $1',
      [user.id]
    );

    res.json({
      message: 'Email verified successfully! You can now login.',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await pool.query(
      'SELECT id, username, email, verified FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    if (user.verified) {
      return res.status(400).json({ error: 'Email already verified' });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      'UPDATE users SET verification_token = $1, verification_token_expiry = $2 WHERE id = $3',
      [verificationToken, verificationExpiry, user.id]
    );

    await sendVerificationEmail(email, user.username, verificationToken);

    res.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change PIN
router.post('/change-pin', authenticateToken, async (req, res) => {
  try {
    const { oldPin, newPin } = req.body;
    const userId = req.user.id;

    if (!newPin) {
      return res.status(400).json({ error: 'New PIN is required' });
    }

    if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
      return res.status(400).json({ error: 'PIN must be exactly 6 digits' });
    }

    const userResult = await pool.query('SELECT pin FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const currentPin = user.pin || '123456';

    if (oldPin !== currentPin) {
      return res.status(400).json({ error: 'Current PIN is incorrect' });
    }

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

module.exports = { router, authenticateToken };
