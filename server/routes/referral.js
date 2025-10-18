const express = require('express');
// const { Pool } = require('pg');
const pool = require( '../config/db.js');
const { authenticateToken } = require('./auth');

const router = express.Router();
// const pool = new Pool({
//   connectionString: process.env.DATABASE_URL,
//   ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
// });

// Generate unique invite code (8 characters: uppercase letters + numbers)
async function generateUniqueInviteCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let isUnique = false;
  
  while (!isUnique) {
    code = '';
    for (let i = 0; i < 8; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    
    // Check if code already exists
    const result = await pool.query('SELECT id FROM users WHERE invite_code = $1', [code]);
    if (result.rows.length === 0) {
      isUnique = true;
    }
  }
  
  return code;
}

// GET /api/referral/my-code - Get current user's invite code (auto-generate if not exists)
router.get('/my-code', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Check if user already has invite code
    const userResult = await pool.query(
      'SELECT invite_code FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    let inviteCode = userResult.rows[0].invite_code;

    // If no invite code, generate one
    if (!inviteCode) {
      inviteCode = await generateUniqueInviteCode();
      await pool.query(
        'UPDATE users SET invite_code = $1 WHERE id = $2',
        [inviteCode, userId]
      );
      console.log(`✅ Generated invite code for user ${userId}: ${inviteCode}`);
    }

    res.json({ inviteCode });
  } catch (error) {
    console.error('Error getting invite code:', error);
    res.status(500).json({ error: 'Failed to get invite code' });
  }
});

// GET /api/referral/stats - Get referral statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get total referrals and bonus claimed
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_referrals,
        COUNT(*) FILTER (WHERE bonus_claimed = true) as successful_referrals,
        COALESCE(SUM(bonus_amount) FILTER (WHERE bonus_claimed = true), 0) as total_bonus_earned
      FROM user_referrals
      WHERE referrer_id = $1
    `, [userId]);

    const stats = statsResult.rows[0];

    res.json({
      stats: {
        totalInvited: parseInt(stats.total_referrals) || 0,
        totalBonusEarned: parseInt(stats.total_bonus_earned) || 0,
        pendingBonus: (parseInt(stats.total_referrals) || 0) - (parseInt(stats.successful_referrals) || 0)
      }
    });
  } catch (error) {
    console.error('Error getting referral stats:', error);
    res.status(500).json({ error: 'Failed to get referral stats' });
  }
});

// GET /api/referral/history - Get referral history
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const historyResult = await pool.query(`
      SELECT 
        id,
        invited_username,
        bonus_amount,
        bonus_claimed,
        first_withdrawal_completed,
        created_at,
        bonus_claimed_at
      FROM user_referrals
      WHERE referrer_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId]);

    const referrals = historyResult.rows.map(row => ({
      id: row.id,
      invitedUsername: row.invited_username,
      bonusAmount: row.bonus_amount,
      bonusClaimed: row.bonus_claimed,
      firstWithdrawalCompleted: row.first_withdrawal_completed,
      status: row.bonus_claimed ? 'completed' : (row.first_withdrawal_completed ? 'processing' : 'pending'),
      invitedAt: row.created_at,
      bonusClaimedAt: row.bonus_claimed_at
    }));

    res.json({ referrals });
  } catch (error) {
    console.error('Error getting referral history:', error);
    res.status(500).json({ error: 'Failed to get referral history' });
  }
});

module.exports = router;
