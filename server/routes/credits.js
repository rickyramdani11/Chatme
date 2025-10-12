
const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('./auth');
const notificationRouter = require('./notifications');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Gateway URL for emitting notifications
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8000';

// Rate limiting for credit operations
const rateLimitStore = new Map();

const rateLimit = (maxRequests = 5, windowMs = 60000) => {
  return (req, res, next) => {
    const key = `${req.user.userId}-${req.path}`;
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
    const userId = req.user.userId;
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
    const userId = req.user.userId;

    // Get credit transfers (send/receive between users)
    const transfersResult = await pool.query(`
      SELECT 
        ct.id,
        ct.amount,
        ct.created_at,
        CASE 
          WHEN ct.from_user_id = $1 THEN 'send'
          WHEN ct.to_user_id = $1 THEN 'receive'
        END as type,
        CASE 
          WHEN ct.from_user_id = $1 THEN (SELECT username FROM users WHERE id = ct.to_user_id)
          WHEN ct.to_user_id = $1 THEN (SELECT username FROM users WHERE id = ct.from_user_id)
        END as other_user,
        'transfer' as category
      FROM credit_transactions ct
      WHERE (ct.from_user_id = $1 OR ct.to_user_id = $1) AND ct.type = 'transfer'
    `, [userId]);

    // Get game transactions (bet/win from lowcard game)
    const gameResult = await pool.query(`
      SELECT 
        ct.id,
        ct.amount,
        ct.created_at,
        ct.type,
        'game' as category,
        ct.description
      FROM credit_transactions ct
      WHERE (ct.from_user_id = $1 OR ct.to_user_id = $1) 
        AND ct.type IN ('game_bet', 'game_win', 'game_refund')
    `, [userId]);

    // Get gift sent transactions
    const giftSentResult = await pool.query(`
      SELECT 
        gt.id,
        gt.coin_cost as amount,
        gt.created_at,
        'send' as type,
        'gift' as category,
        gt.gift_name,
        (SELECT username FROM users WHERE id = gt.recipient_id) as other_user
      FROM gift_transactions gt
      WHERE gt.sender_id = $1
    `, [userId]);

    // Get gift received transactions
    const giftReceivedResult = await pool.query(`
      SELECT 
        ge.id,
        ge.user_share as amount,
        ge.created_at,
        'receive' as type,
        'gift' as category,
        ge.gift_name,
        ge.sender_username as other_user
      FROM gift_earnings ge
      WHERE ge.user_id = $1
    `, [userId]);

    // Combine all transactions
    const allTransactions = [
      ...transfersResult.rows.map(row => ({
        id: `transfer_${row.id}`,
        amount: row.amount,
        type: row.type,
        category: row.category,
        otherUser: row.other_user,
        description: row.type === 'send' ? 'Transfer Terkirim' : 'Transfer Diterima',
        createdAt: row.created_at
      })),
      ...gameResult.rows.map(row => ({
        id: `game_${row.id}`,
        amount: row.amount,
        type: row.type === 'game_bet' ? 'send' : 'receive',
        category: row.category,
        otherUser: 'LowCard Game',
        description: row.type === 'game_bet' ? 'Game Bet' : row.type === 'game_win' ? 'Game Menang' : 'Game Refund',
        createdAt: row.created_at
      })),
      ...giftSentResult.rows.map(row => ({
        id: `gift_sent_${row.id}`,
        amount: row.amount,
        type: row.type,
        category: row.category,
        otherUser: row.other_user,
        description: `Gift: ${row.gift_name}`,
        createdAt: row.created_at
      })),
      ...giftReceivedResult.rows.map(row => ({
        id: `gift_received_${row.id}`,
        amount: row.amount,
        type: row.type,
        category: row.category,
        otherUser: row.other_user,
        description: `Gift: ${row.gift_name}`,
        createdAt: row.created_at
      }))
    ];

    // Sort by date descending and limit to 100 transactions
    const transactions = allTransactions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 100);

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
        from_user_id: req.user?.userId,
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
        req.user.userId,
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
    const fromUserId = req.user.userId;

    if (!toUsername || !amount || !pin) {
      return res.status(400).json({ error: 'Username, amount, and PIN are required' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    // Verify user role and PIN
    const userResult = await pool.query('SELECT pin, role FROM users WHERE id = $1', [fromUserId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userRole = userResult.rows[0].role;

    // SECURITY: Only mentor and merchant roles can transfer credits
    if (userRole !== 'mentor' && userRole !== 'merchant') {
      return res.status(403).json({ 
        error: 'Only mentor and merchant users can transfer credits' 
      });
    }

    // SECURITY: Require PIN to be set - no fallback allowed
    if (!userResult.rows[0].pin) {
      return res.status(400).json({ 
        error: 'PIN not set. Please set your PIN in profile settings before transferring credits.' 
      });
    }

    const userPin = userResult.rows[0].pin;
    
    // Verify PIN (TODO: Migrate to bcrypt hashing for production security)
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
      // CRITICAL FIX: Use FOR UPDATE lock to prevent race conditions
      const balanceResult = await pool.query(
        'SELECT balance FROM user_credits WHERE user_id = $1 FOR UPDATE', 
        [fromUserId]
      );
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

      // Add to receiver using UPSERT to prevent race conditions
      await pool.query(`
        INSERT INTO user_credits (user_id, balance, updated_at) 
        VALUES ($1, $2, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) 
        DO UPDATE SET balance = user_credits.balance + $2, updated_at = CURRENT_TIMESTAMP
      `, [toUserId, amount]);

      // Record transaction
      await pool.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type)
        VALUES ($1, $2, $3, 'transfer')
      `, [fromUserId, toUserId, amount]);

      await pool.query('COMMIT');

      // AUTO-DETECT: Check if this transfer should count as merchant top up
      // (Mentor transfers to merchant they promoted = merchant top up)
      try {
        const senderRole = userRole; // from earlier query
        
        if (senderRole === 'mentor') {
          // Check if receiver is a merchant promoted by this mentor
          const merchantCheck = await pool.query(
            'SELECT user_id, monthly_topup FROM merchant_promotions WHERE user_id = $1 AND promoted_by = $2 AND status = $3',
            [toUserId, fromUserId, 'active']
          );
          
          if (merchantCheck.rows.length > 0) {
            // This is a merchant top up! Record it
            const monthYear = new Date().toISOString().slice(0, 7); // YYYY-MM
            
            await pool.query(`
              INSERT INTO merchant_topups (merchant_id, mentor_id, amount, description, month_year)
              VALUES ($1, $2, $3, $4, $5)
            `, [toUserId, fromUserId, amount, 'Mentor top up to merchant', monthYear]);
            
            // Update monthly topup tracking
            await pool.query(`
              UPDATE merchant_promotions 
              SET monthly_topup = COALESCE(monthly_topup, 0) + $1 
              WHERE user_id = $2
            `, [amount, toUserId]);
            
            console.log(`✅ Auto-detected merchant top up: Mentor ${fromUserId} → Merchant ${toUserId} (${amount} coins)`);
          }
        }
      } catch (topupError) {
        console.error('Error auto-detecting merchant topup:', topupError);
        // Don't fail the transfer if topup detection fails
      }

      // Create notification for credit transfer
      const senderUsername = req.user.username;
      const notification = await notificationRouter.sendNotification(
        toUserId,
        'credit_received',
        'Credit Received',
        `You received ${amount} credits from ${senderUsername}`,
        { senderId: fromUserId, senderUsername, amount }
      );

      // Emit real-time notification via gateway
      if (notification) {
        try {
          await fetch(`${GATEWAY_URL}/emit-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: toUserId,
              notification: {
                id: notification.id,
                type: 'credit_received',
                title: 'Credit Received',
                message: `You received ${amount} credits from ${senderUsername}`,
                data: { senderId: fromUserId, senderUsername, amount },
                isRead: false,
                createdAt: notification.created_at
              }
            })
          });
          console.log(`💰 Credit notification sent to user ${toUserId}`);
        } catch (error) {
          console.error('Error emitting notification:', error);
        }
      }

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

router.post('/call-interval-charge', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount, receiverId } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    await pool.query('BEGIN');

    try {
      const balanceResult = await pool.query(
        'SELECT balance FROM user_credits WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      
      if (balanceResult.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'User credit account not found' });
      }

      const currentBalance = balanceResult.rows[0].balance;

      if (currentBalance < amount) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ 
          error: 'Insufficient balance', 
          required: amount,
          current: currentBalance 
        });
      }

      const newBalance = currentBalance - amount;
      await pool.query(
        'UPDATE user_credits SET balance = $1, updated_at = NOW() WHERE user_id = $2',
        [newBalance, userId]
      );

      await pool.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
        VALUES ($1, $2, $3, 'video_call_charge', 'Video call charge (interval)')
      `, [userId, receiverId, amount]);

      await pool.query('COMMIT');

      console.log(`📹 User ${userId} charged ${amount} coins for video call interval. New balance: ${newBalance}`);

      res.json({ 
        success: true, 
        deducted: amount, 
        newBalance: newBalance
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error deducting call payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/call-finalize', authenticateToken, async (req, res) => {
  try {
    const callerId = req.user.userId;
    const { receiverId, totalAmount, duration } = req.body;

    if (!receiverId || !totalAmount || totalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    await pool.query('BEGIN');

    try {
      const receiverEarnings = Math.floor(totalAmount * 0.3);

      // Add earnings to receiver using UPSERT to prevent race conditions
      await pool.query(`
        INSERT INTO user_credits (user_id, balance, withdraw_balance, updated_at) 
        VALUES ($1, 0, $2, NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET withdraw_balance = user_credits.withdraw_balance + $2, updated_at = NOW()
      `, [receiverId, receiverEarnings]);

      await pool.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
        VALUES ($1, $2, $3, 'video_call_earning', $4)
      `, [callerId, receiverId, receiverEarnings, `Video call earning (${duration}s call, 30% of ${totalAmount} coins)`]);

      await pool.query('COMMIT');

      console.log(`📹 Call finalized: Caller ${callerId} paid ${totalAmount} coins, receiver ${receiverId} earned ${receiverEarnings} coins (30%)`);

      res.json({ 
        success: true, 
        totalCharged: totalAmount,
        receiverEarnings: receiverEarnings,
        message: 'Call payment finalized successfully' 
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error finalizing call payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ADMIN: Top up to mentor (mentor RECEIVES from system)
// System transfers coins to mentor, counts as mentor monthly top up (7M/month requirement)
router.post('/admin/topup-mentor', authenticateToken, rateLimit(10, 60000), async (req, res) => {
  try {
    const adminId = req.user.userId;
    const { mentorId, amount } = req.body;

    if (!mentorId || !amount) {
      return res.status(400).json({ error: 'Mentor ID and amount required' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }

    // Verify admin role
    const adminCheck = await pool.query('SELECT role FROM users WHERE id = $1', [adminId]);
    
    if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can top up mentors' });
    }

    await pool.query('BEGIN');

    try {
      // Verify mentor status
      const mentorCheck = await pool.query(
        'SELECT u.role FROM users u WHERE u.id = $1',
        [mentorId]
      );

      if (mentorCheck.rows.length === 0) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'Mentor not found' });
      }

      if (mentorCheck.rows[0].role !== 'mentor') {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'User is not a mentor' });
      }

      // Add to mentor balance using UPSERT (mentor RECEIVES from system)
      await pool.query(`
        INSERT INTO user_credits (user_id, balance, updated_at) 
        VALUES ($1, $2, NOW())
        ON CONFLICT (user_id) 
        DO UPDATE SET balance = user_credits.balance + $2, updated_at = NOW()
      `, [mentorId, amount]);

      // Record topup from system to mentor
      const monthYear = new Date().toISOString().slice(0, 7); // YYYY-MM
      await pool.query(`
        INSERT INTO mentor_topups (mentor_id, amount, description, month_year)
        VALUES ($1, $2, $3, $4)
      `, [mentorId, amount, 'System top up to mentor', monthYear]);

      // Update monthly topup tracking
      await pool.query(`
        UPDATE mentor_promotions 
        SET monthly_topup = COALESCE(monthly_topup, 0) + $1 
        WHERE user_id = $2
      `, [amount, mentorId]);

      // Record credit transaction for history
      await pool.query(`
        INSERT INTO credit_transactions (from_user_id, to_user_id, amount, type, description)
        VALUES ($1, $2, $3, 'admin_topup', $4)
      `, [adminId, mentorId, amount, `System top up ${amount} coins to mentor`]);

      await pool.query('COMMIT');

      console.log(`💰 Admin ${adminId} topped up ${amount} to mentor ${mentorId} (mentor RECEIVES)`);

      res.json({ 
        success: true, 
        message: `Successfully topped up ${amount} coins to mentor`,
        monthlyProgress: await getMentorTopupProgress(mentorId)
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error in admin mentor topup:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get merchant topup progress
async function getMerchantTopupProgress(merchantId) {
  const result = await pool.query(
    'SELECT monthly_topup, topup_requirement FROM merchant_promotions WHERE user_id = $1',
    [merchantId]
  );
  
  if (result.rows.length > 0) {
    const { monthly_topup, topup_requirement } = result.rows[0];
    return {
      current: monthly_topup || 0,
      required: topup_requirement || 800000,
      percentage: Math.min(100, Math.floor(((monthly_topup || 0) / (topup_requirement || 800000)) * 100))
    };
  }
  
  return { current: 0, required: 800000, percentage: 0 };
}

// Get mentor topup progress
async function getMentorTopupProgress(mentorId) {
  const result = await pool.query(
    'SELECT monthly_topup, topup_requirement FROM mentor_promotions WHERE user_id = $1',
    [mentorId]
  );
  
  if (result.rows.length > 0) {
    const { monthly_topup, topup_requirement } = result.rows[0];
    return {
      current: monthly_topup || 0,
      required: topup_requirement || 7000000,
      percentage: Math.min(100, Math.floor(((monthly_topup || 0) / (topup_requirement || 7000000)) * 100))
    };
  }
  
  return { current: 0, required: 7000000, percentage: 0 };
}

// Get topup status endpoint
router.get('/topup/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const userCheck = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const role = userCheck.rows[0].role;
    
    if (role === 'merchant') {
      const progress = await getMerchantTopupProgress(userId);
      return res.json({ role: 'merchant', progress });
    } else if (role === 'mentor') {
      const progress = await getMentorTopupProgress(userId);
      return res.json({ role: 'mentor', progress });
    } else {
      return res.status(403).json({ error: 'Only merchants and mentors have topup requirements' });
    }
    
  } catch (error) {
    console.error('Error getting topup status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
