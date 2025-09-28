
const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('./auth');

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Get exchange rate
router.get('/exchange-rate', async (req, res) => {
  try {
    // In a real application, you would fetch this from a financial API
    const exchangeRate = {
      usdToIdr: 15500, // Example rate
      minWithdrawCoins: 155000, // Minimum coins for withdrawal (equivalent to $10 USD)
      timestamp: new Date().toISOString()
    };

    res.json(exchangeRate);
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    res.status(500).json({ error: 'Failed to fetch exchange rate' });
  }
});

// Get user's gift earnings balance
router.get('/user/gift-earnings-balance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get gift earnings balance
    const balanceResult = await pool.query(`
      SELECT balance, total_earned
      FROM user_gift_earnings_balance 
      WHERE user_id = $1
    `, [userId]);

    let balance = 0;
    let totalEarned = 0;

    if (balanceResult.rows.length > 0) {
      balance = balanceResult.rows[0].balance || 0;
      totalEarned = balanceResult.rows[0].total_earned || 0;
    }

    // Get total withdrawn amount
    const withdrawnResult = await pool.query(`
      SELECT COALESCE(SUM(amount_coins), 0) as total_withdrawn
      FROM withdrawal_requests 
      WHERE user_id = $1 AND status = 'completed'
    `, [userId]);

    const totalWithdrawn = parseInt(withdrawnResult.rows[0]?.total_withdrawn || 0);

    // Calculate USD equivalent (1 coin = 1 IDR, 15500 IDR = 1 USD)
    const exchangeRate = 15500;
    const balanceUSD = balance / exchangeRate;

    // Check if user can withdraw (minimum 155,000 coins = $10 USD)
    const minWithdrawCoins = 155000;
    const canWithdraw = balance >= minWithdrawCoins;

    res.json({
      balance,
      totalEarned,
      totalWithdrawn,
      balanceUSD: parseFloat(balanceUSD.toFixed(2)),
      canWithdraw
    });

  } catch (error) {
    console.error('Error fetching gift earnings balance:', error);
    res.status(500).json({ error: 'Failed to fetch gift earnings balance' });
  }
});

// Get user's linked accounts
router.get('/user/linked-accounts', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT id, account_type, account_name, account_number, holder_name, created_at
      FROM user_linked_accounts 
      WHERE user_id = $1 AND is_active = true
      ORDER BY created_at DESC
    `, [userId]);

    const accounts = result.rows.map(row => ({
      id: row.id.toString(),
      type: row.account_type,
      name: row.account_name,
      accountNumber: row.account_number,
      accountName: row.holder_name,
      createdAt: row.created_at
    }));

    res.json({ accounts });

  } catch (error) {
    console.error('Error fetching linked accounts:', error);
    res.status(500).json({ error: 'Failed to fetch linked accounts' });
  }
});

// Link a new account
router.post('/user/link-account', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { accountId, accountName, accountNumber, holderName, type } = req.body;

    if (!accountId || !accountName || !accountNumber || !holderName || !type) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (!['bank', 'ewallet'].includes(type)) {
      return res.status(400).json({ error: 'Invalid account type' });
    }

    // Create user_linked_accounts table if not exists
    await pool.query(`
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

    // Check if account already exists
    const existingAccount = await pool.query(`
      SELECT id FROM user_linked_accounts 
      WHERE user_id = $1 AND account_number = $2 AND is_active = true
    `, [userId, accountNumber]);

    if (existingAccount.rows.length > 0) {
      return res.status(400).json({ error: 'Account already linked' });
    }

    // Insert new account
    const result = await pool.query(`
      INSERT INTO user_linked_accounts 
      (user_id, account_type, account_id, account_name, account_number, holder_name)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [userId, type, accountId, accountName, accountNumber, holderName]);

    const newAccount = result.rows[0];

    res.json({
      success: true,
      message: 'Account linked successfully',
      account: {
        id: newAccount.id.toString(),
        type: newAccount.account_type,
        name: newAccount.account_name,
        accountNumber: newAccount.account_number,
        accountName: newAccount.holder_name
      }
    });

  } catch (error) {
    console.error('Error linking account:', error);
    res.status(500).json({ error: 'Failed to link account' });
  }
});

// Submit withdrawal request
router.post('/user/withdraw', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount, accountId, currency = 'USD' } = req.body;

    if (!amount || !accountId) {
      return res.status(400).json({ error: 'Amount and account ID are required' });
    }

    if (amount < 10) {
      return res.status(400).json({ error: 'Minimum withdrawal is $10 USD' });
    }

    // Get user's gift earnings balance
    const balanceResult = await pool.query(`
      SELECT balance FROM user_gift_earnings_balance WHERE user_id = $1
    `, [userId]);

    if (balanceResult.rows.length === 0) {
      return res.status(400).json({ error: 'No gift earnings balance found' });
    }

    const currentBalance = balanceResult.rows[0].balance || 0;
    const exchangeRate = 15500; // 1 USD = 15500 IDR
    const requiredCoins = amount * exchangeRate;

    if (currentBalance < requiredCoins) {
      return res.status(400).json({ 
        error: 'Insufficient gift earnings balance',
        required: requiredCoins,
        available: currentBalance
      });
    }

    // Verify linked account exists
    const accountResult = await pool.query(`
      SELECT * FROM user_linked_accounts 
      WHERE id = $1 AND user_id = $2 AND is_active = true
    `, [accountId, userId]);

    if (accountResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid account ID' });
    }

    const linkedAccount = accountResult.rows[0];

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Create withdrawal_requests table if not exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS withdrawal_requests (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          amount_usd DECIMAL(10,2) NOT NULL,
          amount_coins INTEGER NOT NULL,
          account_id INTEGER NOT NULL,
          account_type VARCHAR(20) NOT NULL,
          account_details JSONB NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          fee_percentage DECIMAL(5,2) DEFAULT 3.0,
          net_amount_idr DECIMAL(12,2) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          processed_at TIMESTAMP,
          notes TEXT
        )
      `);

      // Calculate amounts
      const amountCoins = Math.floor(amount * exchangeRate);
      const grossAmountIdr = amount * exchangeRate;
      const feePercentage = 3.0; // 3% fee
      const netAmountIdr = grossAmountIdr * (1 - feePercentage / 100);

      // Insert withdrawal request
      const withdrawalResult = await pool.query(`
        INSERT INTO withdrawal_requests 
        (user_id, amount_usd, amount_coins, account_id, account_type, account_details, net_amount_idr)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        userId, 
        amount, 
        amountCoins, 
        accountId, 
        linkedAccount.account_type,
        JSON.stringify({
          accountName: linkedAccount.account_name,
          accountNumber: linkedAccount.account_number,
          holderName: linkedAccount.holder_name
        }),
        netAmountIdr
      ]);

      // Deduct from gift earnings balance
      await pool.query(`
        UPDATE user_gift_earnings_balance 
        SET balance = balance - $1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $2
      `, [amountCoins, userId]);

      await pool.query('COMMIT');

      const withdrawal = withdrawalResult.rows[0];

      res.json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        withdrawal: {
          id: withdrawal.id.toString(),
          amountUsd: withdrawal.amount_usd,
          amountCoins: withdrawal.amount_coins,
          netAmountIdr: withdrawal.net_amount_idr,
          status: withdrawal.status,
          createdAt: withdrawal.created_at
        }
      });

    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

// Get withdrawal history
router.get('/withdrawals/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT * FROM withdrawal_requests 
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [userId]);

    const withdrawals = result.rows.map(row => ({
      id: row.id.toString(),
      amountUsd: parseFloat(row.amount_usd),
      amountCoins: row.amount_coins,
      netAmountIdr: parseFloat(row.net_amount_idr),
      status: row.status,
      accountType: row.account_type,
      accountDetails: row.account_details,
      createdAt: row.created_at,
      processedAt: row.processed_at,
      notes: row.notes
    }));

    res.json({ withdrawals });

  } catch (error) {
    console.error('Error fetching withdrawal history:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal history' });
  }
});

module.exports = router;
