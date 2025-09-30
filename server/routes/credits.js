
const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('./auth');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Rate limiting for credit operations
const rateLimitStore = new Map();

const rateLimit = (maxRequests = 5, windowMs = 60000) => {
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

// Get user balance
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query('SELECT balance FROM user_credits WHERE user_id = $1', [userId]);

    let balance = 0;
    if (result.rows.length > 0) {
      balance = result.rows[0].balance;
    } else {
      await pool.query('INSERT INTO user_credits (user_id, balance) VALUES ($1, $2)', [userId, 0]);
    }

    res.json({ balance });
  } catch (error) {
    console.error('Error fetching credits balance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get credits history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

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

// Audit logging for credit transfers
const auditCreditTransfer = async (req, res, next) => {
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
      
      const auditData = {
        from_user_id: req.user?.id,
        from_username: req.user?.username,
        to_username: req.body?.toUsername,
        amount: req.body?.amount,
        pin: '***REDACTED***',
        status,
        ip_address: ip,
        user_agent: userAgent,
        error_message: status === 'failed' ? (responseBody?.error || 'Unknown error') : null
      };

      await pool.query(`
        INSERT INTO admin_audit_logs 
        (admin_id, admin_username, action, resource_type, resource_id, details, ip_address, user_agent, status, error_message)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        req.user.id,
        req.user.username,
        'CREDIT_TRANSFER',
        'credit',
        req.body?.toUsername,
        JSON.stringify(auditData),
        ip,
        userAgent,
        status,
        auditData.error_message
      ]);

      console.log(`💰 Credit Transfer: ${req.user.username} → ${req.body?.toUsername} (${req.body?.amount} credits) - Status: ${status}`);
    } catch (auditError) {
      console.error('Audit logging error for credit transfer:', auditError);
    }
  });

  next();
};

// Transfer credits (rate limited: max 5 transfers per minute)
router.post('/transfer', authenticateToken, rateLimit(5, 60000), auditCreditTransfer, async (req, res) => {
  try {
    const { toUsername, amount, pin } = req.body;
    const fromUserId = req.user.id;

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

    await pool.query('BEGIN');

    try {
      const balanceResult = await pool.query('SELECT balance FROM user_credits WHERE user_id = $1', [fromUserId]);
      let senderBalance = 0;

      if (balanceResult.rows.length > 0) {
        senderBalance = balanceResult.rows[0].balance;
      } else {
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

      // Add to receiver
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

module.exports = router;
